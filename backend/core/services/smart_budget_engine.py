"""
core/services/smart_budget_engine.py

The Weekly Checkpoint calculation engine — isolated, pure functions with no
Django model imports at module level (models are imported inside functions to
keep this file importable in unit tests without a full Django setup).

All monetary arithmetic uses Python Decimal with ROUND_HALF_UP to prevent
floating-point drift across multiple week-end recalculations (Edge Case 10).

All functions that take a `state` argument expect a SmartBudgetState instance.
All functions return either a modified state (call .save() yourself) or a
plain dict describing the result (for the views layer to act on).
"""

import calendar
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

ZERO = Decimal("0")
CENT = Decimal("0.01")


# ---------------------------------------------------------------------------
# Pure date helpers
# ---------------------------------------------------------------------------

def days_in_month(year: int, month: int) -> int:
    """Return the actual number of days in the given month (Edge Case 8)."""
    return calendar.monthrange(year, month)[1]


def get_remaining_days(month_start: date, week_start: date, today: date,
                       year: int, month: int) -> int:
    """
    Count remaining calendar days from today to end-of-month (inclusive of today).
    Respects mid-month starts (Edge Case 7): never exceeds days from month_start.
    Guards against zero (Edge Case 2).
    """
    end_of_month = date(year, month, days_in_month(year, month))
    remaining = (end_of_month - today).days + 1  # include today
    return max(remaining, 0)


