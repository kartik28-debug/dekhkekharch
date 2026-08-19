# Project Build Spec — Personal Finance App (Hackathon: Hack-4-Crown, Track 03 Fintech)

## 1. Product Overview

A proactive personal finance app that moves users from passive expense tracking to
active daily guidance. Core idea: instead of showing users what they already spent
(after the damage is done), the app gives live, recalculating spending limits, predicts
problems before they happen, and personalizes everything by lifestyle mode.

Problem it solves:
- Delayed feedback (monthly summaries flag overspending too late)
- No daily guidance for students/lower-income users on tight budgets
- Impulsive discretionary spending (food delivery, subscriptions) with no real-time friction
- Can't answer moment-of-decision questions: "How much can I safely spend today?",
  "Will I run out of money before month-end?", "Which goal should I prioritize?"
- No structured path to financial goals
- Investing feels like a black box

## 2. Tech Stack

- Backend: Django + Django REST Framework
- Frontend: React (built via Lovable/Claude, wired to backend APIs)
- Primary DB: PostgreSQL — Dev DB: SQLite3
- Auth: JWT (djangorestframework-simplejwt), stateless
- Caching/async: Redis, Celery
- ML: scikit-learn, XGBoost, pandas, numpy, FinBERT, yfinance, nsepython, ta, BeautifulSoup, requests
- Deployment: Render/Railway (free tier), single shared public URL for both devs + ML pair to integrate against
- Version control: GitHub, feature-branch workflow

## 3. Core App Structure — 4 Main Dashboard Sections

### Section 1: Major Expenses
Fixed monthly costs: Rent/Fees, Utilities, EMIs, Insurance, Other Fixed Expenses.
User sets/edits these. Feeds into total monthly allocation.

### Section 2: Dynamic Spend Limit (DSL)
- User sets a monthly DSL amount (e.g., ₹3,000)
- Broken into sub-categories: Food, Travel, Shopping, Entertainment, Others
- Core formula (reused everywhere in the app):

```
weekly_limit = remaining_budget / weeks_left
```

- Recalculates on every transaction, live
- Weekly loop:
  - If weekly_spending > weekly_budget → overspent = spent - budget →
    next_week_budget = budget - overspent (redistribute deficit across remaining weeks)
  - If weekly_spending <= weekly_budget → underspent = budget - spent →
    next_week_budget = budget + underspent (redistribute surplus)
- This same function should be reused for: overall DSL, and each DSL sub-category
  independently (per-category weekly limit, recalculating same way)
- Each category has its OWN emergency-fund trigger (confirmed by user) — i.e., categories
  are siloed, no cross-category slack borrowing; overspend in one category taps the
  Emergency Fund directly for that category's overage

### Section 3: Savings
- User splits savings amount into: Goal Savings vs Stocks/Investment
- **Smart Goal Prioritization Engine (FIFO)**: automatically arranges goals in ascending
  order of target amount, completes lowest-cost goal first, then moves to next goal
  (prevents "goal fatigue" from spreading savings too thin)
- Month-end: if there's leftover unspent budget, prompt user — "put this in savings or
  toward a goal?" (default behavior for non-response needs to be decided: e.g. auto-goes
  to savings after N days)

### Section 4: Emergency Fund (aka "Buffer Reserve" — NAMING NOT YET UNIFIED,
   pick one term across the whole codebase before building)
- Opening balance carried forward from previous month
- Used when DSL (or a specific category) is exhausted before month-end
- Replenished from Savings when possible
- If Emergency Fund itself is empty when needed → fall back to using Savings
  (Goal/Stocks) to cover the expense, and reduce that allocation accordingly

## 4. Monthly Cycle Flow (full sequence)

1. User opens app → Login/Signup → Dashboard (4 sections)
2. User configures all 4 sections (Major Expenses, DSL + sub-categories, Savings split, — Emergency Fund is just tracked, not manually configured)
3. Monthly Income Input (e.g., ₹10,000)
4. Auto Allocation: splits income into Major Expenses / DSL / Savings / Emergency Fund carry-forward
5. "Start Month" — locks in allocation for the month
6. Weekly recalculating loop runs continuously as transactions are logged (see DSL formula above)
7. Month-end check: "Is DSL exhausted before month-end?"
   - No → straight to End of Month
   - Yes → "Is Emergency Fund available?"
     - Yes → use Emergency Fund, notify user + show alert
     - No → use Savings (Goal/Stocks) to cover, reduce that allocation, notify user + show alert
8. End of Month → Generate Reports & Insights: Spending vs Budget, Goal Progress,
   Investment Performance, Emergency Fund Status
9. Cycle repeats for next month

## 5. ML-Powered Features

