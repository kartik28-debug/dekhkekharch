"""
auth.py — Password hashing (Argon2) and JWT utilities.

Security rules enforced here:
  - Passwords hashed with Argon2id (state-of-the-art).
  - JWT signed with HS256; secret from environment.
  - Tokens carry roll_number as 'sub'; no password or hash ever enters a token.
  - Timing-safe verification via passlib (constant-time compare).
  - Passwords and hashes are NEVER logged anywhere in this file.
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

# ─── Argon2 password context ────────────────────────────────────────────────

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")


def hash_password(plain: str) -> str:
    """Return the Argon2 hash of *plain*. Never log the input or output."""
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """
    Constant-time verify *plain* against *hashed*.
    Returns False (not an exception) on mismatch — caller decides response.
    """
    return pwd_context.verify(plain, hashed)


# ─── JWT settings ────────────────────────────────────────────────────────────

_SECRET_KEY: str = os.environ["JWT_SECRET_KEY"]
_ALGORITHM = "HS256"
_ACCESS_TOKEN_EXPIRE_MINUTES = int(
    os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "60")
)


def create_access_token(data: dict[str, Any]) -> str:
    """
    Issue a JWT with an 'exp' claim.  *data* must include 'sub' = roll_number.
    Do NOT include any password, hash, or credential in *data*.
    """
    payload = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=_ACCESS_TOKEN_EXPIRE_MINUTES)
    payload["exp"] = expire
    return jwt.encode(payload, _SECRET_KEY, algorithm=_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    """
    Decode and validate a JWT.
    Raises jose.JWTError on any failure (expired, tampered, wrong key).
    """
    return jwt.decode(token, _SECRET_KEY, algorithms=[_ALGORITHM])
