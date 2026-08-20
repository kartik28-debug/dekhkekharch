"""
Custom User model for the personal finance app.

Extends AbstractUser so we keep Django's built-in auth machinery (groups,
permissions, admin) while adding app-specific fields.

Fields added beyond AbstractUser:
  - last_custom_ratio_*  : stores the user's last-used custom allocation
                            percentages so re-selecting 'Custom' mode
                            pre-fills the form (requirement §2).
  - is_onboarded         : tracks whether the user has completed onboarding.
"""

from decimal import Decimal

from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    # email is the primary identifier; username kept for Django admin
    email = models.EmailField(unique=True)

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
            "emergency": self.last_custom_ratio_emergency,
        }
