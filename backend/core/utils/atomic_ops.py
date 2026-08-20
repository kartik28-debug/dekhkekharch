"""
Atomic money-movement operations.

Architecture §11 rule: "Atomic transactions — with transaction.atomic(): on
every money movement."

FR-2.1: Every transaction that modifies monetary fields SHALL be wrapped in a
database atomic transaction.

This module exposes a single public function — transfer_between_buckets() —
that is the ONLY way money should move between buckets.  All page-specific
services (DSL, Savings, Goals, EmergencyFund) MUST call this function rather
than updating BucketBalance directly, so the Dashboard always reflects the
true current state.
"""

from decimal import Decimal

from django.db import transaction

# ---------------------------------------------------------------------------
# Sentinel value — used by callers to represent money coming in from salary
# (not a real bucket).
# ---------------------------------------------------------------------------
SOURCE_SALARY = "salary"
SOURCE_EXTERNAL = "external"

# Bucket types that exist in BucketBalance
VALID_BUCKET_TYPES = {"major", "dsl", "savings", "emergency"}

# ---------------------------------------------------------------------------
# DSL over-spend floor rule (requirement §4):
#   If DSL bucket would go negative, floor its displayed value at ₹0 and
#   reflect the actual deficit as a deduction from EmergencyFund (or Savings).
#   The transfer_between_buckets function enforces this by allowing DSL to go
#   negative internally while the view layer floors the display at ₹0.
#
#   Buckets that are NEVER allowed to go negative (hard floor = 0):
HARD_FLOOR_BUCKETS = {"emergency", "savings", "major"}
#
#   Buckets with a soft floor (can go negative internally; floored to 0 in UI):
SOFT_FLOOR_BUCKETS = {"dsl"}
# ---------------------------------------------------------------------------


class InsufficientFundsError(Exception):
    """
    Raised when a deduction would violate the hard floor rule for a bucket
    that is not permitted to go negative.
    """


def transfer_between_buckets(
    user,
    from_bucket_type: str,
    to_bucket_type: str,
    amount: Decimal,
    reason: str,
    allocation=None,
) -> tuple:
    """
    Atomically move *amount* from *from_bucket_type* to *to_bucket_type*,
    create an audit log entry in BucketTransaction, and return the updated
    (from_balance, to_balance) pair.

    This function is the single entry point for ALL inter-bucket transfers.
    It is intentionally reusable by every feature page (DSL overspend →
    EmergencyFund, Savings → Goals, etc.) and by the initial salary allocation.

    Args:
        user:             The authenticated Django User instance.
        from_bucket_type: Source bucket type string, or SOURCE_SALARY /
                          SOURCE_EXTERNAL for initial funding.
        to_bucket_type:   Destination bucket type string.
        amount:           Positive Decimal amount to transfer.
        reason:           Free-text description for the audit log.
        allocation:       The active MonthlyAllocation instance.  If None,
                          the function resolves the current month's allocation
                          automatically.

    Returns:
        Tuple (from_bucket | None, to_bucket) — the saved BucketBalance
        instances.  from_bucket is None when from_bucket_type is a sentinel
        value (salary / external).

    Raises:
        ValueError:            If amount ≤ 0, or bucket type is invalid.
        InsufficientFundsError: If deduction would violate the hard floor.
    """
    # Lazy import to avoid circular imports (models import core.utils)
    from apps.budget.models import BucketBalance, BucketTransaction, MonthlyAllocation

    if amount <= Decimal("0"):
        raise ValueError(f"Transfer amount must be positive, got {amount!r}")

    is_external_source = from_bucket_type in (SOURCE_SALARY, SOURCE_EXTERNAL)

    if not is_external_source and from_bucket_type not in VALID_BUCKET_TYPES:
        raise ValueError(f"Invalid from_bucket_type: {from_bucket_type!r}")

    if to_bucket_type not in VALID_BUCKET_TYPES:
        raise ValueError(f"Invalid to_bucket_type: {to_bucket_type!r}")

    with transaction.atomic():
        # ----------------------------------------------------------------
        # Resolve active allocation if not supplied
        # ----------------------------------------------------------------
        if allocation is None:
            from datetime import date

            today = date.today()
            allocation = (
                MonthlyAllocation.objects.select_for_update()
                .filter(user=user, month=today.month, year=today.year)
                .first()
            )

        # ----------------------------------------------------------------
        # Deduct from source (skip for external/salary sources)
        # ----------------------------------------------------------------
        from_bucket = None
        if not is_external_source:
            from_bucket = (
                BucketBalance.objects.select_for_update()
                .get(user=user, bucket_type=from_bucket_type, allocation=allocation)
            )
            new_from_balance = from_bucket.current_balance - amount

            # Hard floor check
            if from_bucket_type in HARD_FLOOR_BUCKETS and new_from_balance < Decimal("0"):
                raise InsufficientFundsError(
                    f"Bucket '{from_bucket_type}' has ₹{from_bucket.current_balance} "
                    f"but transfer of ₹{amount} was requested. "
                    "This bucket cannot go negative."
                )

            # Soft floor (DSL): allow negative internally, UI floors at ₹0
            from_bucket.current_balance = new_from_balance
            from_bucket.save(update_fields=["current_balance"])

        # ----------------------------------------------------------------
        # Credit destination
        # ----------------------------------------------------------------
        to_bucket = (
            BucketBalance.objects.select_for_update()
            .get(user=user, bucket_type=to_bucket_type, allocation=allocation)
        )
        to_bucket.current_balance += amount
        to_bucket.save(update_fields=["current_balance"])

        # ----------------------------------------------------------------
        # Audit log
        # ----------------------------------------------------------------
        BucketTransaction.objects.create(
            user=user,
            source_bucket=from_bucket_type,
            destination_bucket=to_bucket_type,
            amount=amount,
            reason=reason,
            allocation=allocation,
        )

    return from_bucket, to_bucket
