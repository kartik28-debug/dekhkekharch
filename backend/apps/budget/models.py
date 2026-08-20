"""
Budget app models.

Three tables:
  1. MonthlyAllocation  — one row per user per (month, year); stores salary,
                          mode, and the 4 bucket ratios.
  2. BucketBalance      — one row per bucket per allocation; the stored current
                          balance updated atomically on every transaction.
  3. BucketTransaction  — append-only audit log of every money movement.

NFR-3: All monetary fields use DecimalField(max_digits=12, decimal_places=2).
Architecture §11: All money-movement MUST use transaction.atomic().
"""

from django.conf import settings
from django.db import models


class MonthlyAllocation(models.Model):
    """
    Records the salary and bucket ratios chosen by the user for a given month.

    One and only one record exists per (user, month, year).  Once is_locked is
    True ('Start Month' has been pressed), salary and mode changes are applied
    to the NEXT month's allocation (forward-only rule, requirement §2).
    """

    MODE_CHOICES = [
        ("focused", "Focused"),
        ("balanced", "Balanced"),
        ("custom", "Custom"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="monthly_allocations",
    )
    month = models.IntegerField(help_text="1–12")
    year = models.IntegerField()

    salary = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        help_text="Monthly gross salary in INR.",
    )
    mode = models.CharField(max_length=10, choices=MODE_CHOICES)

    # Stored ratios — percentages (0–100, sum = 100)
    ratio_major = models.DecimalField(max_digits=5, decimal_places=2)
    ratio_dsl = models.DecimalField(max_digits=5, decimal_places=2)
    ratio_savings = models.DecimalField(max_digits=5, decimal_places=2)
    ratio_emergency = models.DecimalField(max_digits=5, decimal_places=2)

    is_locked = models.BooleanField(
        default=False,
        help_text=(
            "Set to True when the user clicks 'Start Month'. "
            "Once True, no further changes are allowed for this month."
        ),
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("user", "month", "year")
        ordering = ["-year", "-month"]
        verbose_name = "Monthly Allocation"
        verbose_name_plural = "Monthly Allocations"

    def __str__(self) -> str:
        return (
            f"{self.user.email} — {self.month:02d}/{self.year} "
            f"[{self.mode}] {'🔒' if self.is_locked else '🔓'}"
        )

    @property
    def allocated_major(self):
        return (self.salary * self.ratio_major / 100).quantize(
            __import__("decimal").Decimal("0.01")
        )

    @property
    def allocated_dsl(self):
        return (self.salary * self.ratio_dsl / 100).quantize(
            __import__("decimal").Decimal("0.01")
        )

    @property
    def allocated_savings(self):
        return (self.salary * self.ratio_savings / 100).quantize(
            __import__("decimal").Decimal("0.01")
        )

    @property
    def allocated_emergency(self):
        return (self.salary * self.ratio_emergency / 100).quantize(
            __import__("decimal").Decimal("0.01")
        )


class BucketBalance(models.Model):
    """
    Stored current balance for one bucket within one monthly allocation.

    current_balance is a STORED field — updated immediately via atomic
    transfers whenever a transaction touches the bucket.  It is NEVER
    recalculated from scratch on page load (requirement §3).
    """

    BUCKET_CHOICES = [
        ("major", "Major Expenses"),
        ("dsl", "Dynamic Spend Limit"),
        ("savings", "Savings"),
        ("emergency", "Emergency Fund"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="bucket_balances",
    )
    bucket_type = models.CharField(max_length=10, choices=BUCKET_CHOICES)
    current_balance = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        help_text=(
            "Stored current balance. Updated atomically via transfer_between_buckets(). "
            "DSL may go negative internally; UI floors it at ₹0 (requirement §4)."
        ),
    )
    allocation = models.ForeignKey(
        MonthlyAllocation,
        on_delete=models.CASCADE,
        related_name="bucket_balances",
    )

    class Meta:
        unique_together = ("user", "bucket_type", "allocation")
        verbose_name = "Bucket Balance"
        verbose_name_plural = "Bucket Balances"

    def __str__(self) -> str:
        return (
            f"{self.user.email} | {self.bucket_type} | "
            f"₹{self.current_balance} "
            f"({self.allocation.month:02d}/{self.allocation.year})"
        )


class BucketTransaction(models.Model):
    """
    Append-only audit log for every money movement between buckets.

    Rules:
    - NEVER delete rows; add a reversal row with a negative amount if needed.
    - source_bucket may be a sentinel string ('salary', 'external') for the
      initial salary allocation, or a real bucket_type for inter-bucket transfers.

    Used by:
    - Reports aggregation (future)
    - Debugging / reconciliation
    - Future ML feature engineering (spending patterns over time)
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="bucket_transactions",
    )
    # Source — either a real bucket_type or a sentinel ('salary', 'external')
    source_bucket = models.CharField(max_length=20)
    # Destination — always a real bucket_type
    destination_bucket = models.CharField(max_length=10)
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        help_text="Always positive. Reversals are separate rows with a negative amount.",
    )
    timestamp = models.DateTimeField(auto_now_add=True)
    reason = models.TextField(help_text="Human-readable description for the audit log.")
    allocation = models.ForeignKey(
        MonthlyAllocation,
        on_delete=models.CASCADE,
        related_name="bucket_transactions",
        null=True,
        blank=True,
    )

    class Meta:
        ordering = ["-timestamp"]
        verbose_name = "Bucket Transaction"
        verbose_name_plural = "Bucket Transactions"

    def __str__(self) -> str:
        return (
            f"{self.source_bucket} → {self.destination_bucket} "
            f"₹{self.amount} @ {self.timestamp:%Y-%m-%d %H:%M}"
        )


class SavingsGoalAllocation(models.Model):
    """
    Stores the user's decision on how much of their Savings bucket goes to
    Goals vs. Stocks for a given monthly allocation.

    One row per (user, allocation). `goal_amount` is user-entered; the
    implicit stocks_amount = savings_balance − goal_amount and is computed
    on the frontend from the live BucketBalance.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="savings_goal_allocations",
    )
    allocation = models.ForeignKey(
        MonthlyAllocation,
        on_delete=models.CASCADE,
        related_name="savings_goal_allocations",
    )
    goal_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        help_text="How much of the Savings bucket the user earmarks for Goals.",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("user", "allocation")
        verbose_name = "Savings Goal Allocation"
        verbose_name_plural = "Savings Goal Allocations"

    def __str__(self) -> str:
        return (
            f"{self.user.email} — "
            f"{self.allocation.month:02d}/{self.allocation.year} "
            f"→ Goals: ₹{self.goal_amount}"
        )


