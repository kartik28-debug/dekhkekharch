# Design Decisions — Personal Finance App
> Hack-4-Crown · Track 03 Fintech

This document records every significant design choice, the reasoning behind it, and the rule it enforces going forward. Any team member (dev or ML) must read this before writing code.

---

## 1. Naming & Terminology

### 1.1 Canonical Term: `EmergencyFund`
**Decision**: Use `EmergencyFund` everywhere — Django model name, API endpoint path, frontend component names, UI copy, and documentation.

**Why**: The spec uses both "Emergency Fund" and "Buffer Reserve" inconsistently. Picking one term now prevents schema drift and confusing API contracts mid-sprint.

**Enforcement**:
- Django model: `EmergencyFund`
- API endpoint: `/api/emergency-fund/`
- Frontend: `<EmergencyFundCard />`, `useEmergencyFund()` hook
- UI label: "Emergency Fund"
- **Never use**: "Buffer Reserve", "buffer_reserve", "BufferReserve" anywhere in the codebase

### 1.2 Lifestyle Mode Values
**Enum**: `FOCUS` | `BALANCED` | `FOODY`
Store as string in DB. Used to personalize default category budget splits.

### 1.3 Risk Profile Values
**Enum**: `LOW` | `MEDIUM` | `HIGH`
Delivered by ML team, stored in `portfolio_portfolio.risk_profile`.

### 1.4 DSL Category Names
**Canonical list**: `Food` | `Travel` | `Shopping` | `Entertainment` | `Others`
Do not abbreviate or rename. These are stored as CharField values in DB.

---

## 2. DSL Engine Design

### 2.1 One Canonical Function
The weekly-limit recalculation logic lives in exactly one place: `core/services/dsl_engine.py → recalculate_weekly_limit()`.
It is called by:
- The overall DSL view
- Every per-category DSL view
- The month-end report aggregator

**Never duplicate this formula** in views, serializers, or Celery tasks — always import from `core.services.dsl_engine`.

### 2.2 No Cross-Category Borrowing
Each DSL category is siloed. If `Food` is exhausted, it cannot borrow from `Travel`'s surplus.
Overflows go directly to the EmergencyFund for that specific category.

### 2.3 Forward-Only Budget Changes
When a user edits a category budget mid-month:
- The new budget applies from the **current week forward**
- Already-recorded transactions are **never retroactively recalculated**
- Implementation: recalculate `spent_so_far` using only transactions from `week_start` to `today`, then apply new `monthly_budget` to get new `remaining_budget`

### 2.4 Calendar Week Definition
- Week = Mon–Sun (ISO calendar)
- `get_weeks_left()` counts remaining Mon–Sun weeks in the current calendar month, including the current (possibly partial) week
- Partial last week of month: treated as 1 week; the recalculation naturally handles shorter periods since `remaining_budget / 1` gives the total remainder as the limit

### 2.5 Mid-Month Signup
- User's "week 1" starts on their `signup_date`'s Monday
- `get_weeks_left()` is called relative to `signup_date`'s calendar week if the user is in their first month

### 2.6 Refunds / Reversals
- Reversals are logged as a `Transaction` with `amount < 0` and `is_reversed = True`
- Negative amounts restore the category's `spent_so_far`, which feeds directly into `recalculate_weekly_limit()`
- Deleting transactions is NOT allowed — always create a reversal entry for auditability

### 2.7 New Category Added Mid-Month
- `spent_so_far = 0`, weeks_left = current `get_weeks_left()`
- Weekly limit = `monthly_budget / weeks_left` (standard formula, no special case)
- Edge case is handled naturally

---

## 3. Atomic Transactions

**Rule**: Every operation that moves money MUST be wrapped in `django.db.transaction.atomic()`.

This includes:
- Logging a transaction (update `DSLCategory.spent_so_far`)
- Triggering EmergencyFund deduction
- Savings → EmergencyFund replenishment
- Goal amount updates
- Month-end redistribution

**Why**: Prevents "ghost" partial updates where, e.g., the Transaction record is saved but `spent_so_far` is not updated due to a mid-flight exception.

---

## 4. Emergency Fund Cascade Logic

```
Transaction logged → DSLCategory budget exhausted?
│
├── NO  → recalculate_weekly_limit(), update response. Done.
│
└── YES → EmergencyFund trigger confirmed by user for this category?
    │
    ├── NO  → Block transaction with error: "Category budget exhausted. 
    │          Enable Emergency Fund trigger to continue."
    │
    └── YES → EmergencyFund.balance > 0?
        │
        ├── YES → Deduct from EF atomically. Notify user. Log EF deduction.
        │
        └── NO  → Savings > 0?
            │
            ├── YES → Deduct from Goal savings (reduce current_amount or
            │          target allocation). Notify user. Log fallback.
            │
            └── NO  → Block transaction. Show alert:
                       "All funds exhausted. Cannot log this expense."
```

**Key rule**: Log each EmergencyFund deduction independently per category. Multiple categories can overdraw the EF in the same week — each deduction is a separate log entry.

---

## 5. Goal Engine Design

### 5.1 FIFO Priority
Goals are always sorted ascending by `target_amount`. The smallest-target goal receives all goal savings first until complete (`is_complete = True`), then the next goal becomes active.

