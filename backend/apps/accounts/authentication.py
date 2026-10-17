"""
FastAPI JWT Authentication class for Django REST Framework.

Validates the JWT access tokens issued by the FastAPI auth server on port 8001.
Reads JWT_SECRET_KEY and algorithm from environment variables.
Resolves student from shared Neon 'students' table and reconciles with Django User.
"""

import os
from jose import jwt, JWTError
from rest_framework import authentication, exceptions

from apps.accounts.models import Student, User


class FastAPIJWTAuthentication(authentication.BaseAuthentication):
    """
    Validates Bearer JWT tokens issued by FastAPI.
    Reconciles the authenticated student identity with Django's User model
    so that all foreign keys and financial queries remain strictly scoped.
    """

    def authenticate(self, request):
        auth_header = request.headers.get("Authorization")
        if not auth_header:
            return None  # Let DRF permission classes enforce IsAuthenticated -> 401

        parts = auth_header.split()
        if len(parts) != 2 or parts[0].lower() != "bearer":
            raise exceptions.AuthenticationFailed("Invalid Authorization header format. Expected 'Bearer <token>'.")

        token = parts[1]

        secret_key = os.environ.get("JWT_SECRET_KEY")
        if not secret_key:
            raise exceptions.AuthenticationFailed("Server configuration error: JWT_SECRET_KEY is missing.")

        algorithm = os.environ.get("JWT_ALGORITHM", "HS256")

        try:
            payload = jwt.decode(token, secret_key, algorithms=[algorithm])
        except JWTError as exc:
            raise exceptions.AuthenticationFailed(f"Invalid or expired token: {exc}")

        roll_number = payload.get("sub")
        if not roll_number:
            raise exceptions.AuthenticationFailed("Token is missing subject claim ('sub').")

        # Resolve student from shared Neon 'students' table
        try:
            student = Student.objects.get(roll_number=roll_number)
        except Student.DoesNotExist:
            raise exceptions.AuthenticationFailed("Student record not found for the provided token.")

        # Reconcile with Django User model
        # Username and roll_number map to student.roll_number
        user, _ = User.objects.get_or_create(
            username=student.roll_number,
            defaults={
                "roll_number": student.roll_number,
                "first_name": student.name,
                "email": f"{student.roll_number.lower()}@student.scamcoders.local",
                "is_active": True,
            },
        )

        # Synchronize updated fields if needed
        update_fields = []
        if user.roll_number != student.roll_number:
            user.roll_number = student.roll_number
            update_fields.append("roll_number")
        if user.first_name != student.name:
            user.first_name = student.name
            update_fields.append("first_name")
        if update_fields:
            user.save(update_fields=update_fields)

        # Attach student identity and metadata
        user.student = student
        user.must_change_password = student.must_change_password

        # Enforce mandatory password change before accessing financial endpoints
        if student.must_change_password:
            raise exceptions.PermissionDenied(
                detail="Password change required before accessing financial endpoints."
            )

        return (user, token)

    def authenticate_header(self, request):
        return "Bearer"
