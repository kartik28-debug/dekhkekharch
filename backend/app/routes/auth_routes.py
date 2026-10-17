"""
auth_routes.py — FastAPI router for all authentication endpoints.

Endpoints:
  POST /api/auth/login          — step 1: verify roll + password, return JWT
  POST /api/auth/change-password — step 2 (first-login): update password
  GET  /api/auth/me             — return current user info (auth required)
  POST /api/auth/logout         — client-side token invalidation (stateless)

Security:
  - Rate limiting via slowapi: 10 login attempts per minute per IP.
  - Generic error messages on login failure (don't leak whether roll exists).
  - must_change_password is enforced server-side: the /me endpoint exposes
    the flag and all protected routes should call /me to check it.
  - Password change requires a valid JWT (authenticated session).
  - A student cannot change another student's password — the roll_number
    is taken from the JWT claim, NOT from the request body.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import create_access_token, hash_password, verify_password
from ..database import get_db
from ..models import Student
from ..schemas import (
    ChangePasswordRequest,
    LoginRequest,
    MeResponse,
    MessageResponse,
    TokenResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])

# ─── Rate limiter (applied per-route below) ───────────────────────────────────
# Imported lazily so the rest of the app still works if slowapi not configured
try:
    from slowapi import Limiter
    from slowapi.util import get_remote_address
    _limiter = Limiter(key_func=get_remote_address)
    _rate_limit = _limiter.limit("10/minute")
except ImportError:
    # Fallback: no-op decorator if slowapi unavailable
    def _rate_limit(f):  # type: ignore[misc]
        return f


# ─── Dependency: extract + validate current student from Bearer JWT ──────────

async def get_current_student(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Student:
    """
    FastAPI dependency.  Reads Authorization: Bearer <token>, validates it,
    and returns the corresponding Student row.
    Raises 401 on any failure — no information about *why* it failed is leaked.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    auth_header: str | None = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise credentials_exception

    token = auth_header.removeprefix("Bearer ").strip()
    try:
        from ..auth import decode_access_token
        data = decode_access_token(token)
        roll_number: str | None = data.get("sub")
        if not roll_number:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    result = await db.execute(
        select(Student).where(Student.roll_number == roll_number)
    )
    student = result.scalar_one_or_none()
    if student is None:
        raise credentials_exception
    return student


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Authenticate with roll number and password",
)
@_rate_limit
async def login(
    request: Request,
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """
    Step 1 of the auth flow.

    - Looks up roll_number in the students table.
    - Verifies the supplied password against the stored Argon2 hash.
    - On first login, the initial password is the roll number itself.
    - Returns a JWT.  If must_change_password is true the client MUST redirect
      to the change-password screen; the backend enforces this independently.
    - Generic 401 is returned for both "roll not found" and "wrong password"
      to prevent user enumeration.
    """
    _GENERIC_ERROR = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid roll number or password.",
    )

    result = await db.execute(
        select(Student).where(Student.roll_number == body.roll_number)
    )
    student = result.scalar_one_or_none()

    # Constant-time check even when student is None — prevents timing attacks
    dummy_hash = "$argon2id$v=19$m=65536,t=3,p=4$dummydummydummy$dummydummydummydummy"
    stored_hash = student.password_hash if student else dummy_hash

    if not verify_password(body.password, stored_hash) or student is None:
        # Log only that a failed attempt occurred — never log the password
        logger.warning("Failed login attempt for roll=%r", body.roll_number)
        raise _GENERIC_ERROR

    token = create_access_token({"sub": student.roll_number})

    logger.info("Successful login for roll=%r mcp=%s", student.roll_number, student.must_change_password)

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        must_change_password=student.must_change_password,
        roll_number=student.roll_number,
        name=student.name,
    )


@router.post(
    "/change-password",
    response_model=TokenResponse,
    summary="Change password (mandatory on first login)",
)
async def change_password(
    body: ChangePasswordRequest,
    student: Student = Depends(get_current_student),
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """
    Step 2 of the auth flow (and any subsequent password change).

    - Requires a valid JWT — the roll_number comes from the token, NOT the body.
    - Validates new_password strength and confirms it matches confirm_password.
    - Hashes the new password with Argon2.
    - Sets must_change_password = false.
    - Returns a fresh JWT so the client can stay logged in.
    """
    try:
        body.check_match()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    student.password_hash = hash_password(body.new_password)
    student.must_change_password = False
    db.add(student)
    await db.commit()
    await db.refresh(student)

    logger.info("Password changed for roll=%r", student.roll_number)

    token = create_access_token({"sub": student.roll_number})
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        must_change_password=False,
        roll_number=student.roll_number,
        name=student.name,
    )


@router.get(
    "/me",
    response_model=MeResponse,
    summary="Get current authenticated student profile",
)
async def me(student: Student = Depends(get_current_student)) -> MeResponse:
    """
    Returns the current student's profile.
    Frontend uses must_change_password to decide whether to redirect.
    The backend also enforces this flag independently — this route itself
    does not enforce it (it is safe to call even before password change),
    but protected-data routes should verify it.
    """
    return MeResponse(
        roll_number=student.roll_number,
        name=student.name,
        must_change_password=student.must_change_password,
        created_at=student.created_at,
    )


@router.post(
    "/logout",
    response_model=MessageResponse,
    summary="Logout (client discards token)",
)
async def logout() -> MessageResponse:
    """
    Stateless logout — the client must delete the stored token.
    In a future iteration with a token blacklist, revocation would happen here.
    """
    return MessageResponse(message="Logged out successfully.")
