"""
Budget app serializers.

Two serializers:
  SalarySubmitSerializer   — validates and deserialises the POST /api/dashboard/salary/ payload.
  DashboardSerializer      — serialises the GET /api/dashboard/ response.
"""

from decimal import Decimal

from rest_framework import serializers

from core.services.allocation import MODE_RATIOS


# ---------------------------------------------------------------------------
# Input serializer — POST /api/dashboard/salary/
# ---------------------------------------------------------------------------

class SalarySubmitSerializer(serializers.Serializer):
    """
    Validates the salary submission payload.

    Validation rules:
    - salary must be > 0 (requirement §6)
    - mode must be one of focused / balanced / custom
    - For mode == 'custom': ratio_* fields are required and must sum to 100%
      (requirement §2 and §6)
    - For mode != 'custom': ratio_* fields are ignored (preset ratios apply)
    """

    salary = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.01"),
        error_messages={"min_value": "Salary must be greater than ₹0."},
    )
    mode = serializers.ChoiceField(choices=["focused", "balanced", "custom"])

    # Custom ratio fields — optional unless mode == 'custom'
    ratio_major = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False, allow_null=True, default=None
    )
    ratio_dsl = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False, allow_null=True, default=None
    )
    ratio_savings = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False, allow_null=True, default=None
    )
    ratio_emergency = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False, allow_null=True, default=None
    )

    def validate(self, data):
        mode = data["mode"]

        if mode == "custom":
            # All four ratio fields are required
            missing = [
                field
                for field in ("ratio_major", "ratio_dsl", "ratio_savings", "ratio_emergency")
                if data.get(field) is None
            ]
            if missing:
                raise serializers.ValidationError(
                    {field: "This field is required for Custom mode." for field in missing}
                )

            # All must be non-negative
            for field in ("ratio_major", "ratio_dsl", "ratio_savings", "ratio_emergency"):
                if data[field] < Decimal("0"):
                    raise serializers.ValidationError(
                        {field: f"Ratio cannot be negative (got {data[field]})."}
                    )

            total = (
                data["ratio_major"]
                + data["ratio_dsl"]
                + data["ratio_savings"]
                + data["ratio_emergency"]
            )
            if total != Decimal("100"):
                raise serializers.ValidationError(
                    f"Custom ratios must sum to exactly 100%. Currently: {total}%."
                )

        return data

    def get_custom_ratios(self) -> dict | None:
        """
        Convenience method called by the view.
        Returns the ratio dict for custom mode, or None otherwise.
        """
        data = self.validated_data
        if data["mode"] != "custom":
            return None
        return {
            "major": data["ratio_major"],
            "dsl": data["ratio_dsl"],
            "savings": data["ratio_savings"],
            "buffer_reserve": data["ratio_emergency"],
        }


# ---------------------------------------------------------------------------
# Response serializer — GET /api/dashboard/  &  POST response
# ---------------------------------------------------------------------------

class BucketDetailSerializer(serializers.Serializer):
    """One bucket's allocated + current balance figures."""
    allocated = serializers.DecimalField(max_digits=12, decimal_places=2)
    balance = serializers.DecimalField(max_digits=12, decimal_places=2)


class DashboardSerializer(serializers.Serializer):
    """
    Full Dashboard response shape.

    DSL floor rule (requirement §4):
      If the DSL bucket's current_balance is negative, we floor the returned
      balance at ₹0.  The deficit is already handled by atomic_ops.py which
      deducts it from Emergency (or Savings).  The raw negative value is NEVER
      surfaced to the frontend.
    """

    has_allocation = serializers.BooleanField()
    salary = serializers.DecimalField(
        max_digits=12, decimal_places=2, allow_null=True
    )
    mode = serializers.CharField(allow_null=True)
    month = serializers.IntegerField(allow_null=True)
    year = serializers.IntegerField(allow_null=True)
    is_locked = serializers.BooleanField(allow_null=True)

    # Nested per-bucket detail
    buckets = serializers.DictField(child=BucketDetailSerializer())

    # Present only when responding to a POST /api/dashboard/salary/
    applied_to = serializers.CharField(required=False, allow_null=True)

    # Pre-fill hint: last-used custom ratios (null if user never used Custom)
    last_custom_ratios = serializers.DictField(
        child=serializers.DecimalField(max_digits=5, decimal_places=2),
        required=False,
        allow_null=True,
    )


# ---------------------------------------------------------------------------
# SavingsGoalAllocation — GET/PUT /api/savings/allocation/
# ---------------------------------------------------------------------------

class SavingsAllocationSerializer(serializers.Serializer):
    """Read/write serializer for SavingsGoalAllocation."""
    goal_amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=0,
        error_messages={"min_value": "Goal amount cannot be negative."},
    )
    # Read-only computed field so the frontend can display stocks_amount directly
    stocks_amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        read_only=True,
        required=False,
    )


