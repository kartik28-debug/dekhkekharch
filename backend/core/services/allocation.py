"""
Allocation service — computes bucket splits and applies them to the DB.

Mode ratios (requirement §1):
  focused:  Major 50% | DSL 15% | Savings 25% | Emergency 10%
  balanced: Major 50% | DSL 25% | Savings 15% | Emergency 10%
  custom:   User-defined; must sum to exactly 100%.

Forward-only rule (requirement §2):
  Once a MonthlyAllocation is locked (is_locked=True), changes to salary or
  mode DO NOT retroactively modify that month's BucketBalance values.  Changes
  are recorded in a NEW MonthlyAllocation for the next month only.
"""

from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction

# ---------------------------------------------------------------------------
# Canonical mode ratios
# ---------------------------------------------------------------------------
MODE_RATIOS: dict[str, dict[str, Decimal]] = {
    "focused": {
        "major": Decimal("50"),
        "dsl": Decimal("15"),
        "savings": Decimal("25"),
        "buffer_reserve": Decimal("10"),
    },
    "balanced": {
        "major": Decimal("50"),
        "dsl": Decimal("25"),
        "savings": Decimal("15"),
        "buffer_reserve": Decimal("10"),
    },
}

CENT = Decimal("0.01")


def _quantize(value: Decimal) -> Decimal:
    """Round to 2 decimal places (INR paise precision)."""
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------

def compute_allocation(
    salary: Decimal,
    mode: str,
    custom_ratios: dict[str, Decimal] | None = None,
) -> dict[str, Decimal]:
    """
    Return a dict of {bucket_type: allocated_amount} for the 4 buckets.

    Args:
        salary:        Monthly salary (must be > 0; caller validates).
        mode:          'focused' | 'balanced' | 'custom'
        custom_ratios: Required when mode == 'custom'.  Dict with keys
                       major/dsl/savings/emergency whose values are
                       percentages (Decimal) summing to 100.

    Returns:
        {
          'major':     Decimal,
          'dsl':       Decimal,
          'savings':   Decimal,
          'emergency': Decimal,
        }

    Raises:
        ValueError: For unknown mode, or custom ratios not summing to 100.
    """
    if mode in ("focused", "balanced"):
        ratios = MODE_RATIOS[mode]
    elif mode == "custom":
        if custom_ratios is None:
            raise ValueError("custom_ratios must be provided when mode is 'custom'.")
        ratios = custom_ratios
        _validate_custom_ratios(ratios)
    else:
        raise ValueError(f"Unknown allocation mode: {mode!r}")

    amounts = {
        bucket: _quantize(salary * ratio / Decimal("100"))
        for bucket, ratio in ratios.items()
    }

    # Distribute any rounding residual to the largest bucket to ensure
    # the 4 amounts sum exactly to salary.
    total = sum(amounts.values())
    diff = salary - total
    if diff != Decimal("0"):
        largest = max(amounts, key=amounts.__getitem__)
        amounts[largest] += diff

    return amounts


def _validate_custom_ratios(ratios: dict[str, Decimal]) -> None:
    """
    Raise ValueError if the custom ratio dict is invalid.

    Validation rules (requirement §2):
    - Must contain exactly the 4 required keys.
    - All values must be >= 0.
    - They must sum to exactly 100.
    """
    required_keys = {"major", "dsl", "savings", "buffer_reserve"}
    if set(ratios.keys()) != required_keys:
        raise ValueError(
            f"Custom ratios must contain keys {required_keys}, got {set(ratios.keys())}."
        )

    for key, value in ratios.items():
        if value < Decimal("0"):
            raise ValueError(f"Ratio for '{key}' cannot be negative (got {value}).")

    total = sum(ratios.values())
    if total != Decimal("100"):
        raise ValueError(
            f"Custom ratios must sum to exactly 100%, got {total}%."
        )