**Why**: Prevents goal fatigue — users see one goal completing quickly, which reinforces the habit.

### 5.2 Month-End Surplus Prompt
At month-end, if `remaining_budget > 0`:
- Prompt user: "You have ₹X left. Add to savings or goal?"
- If no response within **N days** (decide N before building — recommend 3 days): auto-route to savings
- If `remaining_budget <= 0`: do NOT show the prompt (no surplus exists)

### 5.3 Leftover Weekly Budget
Rolling unspent weekly amounts are NOT treated as a separate "rollover" balance. The standard `recalculate_weekly_limit()` formula naturally absorbs them: `remaining_budget` includes all unspent amounts, which are then divided by `weeks_left`. There is no silent/separate rollover mechanism.

---

## 6. ML Output Design Rules

### 6.1 Sentiment Score is a FEATURE, Not a Label
FinBERT sentiment score feeds INTO the model as an input feature.
The label is **actual next-day price direction** (UP/DOWN) derived from real price data.
This separation must be maintained in the training pipeline — a sentiment-derived label would create circular predictions.

### 6.2 Walk-Forward (Chronological) Train/Test Split
Financial data is time-ordered. Random splits leak future data into training.
Train on earlier dates → test on later dates. Never shuffle before splitting.

### 6.3 Two Models in Parallel
Random Forest and XGBoost are both trained and their performance compared.
The better performer's output is used in production, but both `model_used` and `confidence` are always stored in `MLPrediction`.

### 6.4 UI Non-Directive Language
Every ML output in the UI must:
- Show `confidence` (e.g., "74% historical accuracy")
- Include a disclaimer: "This is an educational signal, not a trade recommendation."
- Never use imperative words: "buy", "sell", "invest now", "avoid"
- Use framing: "The model suggests upward movement", "Signal indicates..."

### 6.5 Watched Companies Scope
Predictions are generated for **4–5 pre-selected companies only**.
No market-wide prediction. Company list is agreed upon before ML team begins training.

---

## 7. API Design Conventions

### 7.1 URL Structure
```
/api/auth/           - Authentication
/api/budget/         - Major expenses, monthly allocation
/api/dsl/            - DSL categories, transactions, weekly limits
/api/goals/          - Goal CRUD, progress
/api/emergency-fund/ - EmergencyFund balance, history
/api/portfolio/      - Portfolio view, risk profile
/api/reports/        - Month-end reports, insights
/api/ml/             - ML bridge (predictions, risk profile, forecast)
```

### 7.2 Response Format
All API responses follow:
```json
{
  "status": "success" | "error",
  "data": { ... },
  "message": "Human readable message"
}
```

### 7.3 Error Handling
- `400` — Validation errors (e.g., amount exceeds budget)
- `401` — Unauthenticated
- `403` — Authenticated but not authorized
- `404` — Resource not found
- `409` — Conflict (e.g., month already locked)
- `500` — Server error (never expose stack traces in prod)

### 7.4 Decimal Precision
All monetary amounts stored as `DecimalField(max_digits=12, decimal_places=2)`.
Never use `FloatField` for money — floating point rounding errors in financial calculations are unacceptable.

---

## 8. Frontend Design Conventions

### 8.1 INR Formatting
All currency displayed as: `₹1,23,456.00` (Indian numbering system)
Use a shared `formatINR(amount)` utility — never inline format in components.

### 8.2 Color Coding for Budget Status
| Status | Color |
|---|---|
| Healthy (> 50% remaining) | Green |
| Warning (20–50% remaining) | Amber/Yellow |
| Critical (< 20% remaining) | Orange |
| Exhausted / Overspent | Red |

### 8.3 ML Section Styling
Market Awareness Engine section must always be visually differentiated (e.g., distinct card background, "AI Signal" badge) to signal to users that it is predictive/educational, not factual.

### 8.4 State Management
- Global auth state: `AuthContext`
- Monthly allocation state: `BudgetContext`
- DSL + category state: local + API-driven (no heavy client-side caching — always re-fetch on transaction)

---

## 9. Security Rules

- JWT access tokens: 15 min expiry. Never stored in `localStorage` — store in memory or `httpOnly` cookies.
- Refresh tokens: 7 days, rotated on use, stored in `httpOnly` cookie.
- CORS: backend allows only the shared public URL origin (no wildcard `*` in prod).
- All endpoints require authentication except `/api/auth/register/` and `/api/auth/login/`.
- User data is scoped — every queryset must filter by `request.user`. Never expose another user's data.

---

## 10. Open Decisions (Must Resolve Before Building)

| # | Decision | Status |
|---|---|---|
| 1 | Month-end surplus prompt auto-route after how many days? | **Unresolved** |
| 2 | Final product name | **Unresolved** |
| 3 | Which 4–5 companies for ML Market Awareness? | **Unresolved — ML team to decide** |
| 4 | JWT storage: memory vs httpOnly cookie? | **Recommend httpOnly cookie** |
| 5 | Category budget = 0: block spending or unlimited? | **Recommend: block with message** |
| 6 | EmergencyFund trigger: opt-in per category or global? | **Per-category (confirmed by spec)** |
