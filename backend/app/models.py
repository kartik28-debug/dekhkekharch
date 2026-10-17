"""
models.py — SQLAlchemy ORM model for the students/users table.

Table: students
  id                 — serial primary key
  roll_number        — unique, not-null; used as login identifier
  name               — display name, populated from CSV import
  password_hash      — Argon2 hash; NEVER store plain-text here
  must_change_password — True until the student sets their own password
  created_at         — UTC timestamp on first insert
  updated_at         — UTC timestamp updated on every change
"""

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Student(Base):
    __tablename__ = "students"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    roll_number: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False)

    password_hash: Mapped[str] = mapped_column(String(512), nullable=False)

    must_change_password: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default="true",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_now,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_now,
        onupdate=_now,
    )

    def __repr__(self) -> str:
        return f"<Student roll={self.roll_number!r} mcp={self.must_change_password}>"
