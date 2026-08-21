/**
 * smartBudgetEngine.js (formerly weeklyCheckpoint.js)
 * 
 * Pure calculation logic for Smart Budgeting state, mirroring the backend
 * `core/services/smart_budget_engine.py` exactly. Used for instant UI feedback
 * and date checks.
 * 
 * All arithmetic uses standard JS Math (with rounding) since we don't have
 * a Decimal library. The backend is the ultimate source of truth.
 */

/**
 * Get days in a month.
 */
export function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/**
 * Returns YYYY-MM-DD for a Date object.
 */
export function toISODate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  
  // Need local timezone YYYY-MM-DD, not UTC
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
 * Uses the `week_statuses` array from the state payload.
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
  
  // Week ends after 7 days
  const diff = (t - w) / (1000 * 60 * 60 * 24);
  return diff >= 7;
}