class Goal(models.Model):
    """
    A user-defined savings goal (global, not month-scoped).

    Goals span multiple months (e.g. "Buy a laptop over 6 months").
    `priority` drives the FIFO auto-allocation order (lower = higher priority).
    `manual_amount` is set only in manual allocation mode; in auto mode it is
    ignored and the FIFO algorithm on the frontend fills goals top-down.
    """

    ALLOCATION_MODE_CHOICES = [
        ("manual", "Manual"),
        ("auto", "Auto (Priority-based)"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="goals",
    )
    name = models.CharField(max_length=200)
    target_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        help_text="The total amount needed for this goal.",
    )
    current_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        help_text="Amount already saved towards this goal.",
    )
    priority = models.PositiveIntegerField(
        default=0,
        help_text="Lower number = higher priority (filled first in auto mode).",
    )
    allocation_mode = models.CharField(
        max_length=10,
        choices=ALLOCATION_MODE_CHOICES,
        default="manual",
        help_text="Whether the user sets amounts manually or uses priority-based auto-fill.",
    )
    manual_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="User-specified amount for manual allocation mode. Null = auto leftover.",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["priority", "created_at"]
        verbose_name = "Goal"
        verbose_name_plural = "Goals"

    def __str__(self) -> str:
        return f"{self.user.email} — {self.name} (₹{self.target_amount})"