### a) Market Awareness Engine
- Binary classification (stock up/down) on 4–5 selected companies only — not
  market-wide prediction
- Features: news sentiment (scraped + FinBERT), NSE/BSE bulk deal data, FII/DII net
  flow, delivery volume %, price momentum
- Label = actual next-day price direction (kept strictly separate from sentiment score,
  which is a FEATURE not the label — avoid circular predictions)
- Walk-forward (chronological) train/test split — NOT random split, respects
  time-ordering of financial data
- Two models trained in parallel and compared: Random Forest vs XGBoost
- Output includes: prediction, confidence %, model used, top contributing features
- UI framing: always shown as an educational signal with historical accuracy attached,
  never as a directive/trade command

### b) Personalized Risk Management / Intelligent Portfolio Management
- Evaluates income, savings, demographics, financial goals, spending behavior
- Outputs a risk profile + recommended allocation (equity/debt/liquid split)
- Portfolio view: consolidated investments, liquidity, risk exposure, returns, allocation

### c) (Optional/earlier-discussed) Cash-flow forecaster
- Regression on user's own transaction history (day-of-month, category velocity,
  recurring expense flags) to forecast if/when they'll breach their monthly budget,
  days in advance — pure first-party data, no external dependency


## 7. Database Models (rough outline)

- User (auth, mode/lifestyle preference: Focus/Balanced/Foody)
- MonthlyAllocation (income, major_expenses_total, dsl_total, savings_total, month, year)
- MajorExpense (user, name, amount)
- DSLCategory (user, category_name, monthly_budget, spent_so_far)
- Transaction (user, category, amount, date) — all money-movement operations wrapped
  in Django atomic transactions to prevent partial/"ghost" updates
- Goal (user, name, target_amount, current_amount, priority_order, is_active, is_complete)
- EmergencyFund (user, balance, last_replenished_date)
- Portfolio (user, investments, risk_profile, allocation) — populated via ML contract
- MLPrediction (company, prediction, confidence, model_used, date) — cache of ML output

## 8. things to do for dev (2 devs, vertical feature ownership)

- Auth, onboarding, income entry, mode selection
- Major Expenses CRUD
- Auto Allocation logic
- DSL engine (the core reusable weekly-limit formula) + sub-categories
- Weekly recalculation loop (overspend/underspend redistribution)
- Personalized Budgeting (Needs/Wants/Savings custom split)

- Goal model + FIFO Goal Prioritization Engine
- Emergency Fund model, trigger logic, Savings fallback
- Portfolio Management view (mock data first, wire to real ML output later — this is
  the ONE integration point that depends on the ML team's delivery)
- Reports & Insights aggregation screen

Shared foundation built together first: project scaffold, DB schema, JWT auth,
deployment skeleton on Render/Railway (single public URL — avoids the
laptop-networking/CORS issues from previous project).

## 9. Known Edge Cases To Handle

- New category added mid-month — no prior weeks of data for weekly limit basis
- Category budget = 0 or unset — block spending, unlimited, or route to misc bucket?
- Category budget changed mid-week — apply immediately or only next week? (decided:
  ratio/budget changes apply going FORWARD only, not retroactive)
- Refunds/reversals — does deleting a transaction restore the weekly limit?
- Emergency Fund itself runs out — negative balance, blocked, or borrow from savings?
- Multiple categories overspend same week — log each Emergency Fund deduction independently
- Partial first/last week of month (weeks don't divide evenly) — use CALENDAR weeks
  (Mon–Sun), last week may be shorter, divide by actual days left in that partial week
- User signs up mid-month — how is "week 1" defined for them?
- Month-end prompt with no response — needs a default (e.g., auto-route to savings after N days)
- Negative leftover (overspent, not underspent) — month-end prompt must not ask
  "where to put the surplus" when there isn't one
- Rolling unspent weekly amounts — decide explicitly whether leftover rolls into next
  week's limit or is simply reflected in the standard recalculation (avoid silent/accidental behavior)

## 10. Product Naming / Terminology Notes

- No final product name locked in yet (deck currently only shows event/team name)
- "Emergency Fund" vs "Buffer Reserve" used inconsistently across existing slides —
  PICK ONE TERM and use it consistently across the entire codebase (models, endpoints,
  UI labels, docs) before building
- ML-facing predictions and risk-profile outputs should ALWAYS be delivered with a
  confidence/accuracy figure and non-directive language in the UI — avoid "buy/sell"
  imperative phrasing anywhere in frontend copy

## 11. Constraints & Ground Rules


- Team: 2 devs (this spec) + 2 ML engineers (own the Market Awareness Engine +
  Risk/Portfolio ML pipeline, deliver via the API contract above)