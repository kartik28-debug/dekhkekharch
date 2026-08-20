"""
Budget app views.

Auth mode: AllowAny for development / hackathon demo.
User resolution: uses the first superuser in the DB (or the first user) so
the Dashboard works without a JWT token while the Login page stays untouched.

Endpoints:
  GET  /api/dashboard/          → DashboardView
  POST /api/dashboard/salary/   → SalaryView
  POST /api/dashboard/lock/     → LockAllocationView  ('Start Month' action)
"""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from core.services.allocation import apply_allocation, lock_allocation
from core.utils.atomic_ops import (
    transfer_between_buckets,
    InsufficientFundsError,
    SOURCE_EXTERNAL,
)
from .models import BucketBalance, BucketTransaction, MonthlyAllocation, SavingsGoalAllocation, Goal
from .serializers import (
    DashboardSerializer,
    SalarySubmitSerializer,
    SavingsAllocationSerializer,
    GoalSerializer,
    BufferReserveStatusSerializer,
    BufferReserveDepositSerializer,
    BufferReserveWithdrawSerializer,
)


User = get_user_model()


# ---------------------------------------------------------------------------
# Demo-mode helper — resolves a user without requiring a JWT token
# ---------------------------------------------------------------------------

def _get_demo_user():
    """
    Return the first superuser, or the first user in the DB if no superuser
    exists yet.  Returns None if the DB has no users at all.

    This is intentional for the hackathon dev phase — swap to request.user
    once real auth is wired up.
    """
    user = User.objects.filter(is_superuser=True).order_by("id").first()
    if user is None:
        user = User.objects.order_by("id").first()
    return user


# ---------------------------------------------------------------------------
# Internal helper — builds the dashboard data dict from DB objects
# ---------------------------------------------------------------------------

def _build_dashboard_data(user, allocation, bucket_balances, applied_to=None):
    """
    Build the dict that DashboardSerializer expects.

    DSL floor rule (requirement §4):
      If DSL current_balance < 0, surface ₹0 to the caller.
      The actual deficit should already have been transferred out by the DSL
      overspend handler (not part of this view), but we defensively apply the
      floor here too so the Dashboard is never wrong.
    """
    ZERO = Decimal("0")
    CENT = Decimal("0.01")

    buckets = {}
    for bucket_type in ("major", "dsl", "savings", "buffer_reserve"):
        bb = bucket_balances.get(bucket_type)
        raw_balance = bb.current_balance if bb else ZERO
        # DSL floor: never show a negative number for DSL
        displayed_balance = max(raw_balance, ZERO) if bucket_type == "dsl" else raw_balance

        # Allocated amount — computed from the stored ratio on the allocation row.
        # NOTE: The DB column is still named ratio_emergency (legacy); buffer_reserve
        #       maps to it since only the bucket_type string was renamed, not the column.
        if allocation:
            col = "ratio_emergency" if bucket_type == "buffer_reserve" else f"ratio_{bucket_type}"
            ratio = getattr(allocation, col)

            allocated = (allocation.salary * ratio / 100).quantize(CENT)
        else:
            allocated = ZERO

        buckets[bucket_type] = {
            "allocated": allocated,
            "balance": displayed_balance,
        }

    return {
        "has_allocation": allocation is not None,
        "salary": allocation.salary if allocation else None,
        "mode": allocation.mode if allocation else None,
        "month": allocation.month if allocation else None,
        "year": allocation.year if allocation else None,
        "is_locked": allocation.is_locked if allocation else None,
        "buckets": buckets,
        "applied_to": applied_to,
        "last_custom_ratios": user.last_custom_ratios if user else None,
    }


def _get_current_allocation_and_balances(user):
    """
    Fetch the active MonthlyAllocation and its BucketBalance records for today.
    Returns (allocation | None, {bucket_type: BucketBalance}).
    """
    today = timezone.localdate()
    allocation = MonthlyAllocation.objects.filter(
        user=user,
        month=today.month,
        year=today.year,
    ).first()

    if allocation is None:
        return None, {}

    balances = {
        bb.bucket_type: bb
        for bb in BucketBalance.objects.filter(user=user, allocation=allocation)
    }
    return allocation, balances


