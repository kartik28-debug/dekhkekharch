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
        ("buffer_reserve", "Buffer Reserve"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="bucket_balances",
    )
    bucket_type = models.CharField(max_length=16, choices=BUCKET_CHOICES)
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
    # Destination — a real bucket_type or a sentinel ('external')
    destination_bucket = models.CharField(max_length=20)
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


class DailyExpenseLog(models.Model):
    """
    Append-only log of expenses recorded against the Smart Budget (DSL) bucket.

    Key design decisions
    ---------------------
    - expense_date is the CALENDAR DATE the expense actually happened (user-supplied,
      NOT auto_now_add). This enables retroactive logging (Edge Case 4 of the Weekly
      Checkpoint model): the frontend compares expense_date with the closed week's
      date range to detect late entries.

    - is_late_adjustment = True when the expense belongs to a week that has already
      been recalculated. The engine applies a delta correction on the CURRENT state
      rather than replaying all subsequent weeks.

    - late_adjustment_note is a human-readable explanation generated by the frontend,
      e.g. "Late entry for Week 1 — applied as -500 adjustment to current Smart Budget."
      This ensures recalculations are never invisible to the user.

    - No delete policy: reversals must be separate positive entries with a note
      (consistent with BucketTransaction).
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="daily_expense_logs",
    )
    allocation = models.ForeignKey(
        MonthlyAllocation,
        on_delete=models.CASCADE,
        related_name="daily_expense_logs",
        help_text="The monthly allocation this expense is charged against.",
    )
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        help_text="Amount spent. Must be > 0.",
    )
    description = models.CharField(
        max_length=200,
        blank=True,
        default="",
        help_text="Optional label (e.g. 'Zomato', 'Uber').",
    )
    expense_date = models.DateField(
        help_text="Calendar date the expense belongs to (user-supplied, NOT auto_now_add).",
    )
    is_late_adjustment = models.BooleanField(
        default=False,
        help_text="True when logged after the week it belongs to has already been recalculated.",
    )
    late_adjustment_note = models.TextField(
        blank=True,
        default="",
        help_text="Human-readable explanation of the late adjustment (generated by frontend).",
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        help_text="When this record was created (may differ from expense_date for late entries).",
    )

    class Meta:
        ordering = ["-expense_date", "-created_at"]
        verbose_name = "Daily Expense Log"
        verbose_name_plural = "Daily Expense Logs"

    def __str__(self) -> str:
        late = " [LATE]" if self.is_late_adjustment else ""
        return (
            f"{self.user.email} — {self.amount} on {self.expense_date}{late}"
            f" ({self.allocation.month:02d}/{self.allocation.year})"
        )


# ===========================================================================
# Smart Budgeting — Weekly Checkpoint State Machine Models
# ===========================================================================

class SmartBudgetState(models.Model):
    """
    Single source of truth for the Smart Budget weekly checkpoint state machine.

    One row per (user, allocation). The engine reads and writes this row
    atomically on every relevant event (expense add/edit/delete, week-end,
    month-end).

    Key fields
    ----------
    smart_budget_expense
        The current remaining budget pool. Starts at the DSL bucket allocation
        and shrinks as weeks are settled. May go negative (Edge Case 3).

    weekly_expense
        Running total of expenses in the CURRENT (unsettled) active week.
        Reset to 0 at every week-end settlement.

    monthly_expense
        Accumulated surplus/deficit across already-settled weeks.
        Positive = surplus carried forward. Negative = deficit to settle at month-end.

    dsl / wsl
        Stored computed values. DSL is fixed for the active week (only recalculated
        at week-end). WSL = smart_budget_expense / remaining_weeks.

    week_number
        Which calendar week within the month is currently active (1-based).

    week_start_date
        The start date of the CURRENT active week. Used to determine which
        DailyExpenseEntry rows belong to the current vs. past weeks.

    month_start_date
        When the user started (handles Edge Case 7: mid-month start).
        Determines remaining_days correctly on the first week.

    is_exhausted
        True when smart_budget_expense <= 0 (Edge Case 3: massive overspend).
        UI shows a freeze banner and floors DSL/WSL display at Rs 0.

    is_month_settled
        True once month-end settlement is complete. State becomes read-only.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="smart_budget_states",
    )
    allocation = models.OneToOneField(
        MonthlyAllocation,
        on_delete=models.CASCADE,
        related_name="smart_budget_state",
    )

    # The main budget pool
    smart_budget_expense = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    # Week-level running delta (resets each week-end)
    weekly_expense = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    # Month-level accumulated surplus/deficit across settled weeks
    monthly_expense = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    # Computed and stored so the Dashboard can read them without recomputing
    dsl = models.DecimalField(max_digits=12, decimal_places=2, default=0,
        help_text="Daily Spend Limit — fixed for the active week, recalculated at week-end.")
    wsl = models.DecimalField(max_digits=12, decimal_places=2, default=0,
        help_text="Weekly Spend Limit = smart_budget_expense / remaining_weeks.")

    # Week tracking
    week_number = models.PositiveIntegerField(default=1,
        help_text="Which calendar week within the month is currently active (1-based).")
    week_start_date = models.DateField(
        help_text="Start date of the currently active (unsettled) week.")
    month_start_date = models.DateField(
        help_text="When the user started; may be mid-month (Edge Case 7).")

    # State flags
    is_exhausted = models.BooleanField(default=False,
        help_text="True when smart_budget_expense <= 0 (Edge Case 3).")
    is_month_settled = models.BooleanField(default=False,
        help_text="True once month-end settlement is complete.")

    # Outstanding deficit carry-forward (Edge Case 1: partial settlement)
    outstanding_deficit = models.DecimalField(max_digits=12, decimal_places=2, default=0,
        help_text="Deficit remaining after partial Emergency Fund settlement (Edge Case 1).")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Smart Budget State"
        verbose_name_plural = "Smart Budget States"

    def __str__(self):
        return (
            f"{self.user.email} | SmartBudget "
            f"{self.allocation.month:02d}/{self.allocation.year} "
            f"| Pool={self.smart_budget_expense} DSL={self.dsl}"
        )


