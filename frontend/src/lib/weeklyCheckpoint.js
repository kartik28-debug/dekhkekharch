/**
 * weeklyCheckpoint.js / smartBudgetEngine.js
 * 
 * Core mathematical engine for Monthly Wants Pool and Dynamic Weekly Spend Limit (DSL)
 * calculation rules:
 * 
 * 1. Salary & Date Anchor:
   * Assume all salary entries occur strictly on the 1st of the month (`day = 1`).
   * Determine total days in the current month dynamically (28, 29, 30, or 31 days).
 * 
 * 2. Monthly Wants Pool & Weekly Split Logic:
   * Case A: For February (28 days):
     * 100% of the Wants pool is divided evenly across 4 weeks.
     * Baseline Weekly Limit (WSL) = W / 4.
     * Month-end Cushion Buffer = 0.
   * Case B: For 30 or 31-day months (e.g., August - 31 days):
     * Exactly 93% (W * 0.93) is split evenly across the first 4 weeks (Days 1–28).
       * Weekly_Base = (W * 0.93) / 4
     * The remaining 7% (W * 0.07) is allocated as a dedicated month-end cushion buffer (Days 29, 30, 31).
 */

/**
 * Get total number of days in a month for a given year and month (1-indexed month).
 */
export function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/**
 * Returns YYYY-MM-DD string for a Date object or ISO string.
 */
export function toISODate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Core Mathematical Engine for Monthly Wants Pool and Dynamic Weekly Limits.
 * 
 * @param {number} monthlyWantsPool Total Monthly Wants budget (W)
 * @param {number} year 4-digit year (e.g., 2026)
 * @param {number} month 1-indexed month (1 = Jan, 8 = Aug, etc.)
 */
export function calculateMonthlyWantsBreakdown(monthlyWantsPool, year, month) {
  const W = Math.max(0, parseFloat(monthlyWantsPool) || 0);
  const totalDays = getDaysInMonth(year, month);

  let weeklyBase = 0;
  let cushionBuffer = 0;
  let fourWeeksPool = 0;

  if (totalDays === 28) {
    // Case A: February (28 days) — 100% split across 4 weeks
    fourWeeksPool = W;
    weeklyBase = Math.round(W / 4);
    cushionBuffer = 0;
  } else {
    // Case B: 30 or 31-day months — 93% split across 4 weeks, 7% Month-End Cushion
    fourWeeksPool = W * 0.93;
    weeklyBase = Math.round(fourWeeksPool / 4);
    cushionBuffer = Math.round(W * 0.07);
  }

  return {
    totalDays,
    monthlyWantsPool: W,
    fourWeeksPool: Math.round(fourWeeksPool),
    weeklyBase,
    cushionBuffer,
  };
}

/**
 * Maps day of the month (1-31) to week number (1-4) or Month-End Cushion period (Days 29+).
 * 
 * @param {number} dayOfMonth 1-based day of month
 */
export function getCurrentWeekFromDay(dayOfMonth) {
  if (dayOfMonth <= 7) return { weekNumber: 1, label: 'Week 1 of 4 (Days 1–7)', isCushion: false };
  if (dayOfMonth <= 14) return { weekNumber: 2, label: 'Week 2 of 4 (Days 8–14)', isCushion: false };
  if (dayOfMonth <= 21) return { weekNumber: 3, label: 'Week 3 of 4 (Days 15–21)', isCushion: false };
  if (dayOfMonth <= 28) return { weekNumber: 4, label: 'Week 4 of 4 (Days 22–28)', isCushion: false };
  return { weekNumber: 4, label: 'Month-End Cushion (Days 29+)', isCushion: true };
}

/**
 * Count remaining calendar days from today to end-of-month.
 */
export function getRemainingDays(monthStartDate, weekStartDate, todayDate, year, month) {
  const t = typeof todayDate === 'string' ? new Date(todayDate) : todayDate;
  t.setHours(0,0,0,0);
  
  const endOfMonth = new Date(year, month - 1, getDaysInMonth(year, month));
  endOfMonth.setHours(0,0,0,0);
  
  const diffTime = endOfMonth - t;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include today
  return Math.max(diffDays, 0);
}

/**
 * Count remaining weeks.
 */
export function getRemainingWeeks(weekStartDate, year, month) {
  const w = typeof weekStartDate === 'string' ? new Date(weekStartDate) : weekStartDate;
  w.setHours(0,0,0,0);
  
  const endOfMonth = new Date(year, month - 1, getDaysInMonth(year, month));
  endOfMonth.setHours(0,0,0,0);
  
  const diffTime = endOfMonth - w;
  const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  const weeks = Math.ceil(daysLeft / 7);
  return Math.max(weeks, 0);
}

/**
 * Determines if a given date falls within the boundaries of any settled week.
 */
export function isDateInSettledWeek(expenseDateStr, weekStatuses) {
  if (!weekStatuses || weekStatuses.length === 0) return false;
  
  const d = new Date(expenseDateStr);
  d.setHours(0,0,0,0);
  
  for (const ws of weekStatuses) {
    if (!ws.is_settled) continue;
    
    const start = new Date(ws.week_start_date);
    start.setHours(0,0,0,0);
    const end = new Date(ws.week_end_date);
    end.setHours(0,0,0,0);
    
    if (d >= start && d <= end) {
      return true;
    }
  }
  return false;
}

/**
 * Check if the active week's time is up.
 */
export function isWeekEnded(weekStartDateStr, todayStr) {
  if (!weekStartDateStr || !todayStr) return false;
  
  const w = new Date(weekStartDateStr);
  w.setHours(0,0,0,0);
  
  const t = new Date(todayStr);
  t.setHours(0,0,0,0);
  
  const diff = (t - w) / (1000 * 60 * 60 * 24);
  return diff >= 7;
}