# ---------------------------------------------------------------------------
# GET /api/dashboard/
# ---------------------------------------------------------------------------

class DashboardView(APIView):
    """
    Returns the current salary, mode, and all 4 bucket balances.

    Empty state (requirement §4, new user):
      If no allocation exists, all 4 buckets show ₹0 and has_allocation=False.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        user = _get_demo_user()
        if user is None:
            return Response(
                {"detail": "No users found. Please create a superuser first."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        allocation, balances = _get_current_allocation_and_balances(user)
        data = _build_dashboard_data(user, allocation, balances)
        serializer = DashboardSerializer(data)
        return Response(serializer.data, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# POST /api/dashboard/salary/
# ---------------------------------------------------------------------------

class SalaryView(APIView):
    """
    Set or update the monthly salary and allocation mode.

    On success:
    - If the current month is NOT locked → updates current month.
    - If the current month IS locked → schedules for next month.
    - Returns the full dashboard payload with applied_to hint.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        user = _get_demo_user()
        if user is None:
            return Response(
                {"detail": "No users found. Please create a superuser first."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        serializer = SalarySubmitSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        salary = serializer.validated_data["salary"]
        mode = serializer.validated_data["mode"]
        custom_ratios = serializer.get_custom_ratios()

        allocation, bucket_balances_objs, applied_to = apply_allocation(
            user=user,
            salary=salary,
            mode=mode,
            custom_ratios=custom_ratios,
        )

        balances = {bt: bb for bt, bb in bucket_balances_objs.items()}
        data = _build_dashboard_data(user, allocation, balances, applied_to=applied_to)
        out_serializer = DashboardSerializer(data)
        return Response(out_serializer.data, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# POST /api/dashboard/lock/
# ---------------------------------------------------------------------------

class LockAllocationView(APIView):
    """Lock the current month's allocation ('Start Month' action)."""

    permission_classes = [AllowAny]

    def post(self, request):
        user = _get_demo_user()
        if user is None:
            return Response(
                {"detail": "No users found."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        try:
            lock_allocation(user)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        allocation, balances = _get_current_allocation_and_balances(user)
        data = _build_dashboard_data(user, allocation, balances)
        out_serializer = DashboardSerializer(data)
        return Response(out_serializer.data, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# GET/PUT /api/savings/allocation/
# ---------------------------------------------------------------------------

class SavingsAllocationView(APIView):
    """
    Retrieve or update the user's Goal vs. Stocks split within the Savings bucket.

    GET  → returns { goal_amount, stocks_amount } for the current month.
           If no allocation or no SavingsGoalAllocation row exists yet,
           goal_amount=0 is returned.

    PUT  → body: { goal_amount: <number> }
           Creates or updates the SavingsGoalAllocation for the current month.
           Returns the updated { goal_amount, stocks_amount }.
    """

    permission_classes = [AllowAny]

    def _get_savings_balance(self, user):
        """Return the live savings BucketBalance for the current month."""
        allocation, balances = _get_current_allocation_and_balances(user)
        if allocation is None:
            return Decimal("0"), None
        savings_bb = balances.get("savings")
        savings_balance = savings_bb.current_balance if savings_bb else Decimal("0")
        return savings_balance, allocation

    def get(self, request):
        user = _get_demo_user()
        if user is None:
            return Response({"detail": "No users found."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        savings_balance, allocation = self._get_savings_balance(user)

        goal_amount = Decimal("0")
        if allocation:
            sga = SavingsGoalAllocation.objects.filter(user=user, allocation=allocation).first()
            if sga:
                goal_amount = sga.goal_amount

        # Floor goal_amount to savings_balance in case it exceeds it
        goal_amount = min(goal_amount, savings_balance)
        stocks_amount = max(savings_balance - goal_amount, Decimal("0"))

        data = {"goal_amount": goal_amount, "stocks_amount": stocks_amount}
        serializer = SavingsAllocationSerializer(data)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def put(self, request):
        user = _get_demo_user()
        if user is None:
            return Response({"detail": "No users found."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        serializer = SavingsAllocationSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        savings_balance, allocation = self._get_savings_balance(user)
        if allocation is None:
            return Response(
                {"detail": "No active allocation for this month. Please set a salary first."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        goal_amount = serializer.validated_data["goal_amount"]
        # Cap at actual savings balance
        goal_amount = min(goal_amount, savings_balance)

        sga, _ = SavingsGoalAllocation.objects.update_or_create(
            user=user,
            allocation=allocation,
            defaults={"goal_amount": goal_amount},
        )

        stocks_amount = max(savings_balance - goal_amount, Decimal("0"))
        out = {"goal_amount": sga.goal_amount, "stocks_amount": stocks_amount}
        out_serializer = SavingsAllocationSerializer(out)
        return Response(out_serializer.data, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# GET/POST /api/goals/
# ---------------------------------------------------------------------------

class GoalListCreateView(APIView):
    """
    GET  → list all goals for the demo user, ordered by priority then created_at.
    POST → create a new goal.  Required fields: name.
           Optional: target_amount, priority, allocation_mode, manual_amount.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        user = _get_demo_user()
        if user is None:
            return Response({"detail": "No users found."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        goals = Goal.objects.filter(user=user)
        serializer = GoalSerializer([
            {
                "id":              g.id,
                "name":            g.name,
                "target_amount":   g.target_amount,
                "current_amount":  g.current_amount,
                "priority":        g.priority,
                "allocation_mode": g.allocation_mode,
                "manual_amount":   g.manual_amount,
                "created_at":      g.created_at,
                "updated_at":      g.updated_at,
            }
            for g in goals
        ], many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        user = _get_demo_user()
        if user is None:
            return Response({"detail": "No users found."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        serializer = GoalSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        d = serializer.validated_data
        goal = Goal.objects.create(
            user=user,
            name=d["name"],
            target_amount=d.get("target_amount", 0),
            current_amount=d.get("current_amount", 0),
            priority=d.get("priority", 0),
            allocation_mode=d.get("allocation_mode", "manual"),
            manual_amount=d.get("manual_amount"),
        )
        out = GoalSerializer({
            "id":              goal.id,
            "name":            goal.name,
            "target_amount":   goal.target_amount,
            "current_amount":  goal.current_amount,
            "priority":        goal.priority,
            "allocation_mode": goal.allocation_mode,
            "manual_amount":   goal.manual_amount,
            "created_at":      goal.created_at,
            "updated_at":      goal.updated_at,
        })
        return Response(out.data, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# PUT/DELETE /api/goals/<pk>/
# ---------------------------------------------------------------------------

class GoalDetailView(APIView):
    """
    PUT    → partial update a goal (any subset of fields).
    DELETE → permanently delete the goal.
    """

    permission_classes = [AllowAny]

    def _get_goal(self, user, pk):
        try:
            return Goal.objects.get(pk=pk, user=user)
        except Goal.DoesNotExist:
            return None

    def put(self, request, pk):
        user = _get_demo_user()
        if user is None:
            return Response({"detail": "No users found."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        goal = self._get_goal(user, pk)
        if goal is None:
            return Response({"detail": "Goal not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = GoalSerializer(data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        d = serializer.validated_data
        for field in ("name", "target_amount", "current_amount", "priority", "allocation_mode", "manual_amount"):
            if field in d:
                setattr(goal, field, d[field])
        goal.save()

        out = GoalSerializer({
            "id":              goal.id,
            "name":            goal.name,
            "target_amount":   goal.target_amount,
            "current_amount":  goal.current_amount,
            "priority":        goal.priority,
            "allocation_mode": goal.allocation_mode,
            "manual_amount":   goal.manual_amount,
            "created_at":      goal.created_at,
            "updated_at":      goal.updated_at,
        })
        return Response(out.data, status=status.HTTP_200_OK)

    def delete(self, request, pk):
        user = _get_demo_user()
        if user is None:
            return Response({"detail": "No users found."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        goal = self._get_goal(user, pk)
        if goal is None:
            return Response({"detail": "Goal not found."}, status=status.HTTP_404_NOT_FOUND)

        goal.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# GET /api/buffer-reserve/
# ---------------------------------------------------------------------------

class BufferReserveView(APIView):
    """
    Returns the current buffer_reserve BucketBalance and a paginated list
    of all BucketTransactions where source_bucket OR destination_bucket
    is 'buffer_reserve'.

    Query params:
      ?page=<int>  — page number (1-indexed, default 1)
      ?page_size=<int>  — items per page (default 20, max 100)
    """

    permission_classes = [AllowAny]
    DEFAULT_PAGE_SIZE = 20
    MAX_PAGE_SIZE     = 100

    def get(self, request):
        import math
        user = _get_demo_user()
        if user is None:
            return Response({"detail": "No users found."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        allocation, balances = _get_current_allocation_and_balances(user)
        br_bb = balances.get("buffer_reserve")
        current_balance = br_bb.current_balance if br_bb else Decimal("0")

        # --- Paginate transaction history ---
        try:
            page = max(1, int(request.query_params.get("page", 1)))
        except (ValueError, TypeError):
            page = 1

        try:
            page_size = min(
                self.MAX_PAGE_SIZE,
                max(1, int(request.query_params.get("page_size", self.DEFAULT_PAGE_SIZE)))
            )
        except (ValueError, TypeError):
            page_size = self.DEFAULT_PAGE_SIZE

        qs = (
            BucketTransaction.objects
            .filter(
                user=user,
            )
            .filter(
                Q(source_bucket="buffer_reserve") |
                Q(destination_bucket="buffer_reserve")
            )
            .order_by("-timestamp")
        )

        total_count = qs.count()
        total_pages = max(1, math.ceil(total_count / page_size))
        offset      = (page - 1) * page_size
        transactions = qs[offset: offset + page_size]

        tx_data = [
            {
                "id":                 t.id,
                "source_bucket":      t.source_bucket,
                "destination_bucket": t.destination_bucket,
                "amount":             t.amount,
                "reason":             t.reason,
                "timestamp":          t.timestamp,
            }
            for t in transactions
        ]

        data = {
            "balance":      current_balance,
            "transactions": tx_data,
            "page":         page,
            "total_pages":  total_pages,
        }
        serializer = BufferReserveStatusSerializer(data)
        return Response(serializer.data, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# POST /api/buffer-reserve/deposit/
# ---------------------------------------------------------------------------

class BufferReserveDepositView(APIView):
    """
    Deposit money into Buffer Reserve from the DSL bucket.

    Payload: { "amount": <number>, "source": "dsl_bucket" }

    Uses transfer_between_buckets() atomically:
      DSL → buffer_reserve

    Returns the updated buffer_reserve balance.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        user = _get_demo_user()
        if user is None:
            return Response({"detail": "No users found."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        serializer = BufferReserveDepositSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        amount = serializer.validated_data["amount"]

        # Verify source DSL bucket has enough balance
        allocation, balances = _get_current_allocation_and_balances(user)
        if allocation is None:
            return Response(
                {"detail": "No active allocation for this month. Please set a salary first."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        dsl_bb = balances.get("dsl")
        dsl_balance = dsl_bb.current_balance if dsl_bb else Decimal("0")
        # DSL can be negative; the displayed floor is ₹0, but we check the actual balance
        if dsl_balance < amount:
            return Response(
                {
                    "detail": (
                        f"DSL balance (₹{max(dsl_balance, Decimal('0'))}) is insufficient "
                        f"for a deposit of ₹{amount}."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            _, br_bb = transfer_between_buckets(
                user=user,
                from_bucket_type="dsl",
                to_bucket_type="buffer_reserve",
                amount=amount,
                reason=f"Manual DSL surplus deposit to Buffer Reserve: ₹{amount}",
                allocation=allocation,
            )
        except InsufficientFundsError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "detail": "Deposit successful.",
                "buffer_reserve_balance": str(br_bb.current_balance),
                "amount_deposited": str(amount),
            },
            status=status.HTTP_200_OK,
        )


# ---------------------------------------------------------------------------
# POST /api/buffer-reserve/withdraw/
# ---------------------------------------------------------------------------

class BufferReserveWithdrawView(APIView):
    """
    Withdraw money from Buffer Reserve.

    Payload: {
      "amount": <number>,
      "reason": <string>,
      "type": "dsl_deficit" | "manual_expense"
    }

    Type logic:
      "dsl_deficit"    → transfer_between_buckets(buffer_reserve → dsl).
                         If amount > available balance, transfer the maximum
                         available (drain to ₹0) and return HTTP 206 with
                         partially_covered=True so the frontend knows.

      "manual_expense" → Deduct directly from buffer_reserve (money leaves
                         the ecosystem). Write a BucketTransaction with
                         destination_bucket='external'.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        from django.db import transaction as db_transaction

        user = _get_demo_user()
        if user is None:
            return Response({"detail": "No users found."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        serializer = BufferReserveWithdrawSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        amount          = serializer.validated_data["amount"]
        reason          = serializer.validated_data["reason"]
        withdraw_type   = serializer.validated_data["type"]

        allocation, balances = _get_current_allocation_and_balances(user)
        if allocation is None:
            return Response(
                {"detail": "No active allocation for this month. Please set a salary first."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        br_bb = balances.get("buffer_reserve")
        available = br_bb.current_balance if br_bb else Decimal("0")

        # Hard check: Buffer Reserve must have funds to withdraw from
        if available <= Decimal("0"):
            return Response(
                {"detail": "Buffer Reserve is empty. Nothing to withdraw."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if withdraw_type == "dsl_deficit":
            # --- Partial coverage logic ---
            actual_transfer = min(amount, available)  # drain to ₹0 at most
            partially_covered = actual_transfer < amount

            try:
                _, dsl_bb = transfer_between_buckets(
                    user=user,
                    from_bucket_type="buffer_reserve",
                    to_bucket_type="dsl",
                    amount=actual_transfer,
                    reason=reason or f"Buffer Reserve covering DSL deficit of ₹{amount}",
                    allocation=allocation,
                )
            except (InsufficientFundsError, ValueError) as exc:
                return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

            # Refresh br_bb after transfer
            br_bb.refresh_from_db()

            response_data = {
                "detail": "DSL deficit covered." if not partially_covered else
                          "Buffer Reserve drained. DSL deficit only partially covered.",
                "amount_requested":       str(amount),
                "amount_transferred":     str(actual_transfer),
                "partially_covered":      partially_covered,
                "buffer_reserve_balance": str(br_bb.current_balance),
                "dsl_balance":            str(dsl_bb.current_balance),
            }
            response_status = (
                status.HTTP_206_PARTIAL_CONTENT if partially_covered
                else status.HTTP_200_OK
            )
            return Response(response_data, response_status)

        else:  # manual_expense — money leaves the ecosystem
            if amount > available:
                return Response(
                    {
                        "detail": (
                            f"Insufficient Buffer Reserve balance. "
                            f"Available: ₹{available}, requested: ₹{amount}."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            with db_transaction.atomic():
                # Direct deduction — no destination bucket (money leaves)
                br_bb_locked = (
                    BucketBalance.objects
                    .select_for_update()
                    .get(user=user, bucket_type="buffer_reserve", allocation=allocation)
                )
                br_bb_locked.current_balance -= amount
                br_bb_locked.save(update_fields=["current_balance"])

                # Audit log: destination is the sentinel 'external'
                BucketTransaction.objects.create(
                    user=user,
                    source_bucket="buffer_reserve",
                    destination_bucket="external",
                    amount=amount,
                    reason=reason,
                    allocation=allocation,
                )

            return Response(
                {
                    "detail": "Manual expense deducted from Buffer Reserve.",
                    "amount_withdrawn":       str(amount),
                    "buffer_reserve_balance": str(br_bb_locked.current_balance),
                },
                status=status.HTTP_200_OK,
            )
