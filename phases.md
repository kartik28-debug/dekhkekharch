# Development Phases — Personal Finance App
> Hack-4-Crown · Track 03 Fintech

Phases are sequential. Phase 0 is built together by both devs before splitting into feature ownership. Each phase has a clear exit condition — do not start the next phase until all items in the current phase are working and tested.

---

## Phase 0 — Shared Foundation (Both Devs)
> Goal: Establish the project skeleton so both devs can work in parallel without merge conflicts.

### 0.1 Repository Setup
- [ ] Create GitHub repo, add both devs as collaborators
- [ ] Define branch naming convention: `feature/<name>`, `fix/<name>`, `chore/<name>`
- [ ] Set up `.gitignore` for Python, Node, `.env` files
- [ ] Create `backend/` and `frontend/` directories

### 0.2 Backend Scaffold
- [ ] `django-admin startproject config backend/`
- [ ] Split settings into `base.py` / `dev.py` / `prod.py`
- [ ] Install and configure: DRF, simplejwt, django-cors-headers, python-decouple
- [ ] Create all Django apps: `accounts`, `budget`, `dsl`, `savings`, `emergency_fund`, `portfolio`, `reports`, `ml_bridge`
- [ ] Create `core/` package with `services/` and `utils/` structure
- [ ] Wire all apps into `INSTALLED_APPS`
- [ ] Configure `urls.py` with app-level URL routing
- [ ] Set up `requirements/base.txt`, `dev.txt`, `prod.txt`

### 0.3 Database Schema
- [ ] Write all models (see `architecture.md` Section 5)
- [ ] Run initial migrations on SQLite3 (dev)
- [ ] Verify schema in Django admin
- [ ] Write model `__str__` methods for all models

### 0.4 JWT Auth
- [ ] Configure `simplejwt`: 15 min access / 7 day refresh / token rotation on
- [ ] Create `accounts/views.py`: `RegisterView`, `LoginView`
- [ ] Wire `/api/auth/register/` and `/api/auth/login/`
- [ ] Test auth flow end-to-end with Postman/httpie

### 0.5 Deployment Skeleton
- [ ] Create `Procfile` / `render.yaml` / `railway.toml`
- [ ] Configure environment variables: `SECRET_KEY`, `DATABASE_URL`, `REDIS_URL`, `DEBUG`
- [ ] Deploy skeleton to Render/Railway — confirm single public URL is live
- [ ] Both devs confirm they can hit the public URL and get a valid API response
- [ ] Frontend `.env`: set `VITE_API_BASE_URL` to the public URL

### 0.6 Frontend Scaffold
- [ ] `npm create vite@latest frontend -- --template react`
- [ ] Install: axios, react-router-dom, recharts (for charts)
- [ ] Set up `axiosClient.js` with JWT interceptor + silent refresh logic
- [ ] Set up React Router with placeholder pages for all routes
- [ ] Set up `AuthContext`

**Phase 0 Exit Condition**: Both devs can register, login, get a JWT, and hit a protected endpoint — from the shared public URL.

---

## Phase 1 — Core Budget Engine (Dev 1 Lead)

### 1.1 Major Expenses
- [ ] `MajorExpense` CRUD endpoints: `GET`, `POST`, `PATCH`, `DELETE`
- [ ] List endpoint returns total sum
- [ ] Frontend: Major Expenses form + list view

### 1.2 Income Entry + Auto Allocation
- [ ] `MonthlyAllocation` creation endpoint
- [ ] Auto Allocation service: `income - major_expenses_total = allocatable`; split into DSL + Savings + EmergencyFund carry-forward
- [ ] Expose allocation preview before locking
- [ ] "Start Month" endpoint: sets `is_locked = True`
- [ ] Frontend: Income entry screen + allocation preview + "Start Month" CTA

### 1.3 Mode Selection
- [ ] Onboarding screen: user selects `FOCUS` / `BALANCED` / `FOODY`
- [ ] Mode stored on User model
- [ ] Mode influences default DSL category split percentages (hardcode sensible defaults per mode)

### 1.4 DSL Engine — Core
- [ ] Implement `core/services/dsl_engine.py` → `recalculate_weekly_limit()`
- [ ] Implement `core/utils/week_utils.py` → `get_weeks_left()`, `get_calendar_week_bounds()`
- [ ] Unit tests: overspend redistribution, underspend redistribution, partial week, new category mid-month, refund/reversal, month boundary

### 1.5 DSL Categories + Transactions
- [ ] `DSLCategory` CRUD
- [ ] `Transaction` POST (with atomic update of `spent_so_far`)
- [ ] Transaction POST response includes fresh `recalculate_weekly_limit()` result
- [ ] Reversal: POST transaction with negative amount, `is_reversed=True`
- [ ] Frontend: DSL dashboard card per category, weekly limit display, transaction log form

**Phase 1 Exit Condition**: User can log transactions, see live weekly limits recalculate, and the atomic transaction wrapping is verified by inspecting DB state after a failed mid-flight operation.

---

## Phase 2 — Savings, Goals & Emergency Fund (Dev 2 Lead)

### 2.1 Goal Model + FIFO Engine
- [ ] `Goal` CRUD endpoints
- [ ] `core/services/goal_engine.py` → `reprioritize_goals()`: sorts goals ascending by `target_amount`, assigns `priority_order`
- [ ] Called every time a goal is created, deleted, or completed
- [ ] Endpoint: `GET /api/goals/active/` → returns the current active goal (lowest `priority_order` where `is_complete=False`)
- [ ] Frontend: Goals list, progress bar per goal, active goal highlighted

