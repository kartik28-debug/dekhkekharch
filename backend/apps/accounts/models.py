"""
Custom User model and Student model for the personal finance app.

User:
Extends AbstractUser so we keep Django's built-in auth machinery (groups,
permissions, admin) while adding app-specific fields:
  - roll_number          : links to the shared Neon students table
  - last_custom_ratio_*  : stores the user's last-used custom allocation
                            percentages so re-selecting 'Custom' mode
                            pre-fills the form (requirement §2).
  - is_onboarded         : tracks whether the user has completed onboarding.

Student:
Unmanaged Django model mapping directly to the shared Neon 'students' table
provisioned and managed by FastAPI and import_students.py.
"""

from decimal import Decimal

from django.contrib.auth.models import AbstractUser
from django.db import models


import sys

class Student(models.Model):
    """
    Django model mapping to the shared Neon 'students' table.
    In dev/prod against Neon, table is unmanaged (provisioned by FastAPI/SQLAlchemy).
    In Django test runner, managed=True so the isolated test database creates the table.
    """
    roll_number = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=200)
    password_hash = models.CharField(max_length=512)
    must_change_password = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = "test" in sys.argv
        db_table = "students"

    def __str__(self) -> str:
        return f"{self.roll_number} ({self.name})"


class User(AbstractUser):
    # email is the primary identifier; username kept for Django admin
    email = models.EmailField(unique=True)

    roll_number = models.CharField(
        max_length=50,
        unique=True,
        null=True,
        blank=True,
        db_index=True,
        help_text="Student roll number linking to Neon students table.",
    )

    # Onboarding state (architecture.md §5 — accounts_user table)
    is_onboarded = models.BooleanField(default=False)

    # ------------------------------------------------------------------
    # Last-used Custom ratio values (requirement §2 — pre-fill)
    # All nullable: only populated after the user has submitted Custom once.
    # ------------------------------------------------------------------
    last_custom_ratio_major = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Last custom % allocated to Major Expenses bucket.",
    )
    last_custom_ratio_dsl = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Last custom % allocated to DSL bucket.",
    )
    last_custom_ratio_savings = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Last custom % allocated to Savings bucket.",
    )
    last_custom_ratio_emergency = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Last custom % allocated to Emergency Fund bucket.",
    )

    def __str__(self) -> str:
        if self.roll_number:
            return f"{self.roll_number} ({self.email})"
        return self.email

    @property
    def last_custom_ratios(self) -> dict[str, Decimal] | None:
        """
        Returns the last-used custom ratio dict, or None if never set.
        Convenience property for the serializer pre-fill logic.
        """
        if self.last_custom_ratio_major is None:
            return None
        return {
            "major": self.last_custom_ratio_major,
            "dsl": self.last_custom_ratio_dsl,
            "savings": self.last_custom_ratio_savings,
            "buffer_reserve": self.last_custom_ratio_emergency,
        }
