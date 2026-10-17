"""
schemas.py — Pydantic models for request/response validation.

Never expose password_hash in any response schema.
"""

from datetime import datetime

from pydantic import BaseModel, Field, field_validator


# ─── Request schemas ────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    roll_number: str = Field(..., min_length=1, max_length=50)
    password: str = Field(..., min_length=1)

    @field_validator("roll_number")
    @classmethod
    def strip_roll_number(cls, v: str) -> str:
        return v.strip()


class ChangePasswordRequest(BaseModel):
    new_password: str = Field(..., min_length=8, max_length=128)
    confirm_password: str = Field(..., min_length=1)

    @field_validator("new_password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long.")
        if v.isdigit():
            raise ValueError("Password cannot be all digits.")
        return v

    def check_match(self) -> None:
        """Call this in the route handler after construction."""
        if self.new_password != self.confirm_password:
            raise ValueError("Passwords do not match.")


# ─── Response schemas ────────────────────────────────────────────────────────

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    must_change_password: bool
    roll_number: str
    name: str


class MeResponse(BaseModel):
    roll_number: str
    name: str
    must_change_password: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class MessageResponse(BaseModel):
    message: str