### 2.2 Emergency Fund
- [ ] `EmergencyFund` model (one per user, created on signup)
- [ ] `core/services/emergency_fund.py` → `trigger_emergency_fund(user, category, amount)`:
  - Check `emergency_fund_trigger_confirmed` on category
  - Check EF balance
  - If EF > 0: deduct atomically, log deduction
  - If EF = 0: deduct from Savings, reduce goal allocation, log fallback
  - Return status + message for frontend alert
- [ ] Endpoint: `GET /api/emergency-fund/` → balance + deduction history
- [ ] Frontend: Emergency Fund balance card, alert banner when triggered

### 2.3 Month-End Flow
- [ ] Celery task: fires on last day of month
- [ ] Generates month-end summary: spending vs budget per category, goal progress, EF status
- [ ] If `remaining_budget > 0`: create a `SurplusPrompt` record, notify user (push/in-app)
- [ ] Endpoint: `POST /api/budget/surplus-decision/` → `{ "action": "savings" | "goal" }`
- [ ] Default after N days (3 days recommended): auto-route to savings
- [ ] Frontend: Month-end modal with surplus decision prompt

### 2.4 Personalized Budgeting
- [ ] Allow user to set custom Needs/Wants/Savings percentage split
- [ ] Validation: percentages must sum to 100
- [ ] Apply to auto-allocation computation

**Phase 2 Exit Condition**: Goals complete via FIFO order, EmergencyFund cascade triggers correctly (verified by unit tests + manual Postman test), month-end surplus prompt works.

---

## Phase 3 — Portfolio & ML Integration (Dev 2 + ML Team)

### 3.1 Portfolio View (Mock Data First)
- [ ] `Portfolio` model seeded with mock data
- [ ] `GET /api/portfolio/` returns: risk profile, allocation percentages, total invested, liquidity
- [ ] Frontend: Portfolio dashboard card (equity/debt/liquid donut chart)

### 3.2 ML Bridge — Wire to Real ML Output
- [ ] `GET /api/ml/predictions/` → consumed from ML team's service, cached in `MLPrediction` (Redis + DB)
- [ ] `GET /api/ml/risk-profile/` → consumed + stored in `Portfolio`
- [ ] `GET /api/ml/cashflow-forecast/` → optional, surfaced as a warning banner
- [ ] Celery beat task: refresh ML predictions daily
- [ ] Frontend: Market Awareness card (4–5 companies), confidence %, educational disclaimer, non-directive language enforced

### 3.3 Intelligent Portfolio Management
- [ ] Wire ML risk profile to portfolio allocation recommendation
- [ ] User can see recommended vs current allocation
- [ ] Show top contributing factors (from ML `top_features`)

**Phase 3 Exit Condition**: Portfolio section shows real ML output with confidence %, disclaimer text present, "buy/sell" language absent from all frontend copy.

---

## Phase 4 — Reports & Insights

### 4.1 Month-End Report
- [ ] `GET /api/reports/monthly/?month=8&year=2026`
- [ ] Returns: spending vs budget per category, goal progress %, EF events, investment performance
- [ ] Frontend: Reports page with charts (bar: spending vs budget, line: daily spend curve)

### 4.2 Insights
- [ ] Rule-based insights (no ML required):
  - "You saved ₹X more than last month"
  - "Food spending was 30% over budget — consider reducing delivery orders"
  - "Goal: Laptop is 65% complete"
- [ ] At least 3 insights generated per month-end report

**Phase 4 Exit Condition**: Reports page renders a complete month-end view with charts and at least 3 insights.

---

## Phase 5 — Polish, Edge Cases & Deployment

### 5.1 Edge Case Hardening
- [ ] New category mid-month → standard formula, no special case needed; verify behavior
- [ ] Category budget = 0 → block transaction with clear error message
- [ ] EmergencyFund goes negative → must not go below 0; block and fall back to savings
- [ ] User signs up mid-month → `get_weeks_left()` relative to signup Monday
- [ ] No response to month-end prompt → Celery task auto-routes after 3 days
- [ ] Month-end with no surplus (overspent) → suppress surplus prompt
- [ ] Multiple categories overdraw EF same week → each logged independently

### 5.2 Security Hardening
- [ ] All querysets filtered by `request.user`
- [ ] CORS: restrict to production URL only
- [ ] Rate limiting on auth endpoints (django-ratelimit or DRF throttling)
- [ ] Remove `DEBUG=True` in prod settings
- [ ] Add `SECURE_HSTS_SECONDS`, `SECURE_SSL_REDIRECT` for prod

### 5.3 Final Deployment & Integration Test
- [ ] Full end-to-end test on shared public URL (all 4 team members)
- [ ] ML team confirms prediction endpoints respond correctly
- [ ] Frontend confirms all API responses render correctly on prod URL
- [ ] Smoke test: register → onboard → set income → configure DSL → log transaction → verify weekly limit updates

---

## Milestone Summary

| Milestone | Target | Owner |
|---|---|---|
| Phase 0 complete — shared foundation live | Day 1 | Both Devs |
| Phase 1 complete — DSL engine + transactions | Day 2–3 | Dev 1 |
| Phase 2 complete — Goals + EmergencyFund | Day 2–3 | Dev 2 |
| Phase 3 complete — Portfolio + ML wired | Day 3–4 | Dev 2 + ML Team |
| Phase 4 complete — Reports | Day 4 | Dev 1 |
| Phase 5 complete — Polish + final deploy | Day 4–5 | Both Devs |

---

## Branch Strategy

```
main           ← production; only merged via PR
develop        ← integration branch; feature branches merge here
feature/auth
feature/dsl-engine
feature/goals
feature/emergency-fund
feature/portfolio
feature/reports
feature/ml-bridge
```

- PRs require at least one other dev to review before merging into `develop`
- `develop` → `main` merge only after Phase 5 smoke test passes