# ---------------------------------------------------------------------------
# Goal — GET/POST /api/goals/  and  PUT/DELETE /api/goals/<id>/
# ---------------------------------------------------------------------------

class GoalSerializer(serializers.Serializer):
    """Read/write serializer for Goal."""
    id             = serializers.IntegerField(read_only=True)
    name           = serializers.CharField(
        max_length=100,
        min_length=2,
        error_messages={
            "blank":      "Goal name cannot be blank.",
            "min_length": "Goal name must be at least 2 characters.",
            "max_length": "Goal name cannot exceed 100 characters.",
        },
    )
    target_amount  = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        min_value=Decimal("0"),           # 0 is allowed on creation (placeholder)
        max_value=Decimal("10000000"),    # ₹1 Crore hard cap
        error_messages={
            "min_value": "Target amount cannot be negative.",
            "max_value": "Target amount cannot exceed ₹1,00,00,000.",
        },
    )
    current_amount = serializers.DecimalField(max_digits=12, decimal_places=2, default=0, min_value=0, required=False)
    priority       = serializers.IntegerField(default=0, min_value=0, required=False)
    allocation_mode = serializers.ChoiceField(
        choices=["manual", "auto"],
        default="manual",
        required=False,
    )
    manual_amount  = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        allow_null=True,
        required=False,
        default=None,
        min_value=Decimal("0"),
        max_value=Decimal("10000000"),
        error_messages={
            "min_value": "Manual amount cannot be negative.",
            "max_value": "Manual amount cannot exceed ₹1,00,00,000.",
        },
    )
    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)

    def validate_name(self, value):
        """Strip leading/trailing whitespace and re-check min length."""
        stripped = value.strip()
        if len(stripped) < 2:
            raise serializers.ValidationError("Goal name must be at least 2 non-whitespace characters.")
        return stripped


# ---------------------------------------------------------------------------
# Buffer Reserve — GET /api/buffer-reserve/
# ---------------------------------------------------------------------------

class BufferReserveTransactionSerializer(serializers.Serializer):
    """One transaction log entry for the Buffer Reserve history list."""
    id                 = serializers.IntegerField(read_only=True)
    source_bucket      = serializers.CharField()
    destination_bucket = serializers.CharField()
    amount             = serializers.DecimalField(max_digits=12, decimal_places=2)
    reason             = serializers.CharField()
    timestamp          = serializers.DateTimeField()


class BufferReserveStatusSerializer(serializers.Serializer):
    """
    Full response shape for GET /api/buffer-reserve/.

    balance     — current BucketBalance for the buffer_reserve bucket.
    transactions — paginated list of BufferReserveTransactionSerializer.
    page        — current page number.
    total_pages — total number of pages available.
    """
    balance      = serializers.DecimalField(max_digits=12, decimal_places=2)
    transactions = BufferReserveTransactionSerializer(many=True)
    page         = serializers.IntegerField()
    total_pages  = serializers.IntegerField()


# ---------------------------------------------------------------------------
# Buffer Reserve — POST /api/buffer-reserve/deposit/
# ---------------------------------------------------------------------------

class BufferReserveDepositSerializer(serializers.Serializer):
    """
    Validates a deposit into the Buffer Reserve bucket.

    Fields:
      amount — positive INR amount to move from DSL → buffer_reserve.
      source — must be 'dsl_bucket' (only valid source for hackathon scope).
    """
    amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.01"),
        error_messages={"min_value": "Deposit amount must be greater than ₹0."},
    )
    source = serializers.ChoiceField(
        choices=["dsl_bucket"],
        default="dsl_bucket",
        help_text="Source bucket for the deposit. Only 'dsl_bucket' is supported.",
    )


# ---------------------------------------------------------------------------
# Buffer Reserve — POST /api/buffer-reserve/withdraw/
# ---------------------------------------------------------------------------

class BufferReserveWithdrawSerializer(serializers.Serializer):
    """
    Validates a withdrawal from the Buffer Reserve bucket.

    Fields:
      amount — positive INR amount to withdraw.
      reason — free-text description (required for audit log).
      type   — 'dsl_deficit': move money to DSL bucket to cover overspend.
               'manual_expense': money leaves the ecosystem entirely.
    """
    WITHDRAW_TYPES = ["dsl_deficit", "manual_expense"]

    amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.01"),
        error_messages={"min_value": "Withdrawal amount must be greater than ₹0."},
    )
    reason = serializers.CharField(
        max_length=500,
        error_messages={"blank": "A reason is required for the audit log."},
    )
    type = serializers.ChoiceField(
        choices=WITHDRAW_TYPES,
        error_messages={"invalid_choice": "type must be 'dsl_deficit' or 'manual_expense'."},
    )