class WeekStatus(models.Model):
    """
    Records the outcome of each settled week within a SmartBudgetState.

    Purpose
    -------
    This is the "memory" that makes Edge Cases 4 and 5 (retroactive logging and
    editing/deleting past expenses) possible. When an expense is added or changed
    for a date in a SETTLED week, the engine:
      1. Finds the WeekStatus row for that week.
      2. Reopens it (is_settled=False).
      3. Recomputes that week's weekly_expense_total from DailyExpenseEntry rows.
      4. Re-runs settle_week() for that week.
      5. Cascades forward: re-runs settle_week() for every subsequent settled week
         in chronological order (week_number order).
      6. Updates the parent SmartBudgetState with the final new values.

    Also used by Edge Case 6 (catch_up_missed_weeks): detects weeks whose
    week_end_date has passed but is_settled is still False, then settles them
    in order.
    """

    state = models.ForeignKey(
        SmartBudgetState,
        on_delete=models.CASCADE,
        related_name="week_statuses",
    )
    week_number = models.PositiveIntegerField()
    week_start_date = models.DateField()
    week_end_date = models.DateField()

    # The WSL that applied for THIS week (snapshot at week-start)
    wsl_at_start = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    # The DSL that applied for this week (snapshot)
    dsl_at_start = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    # smart_budget_expense BEFORE this week's settlement ran
    budget_before_settlement = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    # Results after settlement
    weekly_expense_total = models.DecimalField(max_digits=12, decimal_places=2, default=0,
        help_text="Sum of all DailyExpenseEntry amounts in this week.")
    week_delta = models.DecimalField(max_digits=12, decimal_places=2, default=0,
        help_text="Positive = surplus (WSL - actual); Negative = deficit (actual - WSL).")

    is_settled = models.BooleanField(default=False)
    settled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ("state", "week_number")
        ordering = ["week_number"]
        verbose_name = "Week Status"
        verbose_name_plural = "Week Statuses"

    def __str__(self):
        s = "SETTLED" if self.is_settled else "OPEN"
        return (
            f"Week {self.week_number} ({self.week_start_date} to {self.week_end_date}) "
            f"[{s}] total={self.weekly_expense_total}"
        )


class DailyExpenseEntry(models.Model):
    """
    A single expense entry within a Smart Budget month. Fully editable and
    deletable (unlike BucketTransaction which is append-only).

    Any edit or delete triggers a cascade recomputation if the expense belongs
    to an already-settled week (Edge Cases 4 and 5).

    Validation rules (enforced at the serializer and engine layers):
    - amount must be > 0 (Edge Case 9)
    - expense_date must be <= today (no future-dated expenses, Edge Case 9)
    - expense_date must fall within the current month's allocation period
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="daily_expense_entries",
    )
    state = models.ForeignKey(
        SmartBudgetState,
        on_delete=models.CASCADE,
        related_name="entries",
        help_text="The Smart Budget state (month) this expense belongs to.",
    )
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        help_text="Expense amount. Must be > 0.",
    )
    description = models.CharField(max_length=200, blank=True, default="")
    expense_date = models.DateField(
        help_text="Calendar date the expense occurred (user-supplied, must be <= today).",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-expense_date", "-created_at"]
        verbose_name = "Daily Expense Entry"
        verbose_name_plural = "Daily Expense Entries"

    def __str__(self):
        return (
            f"{self.user.email} | {self.expense_date} | "
            f"{self.amount} — {self.description or '(no description)'}"
        )