def get_remaining_weeks(state, today: date) -> int:
    """
    Count unsettled full 7-day weeks remaining from the active week_start_date
    to end-of-month. Returns at least 0 (Edge Case 2).
    """
    end_of_month = date(state.allocation.year, state.allocation.month,
                        days_in_month(state.allocation.year, state.allocation.month))
    days_left = (end_of_month - state.week_start_date).days + 1
    weeks = max(0, (days_left + 6) // 7)  # ceiling division
    return weeks


def safe_divide(numerator: Decimal, denominator: int) -> Decimal:
    """
    Decimal-safe division. Returns ZERO if denominator <= 0 (Edge Case 2).
    Result is quantized to 2 decimal places with ROUND_HALF_UP.
    """
    if denominator <= 0:
        return ZERO
    return (Decimal(str(numerator)) / Decimal(str(denominator))).quantize(CENT, rounding=ROUND_HALF_UP)


# ---------------------------------------------------------------------------
# Initialisation
# ---------------------------------------------------------------------------

def init_month_state(allocation, start_date: date):
    """
    Create a fresh SmartBudgetState for the given allocation.
    Called once per month when the user first visits Smart Budgeting or sets a salary.

    Handles Edge Case 7 (mid-month start): uses start_date, NOT the 1st of the month.
    Handles Edge Case 8 (month length): uses calendar.monthrange, never hardcoded 30.

    Returns the saved SmartBudgetState instance.
    """
    # Import here to avoid circular imports in unit tests
    from apps.budget.models import SmartBudgetState, WeekStatus, BucketBalance

    # The Smart Budget pool = the DSL bucket's current balance
    dsl_bb = BucketBalance.objects.filter(
        user=allocation.user,
        allocation=allocation,
        bucket_type="dsl",
    ).first()
    pool = dsl_bb.current_balance if dsl_bb else ZERO

    total_days = (date(allocation.year, allocation.month,
                       days_in_month(allocation.year, allocation.month)) - start_date).days + 1
    # One week = first 7 days from start_date (or partial if month ends sooner)
    week_end = min(start_date + timedelta(days=6),
                   date(allocation.year, allocation.month,
                        days_in_month(allocation.year, allocation.month)))

    remaining_weeks = max(1, (total_days + 6) // 7)

    dsl = safe_divide(pool, total_days)
    wsl = safe_divide(pool, remaining_weeks)

    state, created = SmartBudgetState.objects.get_or_create(
        user=allocation.user,
        allocation=allocation,
        defaults=dict(
            smart_budget_expense=pool,
            weekly_expense=ZERO,
            monthly_expense=ZERO,
            dsl=dsl,
            wsl=wsl,
            week_number=1,
            week_start_date=start_date,
            month_start_date=start_date,
            is_exhausted=False,
            is_month_settled=False,
            outstanding_deficit=ZERO,
        )
    )

    if created:
        # Create the first WeekStatus row
        WeekStatus.objects.create(
            state=state,
            week_number=1,
            week_start_date=start_date,
            week_end_date=week_end,
            wsl_at_start=wsl,
            dsl_at_start=dsl,
            budget_before_settlement=pool,
        )

    return state


# ---------------------------------------------------------------------------
# DSL / WSL recalculation
# ---------------------------------------------------------------------------

def recalculate_wsl_dsl(state, today: date) -> tuple:
    """
    Recompute and return (new_wsl, new_dsl) based on current state.
    Does NOT save — caller is responsible for updating state fields and saving.

    Returns (ZERO, ZERO) if state is exhausted or both remaining counts are 0
    (Edge Cases 2 and 3).
    """
    if state.is_exhausted or state.smart_budget_expense <= ZERO:
        return ZERO, ZERO

    remaining_days = get_remaining_days(
        state.month_start_date, state.week_start_date, today,
        state.allocation.year, state.allocation.month
    )
    remaining_weeks = get_remaining_weeks(state, today)

    new_dsl = safe_divide(state.smart_budget_expense, remaining_days)
    new_wsl = safe_divide(state.smart_budget_expense, remaining_weeks)
    return new_wsl, new_dsl


# ---------------------------------------------------------------------------
# Week totals helper
# ---------------------------------------------------------------------------

def compute_week_total(state, week_start: date, week_end: date) -> Decimal:
    """
    Sum all DailyExpenseEntry amounts whose expense_date falls within
    [week_start, week_end] for this state.
    """
    from apps.budget.models import DailyExpenseEntry
    from django.db.models import Sum

    result = DailyExpenseEntry.objects.filter(
        state=state,
        expense_date__gte=week_start,
        expense_date__lte=week_end,
    ).aggregate(total=Sum("amount"))["total"]
    return (result or ZERO).quantize(CENT, rounding=ROUND_HALF_UP)


# ---------------------------------------------------------------------------
# Week-end settlement
# ---------------------------------------------------------------------------

def settle_week(state, week_status, today: date) -> dict:
    """
    Run the week-end settlement logic for the given WeekStatus row.

    Week-end Rule (per spec):
      1. Deduct WSL from SmartBudgetExpense (always — the week's budget is "used").
      2a. If overspent (weekly_expense > WSL):
            Deduct the extra overage too.
            → smart_budget_expense -= WSL + overage = smart_budget_expense - weekly_total
      2b. If underspent (weekly_expense <= WSL):
            Carry surplus forward to monthly_expense.
            → monthly_expense += (WSL - weekly_total)

    Then recalculate WSL/DSL for remaining weeks.
    Saves both state and week_status.
    Returns a summary dict.

    All arithmetic is done in Decimal (Edge Case 10).
    Guards against divide-by-zero after settlement (Edge Case 2).
    Detects massive overspend and sets is_exhausted (Edge Case 3).
    """
    from django.utils import timezone
    import django.db.transaction as db_tx

    pool = state.smart_budget_expense.quantize(CENT, rounding=ROUND_HALF_UP)
    wsl = week_status.wsl_at_start.quantize(CENT, rounding=ROUND_HALF_UP)
    weekly_total = week_status.weekly_expense_total.quantize(CENT, rounding=ROUND_HALF_UP)

    # Step 1: always deduct the WSL for this week
    new_pool = pool - wsl

    if weekly_total > wsl:
        # Overspent: deduct the extra overage on top of the WSL already deducted
        overage = weekly_total - wsl
        new_pool = new_pool - overage
        delta = (wsl - weekly_total)  # negative
    else:
        # Underspent: carry surplus to monthly_expense
        surplus = wsl - weekly_total
        state.monthly_expense = (state.monthly_expense + surplus).quantize(CENT, rounding=ROUND_HALF_UP)
        delta = surplus  # positive

    # Step 2: check for massive overspend (Edge Case 3)
    if new_pool <= ZERO:
        state.is_exhausted = True
        state.smart_budget_expense = ZERO
        state.dsl = ZERO
        state.wsl = ZERO
    else:
        state.is_exhausted = False
        state.smart_budget_expense = new_pool.quantize(CENT, rounding=ROUND_HALF_UP)
        # Recalculate for next week (Edge Case 2 guard inside recalculate_wsl_dsl)
        new_wsl, new_dsl = recalculate_wsl_dsl(state, today)
        state.wsl = new_wsl
        state.dsl = new_dsl

    # Reset weekly_expense
    state.weekly_expense = ZERO

    # Update WeekStatus
    week_status.week_delta = delta.quantize(CENT, rounding=ROUND_HALF_UP)
    week_status.is_settled = True
    week_status.settled_at = timezone.now()
    week_status.save()
    state.save()

    return {
        "week_number": week_status.week_number,
        "weekly_total": str(weekly_total),
        "wsl": str(wsl),
        "delta": str(delta),
        "new_pool": str(state.smart_budget_expense),
        "is_exhausted": state.is_exhausted,
    }


# ---------------------------------------------------------------------------
# Advance to next week
# ---------------------------------------------------------------------------

def advance_to_next_week(state, today: date):
    """
    Create the WeekStatus for the next week and update state.week_start_date.
    Returns the new WeekStatus (unsettled) or None if month is over.
    """
    from apps.budget.models import WeekStatus

    end_of_month = date(state.allocation.year, state.allocation.month,
                        days_in_month(state.allocation.year, state.allocation.month))

    next_week_start = state.week_start_date + timedelta(days=7)
    if next_week_start > end_of_month:
        return None  # Month is over, don't advance

    next_week_end = min(next_week_start + timedelta(days=6), end_of_month)
    state.week_number += 1
    state.week_start_date = next_week_start
    state.save(update_fields=["week_number", "week_start_date"])

    ws = WeekStatus.objects.create(
        state=state,
        week_number=state.week_number,
        week_start_date=next_week_start,
        week_end_date=next_week_end,
        wsl_at_start=state.wsl,
        dsl_at_start=state.dsl,
        budget_before_settlement=state.smart_budget_expense,
    )
    return ws


# ---------------------------------------------------------------------------
# Edge Case 6: Catch up missed week-ends
# ---------------------------------------------------------------------------

def catch_up_missed_weeks(state, today: date) -> list:
    """
    Detect and settle all weeks whose week_end_date has passed but whose
    is_settled flag is still False.

    Processes them in chronological order (week_number ASC) so that each
    settlement's output feeds correctly into the next — this is the correct
    cascade order (Edge Case 6).

    Returns a list of settlement summary dicts (one per missed week settled).
    """
    from apps.budget.models import WeekStatus

    summaries = []

    while True:
        # Find the earliest unsettled week that has already ended
        pending = WeekStatus.objects.filter(
            state=state,
            is_settled=False,
            week_end_date__lt=today,
        ).order_by("week_number").first()

        if pending is None:
            break

        # Compute the actual total for that week from entries
        pending.weekly_expense_total = compute_week_total(
            state, pending.week_start_date, pending.week_end_date
        )
        pending.save(update_fields=["weekly_expense_total"])

        summary = settle_week(state, pending, today)
        summaries.append(summary)

        # After settling, advance to the next week if needed
        if state.week_start_date <= pending.week_end_date:
            advance_to_next_week(state, today)

    return summaries


# ---------------------------------------------------------------------------
# Edge Cases 4 & 5: Cascade recompute from a given week
# ---------------------------------------------------------------------------

def cascade_from_week(state, from_week_number: int, today: date) -> list:
    """
    Reopen the week starting at from_week_number and recompute ALL subsequent
    settled weeks in order — this handles Edge Cases 4 (retroactive logging)
    and 5 (editing/deleting expenses in a settled week).
    """
    from apps.budget.models import WeekStatus

    # Find all weeks from from_week_number onwards that were settled
    weeks_to_redo = list(WeekStatus.objects.filter(
        state=state,
        week_number__gte=from_week_number,
        is_settled=True,
    ).order_by("week_number"))

    if not weeks_to_redo:
        return []

    # 1. Reverse the original settlements in reverse chronological order
    for ws in reversed(weeks_to_redo):
        wsl = ws.wsl_at_start.quantize(CENT, rounding=ROUND_HALF_UP)
        delta = ws.week_delta.quantize(CENT, rounding=ROUND_HALF_UP)
        
        # Add back the WSL that was deducted
        state.smart_budget_expense = (state.smart_budget_expense + wsl).quantize(CENT, rounding=ROUND_HALF_UP)
        
        if delta > ZERO:
            # Underspent: reverse the surplus transfer
            state.monthly_expense = (state.monthly_expense - delta).quantize(CENT, rounding=ROUND_HALF_UP)
        elif delta < ZERO:
            # Overspent: reverse the overage deduction
            overage = abs(delta)
            state.smart_budget_expense = (state.smart_budget_expense + overage).quantize(CENT, rounding=ROUND_HALF_UP)
            
        if state.smart_budget_expense > ZERO:
            state.is_exhausted = False

    # 2. Re-apply settlements in chronological order
    summaries = []
    for ws in weeks_to_redo:
        # Re-snapshot the pre-settlement pool for this week
        ws.budget_before_settlement = state.smart_budget_expense
        
        # Recompute WSL/DSL for this week based on the corrected pool
        if not state.is_exhausted and state.smart_budget_expense > ZERO:
            # Calculate remaining weeks/days exactly as of this week's start date
            end_of_month = date(state.allocation.year, state.allocation.month, days_in_month(state.allocation.year, state.allocation.month))
            days_left = (end_of_month - ws.week_start_date).days + 1
            rem_weeks = max(0, (days_left + 6) // 7)
            rem_days = get_remaining_days(state.month_start_date, ws.week_start_date, ws.week_start_date, state.allocation.year, state.allocation.month)
            
            ws.wsl_at_start = safe_divide(state.smart_budget_expense, rem_weeks)
            ws.dsl_at_start = safe_divide(state.smart_budget_expense, rem_days)
        else:
            ws.wsl_at_start = ZERO
            ws.dsl_at_start = ZERO

        # Recompute the actual expense total for this week
        ws.weekly_expense_total = compute_week_total(
            state, ws.week_start_date, ws.week_end_date
        )
        ws.is_settled = False  # temporarily reopen for settle_week()
        ws.save()

        summary = settle_week(state, ws, today)
        summaries.append(summary)

    # After cascade, recalculate live wsl/dsl for the current (unsettled) week
    new_wsl, new_dsl = recalculate_wsl_dsl(state, today)
    state.wsl = new_wsl
    state.dsl = new_dsl
    state.save()
    return summaries


# ---------------------------------------------------------------------------
# Month-end settlement
# ---------------------------------------------------------------------------

def settle_month(state, today: date, ef_balance: Decimal) -> dict:
    """
    Run month-end settlement logic.

    Steps:
      1. If the last week is not yet settled, settle it first.
      2. Evaluate monthly_expense:
         - Positive (surplus): prompt user to allocate to Savings/Emergency Fund.
         - Negative (deficit): attempt to cover from Emergency Fund.
           - If EF has enough: full coverage, state is clean.
           - If EF is insufficient: partial coverage (Edge Case 1) — carry the
             remaining deficit forward as outstanding_deficit.
      3. Mark state.is_month_settled = True.

    Returns a dict describing what action the UI needs to take:
      {
        "status": "SURPLUS" | "DEFICIT" | "BALANCED",
        "amount": Decimal,
        "partially_covered": bool,   # only for DEFICIT
        "remaining_deficit": Decimal, # only when partially_covered
        "action_needed": "ALLOCATE" | "EF_COVERED" | "PARTIAL_EF" | "NONE",
      }

    Does NOT modify the Emergency Fund balance — that is done by the view layer
    via atomic transfer (so it can roll back on failure).
    """
    from apps.budget.models import WeekStatus

    # Settle the final active week if it hasn't been settled yet
    current_ws = WeekStatus.objects.filter(
        state=state,
        week_number=state.week_number,
        is_settled=False,
    ).first()

    if current_ws is not None:
        current_ws.weekly_expense_total = compute_week_total(
            state, current_ws.week_start_date, current_ws.week_end_date
        )
        current_ws.save(update_fields=["weekly_expense_total"])
        settle_week(state, current_ws, today)

    monthly = state.monthly_expense.quantize(CENT, rounding=ROUND_HALF_UP)

    if monthly >= ZERO:
        # Surplus or balanced
        result = {
            "status": "SURPLUS" if monthly > ZERO else "BALANCED",
            "amount": monthly,
            "action_needed": "ALLOCATE" if monthly > ZERO else "NONE",
            "partially_covered": False,
            "remaining_deficit": ZERO,
        }
        if monthly == ZERO:
            state.is_month_settled = True
            state.save(update_fields=["is_month_settled"])
        return result

    # Deficit case
    deficit = abs(monthly)
    if ef_balance >= deficit:
        # Emergency Fund can fully cover it
        result = {
            "status": "DEFICIT",
            "amount": deficit,
            "action_needed": "EF_COVERED",
            "partially_covered": False,
            "remaining_deficit": ZERO,
        }
        state.monthly_expense = ZERO
        state.outstanding_deficit = ZERO
        state.is_month_settled = True
        state.save(update_fields=["monthly_expense", "outstanding_deficit", "is_month_settled"])
        return result
    else:
        # Edge Case 1: Emergency Fund insufficient
        covered = ef_balance
        remaining = (deficit - covered).quantize(CENT, rounding=ROUND_HALF_UP)
        result = {
            "status": "DEFICIT",
            "amount": deficit,
            "action_needed": "PARTIAL_EF",
            "partially_covered": True,
            "remaining_deficit": remaining,
        }
        state.monthly_expense = ZERO
        state.outstanding_deficit = remaining
        # Do NOT set is_month_settled=True; user must acknowledge carry-forward
        state.save(update_fields=["monthly_expense", "outstanding_deficit"])
        return result


# ---------------------------------------------------------------------------
# Which week does a given date belong to?
# ---------------------------------------------------------------------------

def find_week_for_date(state, expense_date: date):
    """
    Return the WeekStatus whose [week_start_date, week_end_date] contains
    expense_date, or None if no such week exists (e.g. date before month start).
    """
    from apps.budget.models import WeekStatus
    return WeekStatus.objects.filter(
        state=state,
        week_start_date__lte=expense_date,
        week_end_date__gte=expense_date,
    ).first()


def is_date_in_settled_week(state, expense_date: date) -> bool:
    """Return True if expense_date falls in an already-settled week."""
    ws = find_week_for_date(state, expense_date)
    return ws is not None and ws.is_settled
