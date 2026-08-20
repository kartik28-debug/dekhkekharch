"""
Calendar week utilities.

Architecture §11 rule: weeks are Mon–Sun; partial weeks count as 1 week.
This module is the single source of truth for "weeks left in month" so that
both the DSL engine and the allocation service agree on the same value.
"""

from datetime import date, timedelta


def _start_of_week(d: date) -> date:
    """Return the Monday of the week containing *d*."""
    return d - timedelta(days=d.weekday())  # weekday(): Mon=0, Sun=6


def get_weeks_left(reference_date: date | None = None) -> int:
    """
    Return the number of Mon–Sun calendar weeks that are fully or partially
    remaining in the current month, counting from *reference_date* (inclusive).

    A partial week — e.g. if the month ends on a Wednesday — still counts as
    1 week (guard clause from architecture.md §6).

    Args:
        reference_date: The date to measure from.  Defaults to today.

    Returns:
        Integer ≥ 1.  Never 0.

    Examples:
        Called on Mon 2026-08-03 (week 1 of Aug) → 4 or 5 depending on month.
        Called on Mon 2026-08-31 (last day) → 1.
    """
    today = reference_date or date.today()

    # Last day of current month
    if today.month == 12:
        last_day = today.replace(year=today.year + 1, month=1, day=1) - timedelta(days=1)
    else:
        last_day = today.replace(month=today.month + 1, day=1) - timedelta(days=1)

    # Walk forward week-by-week from the start of today's week to end of month
    week_start = _start_of_week(today)
    weeks = 0
    while week_start <= last_day:
        weeks += 1
        week_start += timedelta(weeks=1)

    return max(weeks, 1)  # guard: never return 0