def apply_allocation(user, salary: Decimal, mode: str, custom_ratios=None) -> tuple:
    """
    Create or update a MonthlyAllocation + BucketBalance records for the
    current month, respecting the forward-only lock rule.

    Forward-only lock rule:
      - If the current month's allocation IS locked → create a new
        MonthlyAllocation for NEXT month, return it with applied_to='next_month'.
      - If unlocked → update in place and recompute BucketBalance records.

    Args:
        user:          Authenticated User instance.
        salary:        Positive Decimal salary.
        mode:          'focused' | 'balanced' | 'custom'
        custom_ratios: Required when mode == 'custom'.

    Returns:
        (allocation, bucket_balances_dict, applied_to)
        where applied_to is 'current_month' | 'next_month'
    """
    from datetime import date

    from apps.budget.models import BucketBalance, MonthlyAllocation

    today = date.today()
    amounts = compute_allocation(salary, mode, custom_ratios)

    # Resolve ratios to store on the allocation record
    if mode == "custom":
        stored_ratios = custom_ratios
    else:
        stored_ratios = MODE_RATIOS[mode]

    with transaction.atomic():
        # ----------------------------------------------------------------
        # Check current month's allocation lock status
        # ----------------------------------------------------------------
        current = MonthlyAllocation.objects.select_for_update().filter(
            user=user,
            month=today.month,
            year=today.year,
        ).first()

        if current and current.is_locked:
            # Forward-only: schedule for next month
            if today.month == 12:
                target_month, target_year = 1, today.year + 1
            else:
                target_month, target_year = today.month + 1, today.year

            allocation = _upsert_allocation(
                user=user,
                month=target_month,
                year=target_year,
                salary=salary,
                mode=mode,
                stored_ratios=stored_ratios,
                amounts=amounts,
                lock=False,
            )
            applied_to = "next_month"
        else:
            # Unlocked or doesn't exist yet → update/create current month
            allocation = _upsert_allocation(
                user=user,
                month=today.month,
                year=today.year,
                salary=salary,
                mode=mode,
                stored_ratios=stored_ratios,
                amounts=amounts,
                lock=False,
            )
            applied_to = "current_month"

        # ----------------------------------------------------------------
        # Persist/update BucketBalance records (stored field, not computed)
        # ----------------------------------------------------------------
        bucket_balances = {}
        for bucket_type, amount in amounts.items():
            bb, _ = BucketBalance.objects.update_or_create(
                user=user,
                bucket_type=bucket_type,
                allocation=allocation,
                defaults={"current_balance": amount},
            )
            bucket_balances[bucket_type] = bb

        # ----------------------------------------------------------------
        # Persist last-used custom ratios on the user profile for pre-fill
        # ----------------------------------------------------------------
        if mode == "custom":
            _save_last_custom_ratios(user, stored_ratios)

    return allocation, bucket_balances, applied_to


def lock_allocation(user) -> "MonthlyAllocation":  # noqa: F821
    """
    Lock the current month's MonthlyAllocation ('Start Month' action).

    Once locked, salary/mode changes apply to the NEXT month only
    (forward-only rule).

    Returns:
        The locked MonthlyAllocation instance.

    Raises:
        ValueError: If no allocation exists for the current month.
    """
    from datetime import date

    from apps.budget.models import MonthlyAllocation

    today = date.today()
    with transaction.atomic():
        allocation = MonthlyAllocation.objects.select_for_update().filter(
            user=user,
            month=today.month,
            year=today.year,
        ).first()

        if allocation is None:
            raise ValueError(
                "No allocation found for the current month. "
                "Please set a salary first."
            )

        allocation.is_locked = True
        allocation.save(update_fields=["is_locked"])

    return allocation


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _upsert_allocation(
    user,
    month: int,
    year: int,
    salary: Decimal,
    mode: str,
    stored_ratios: dict,
    amounts: dict,
    lock: bool,
) -> "MonthlyAllocation":  # noqa: F821
    """Create or update a MonthlyAllocation row."""
    from apps.budget.models import MonthlyAllocation

    allocation, _ = MonthlyAllocation.objects.update_or_create(
        user=user,
        month=month,
        year=year,
        defaults={
            "salary": salary,
            "mode": mode,
            "ratio_major": stored_ratios["major"],
            "ratio_dsl": stored_ratios["dsl"],
            "ratio_savings": stored_ratios["savings"],
            "ratio_emergency": stored_ratios["buffer_reserve"],
            "is_locked": lock,
        },
    )
    return allocation


def _save_last_custom_ratios(user, ratios: dict[str, Decimal]) -> None:
    """
    Persist the last-used custom ratio values onto the user profile so that
    re-selecting 'Custom' mode pre-fills the form (requirement §2, last bullet).
    """
    user.last_custom_ratio_major = ratios["major"]
    user.last_custom_ratio_dsl = ratios["dsl"]
    user.last_custom_ratio_savings = ratios["savings"]
    user.last_custom_ratio_emergency = ratios["buffer_reserve"]
    user.save(
        update_fields=[
            "last_custom_ratio_major",
            "last_custom_ratio_dsl",
            "last_custom_ratio_savings",
            "last_custom_ratio_emergency",
        ]
    )
