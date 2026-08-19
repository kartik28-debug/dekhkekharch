# Architecture — Personal Finance App
> Hack-4-Crown · Track 03 Fintech

---

## 1. High-Level System Overview

```
┌─────────────────────────────────────────────────────────┐
│                        CLIENT                           │
│              React SPA (Vite)                           │
│   Auth · Dashboard · DSL · Goals · Portfolio · Reports  │
└────────────────────┬────────────────────────────────────┘
                     │  HTTPS  (JWT Bearer token)
                     ▼
┌─────────────────────────────────────────────────────────┐
│                   BACKEND (Django + DRF)                │
│                                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │   Auth   │ │  Budget  │ │  Goals   │ │   ML     │  │
│  │  /api/   │ │  /api/   │ │  /api/   │ │  /api/   │  │
│  │  auth/   │ │ budget/  │ │ goals/   │ │   ml/    │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │          Core Business Logic Layer               │  │
│  │  DSLEngine · AllocationService · GoalEngine      │  │
│  │  EmergencyFundService · ReportAggregator         │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  ┌────────────┐          ┌──────────────────────────┐  │
│  │   Celery   │◄────────►│         Redis            │  │
│  │  Workers   │          │  (Cache + Task Queue)    │  │
│  └────────────┘          └──────────────────────────┘  │
└────────┬────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│                   DATABASE LAYER                        │
│   Dev: SQLite3            Prod: PostgreSQL               │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│                    ML PIPELINE                          │
│   (Owned by ML team — integrates via API contract)      │
│                                                         │
│  ┌───────────────────┐   ┌───────────────────────────┐  │
│  │ Market Awareness  │   │  Risk/Portfolio Engine    │  │
│  │  Engine           │   │                           │  │
│  │  RF + XGBoost     │   │  Risk Profiler            │  │
│  │  FinBERT Sentiment│   │  Allocation Recommender   │  │
│  │  NSE/BSE Data     │   │  Portfolio Tracker        │  │
│  └───────────────────┘   └───────────────────────────┘  │
│                                                         │
│  ┌───────────────────┐                                  │
│  │ Cash-flow         │                                  │
│  │ Forecaster        │  (Optional)                      │
│  │ (Regression)      │                                  │
│  └───────────────────┘                                  │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| **Frontend** | React (Vite) | Wired to backend REST APIs |
| **Backend** | Django 4.x + Django REST Framework | Python 3.11+ |
| **Auth** | `djangorestframework-simplejwt` | Stateless JWT; access + refresh tokens |
| **DB (Dev)** | SQLite3 | Local dev only |
| **DB (Prod)** | PostgreSQL | Render/Railway managed |
| **Caching** | Redis | API response caching, session-less state |
| **Async Tasks** | Celery + Redis broker | Monthly cycle triggers, alert dispatching |
| **ML** | scikit-learn, XGBoost, pandas, numpy | Model training + inference |
| **NLP** | FinBERT | News sentiment scoring (feature, not label) |
| **Market Data** | yfinance, nsepython, ta | Price data, NSE bulk deal feeds, technical indicators |
| **Scraping** | BeautifulSoup, requests | News article scraping |
| **Deployment** | Render / Railway (free tier) | Single shared public URL |
| **Version Control** | GitHub | Feature-branch workflow |

---

## 3. Backend App Structure

```
backend/
├── manage.py
├── config/
│   ├── settings/
│   │   ├── base.py
│   │   ├── dev.py              # SQLite3, DEBUG=True
│   │   └── prod.py             # PostgreSQL, Redis, DEBUG=False
│   ├── urls.py
│   ├── wsgi.py
│   └── celery.py
│
├── apps/
│   ├── accounts/               # User, auth, onboarding, mode selection
│   ├── budget/                 # Major Expenses, Auto Allocation, Monthly Cycle
│   ├── dsl/                    # DSL engine, categories, weekly recalculation
│   ├── savings/                # Goals, FIFO prioritization
│   ├── emergency_fund/         # EmergencyFund model + trigger logic
│   ├── portfolio/              # Portfolio view, ML integration point
│   ├── reports/                # Aggregation, month-end insights
│   └── ml_bridge/              # API contract layer (dev to ML team interface)
│
├── core/
│   ├── services/
│   │   ├── dsl_engine.py       # THE core reusable weekly-limit formula
│   │   ├── allocation.py       # Auto Allocation logic
│   │   ├── goal_engine.py      # FIFO goal prioritization
│   │   └── emergency_fund.py   # Trigger, fallback, replenishment logic
│   └── utils/
│       ├── week_utils.py       # Calendar week (Mon-Sun) helpers
│       └── atomic_ops.py       # Atomic transaction wrappers
│
└── requirements/
    ├── base.txt
    ├── dev.txt
    └── prod.txt
```

---

## 4. Frontend App Structure

```
frontend/
├── public/
├── src/
│   ├── api/
│   │   ├── axiosClient.js      # Base instance, JWT interceptor, silent refresh
│   │   ├── auth.js
│   │   ├── budget.js
│   │   ├── dsl.js
│   │   ├── goals.js
│   │   ├── emergencyFund.js
│   │   ├── portfolio.js
│   │   └── reports.js
│   │
│   ├── pages/
│   │   ├── Auth/               # Login, Signup, Onboarding
│   │   ├── Dashboard/          # 4-section main dashboard
│   │   ├── MajorExpenses/
│   │   ├── DSL/
│   │   ├── Savings/
│   │   ├── EmergencyFund/
│   │   ├── Portfolio/
│   │   └── Reports/
│   │
│   ├── components/             # Reusable UI components
│   ├── context/                # AuthContext, BudgetContext
│   ├── hooks/                  # useAuth, useDSL, useGoals
│   └── utils/
│       └── formatCurrency.js   # INR formatting helpers
│
├── package.json
└── vite.config.js
```

---

## 5. Database Schema

> All money-movement operations MUST be wrapped in Django `atomic transactions`.

### `accounts_user`
| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `email` | EmailField unique | |
| `name` | CharField | |
| `lifestyle_mode` | CharField | `FOCUS` / `BALANCED` / `FOODY` |
| `signup_date` | DateField | Defines "week 1" for mid-month signups |
| `is_onboarded` | BooleanField | |

### `budget_monthlyallocation`
| Field | Type | Notes |
|---|---|---|
| `id` | PK | |
| `user` | FK → User | |
| `month` | IntegerField | 1–12 |
| `year` | IntegerField | |
| `income` | DecimalField | |
| `major_expenses_total` | DecimalField | |
| `dsl_total` | DecimalField | |
| `savings_total` | DecimalField | |
| `is_locked` | BooleanField | Set True on "Start Month" |

### `budget_majorexpense`
| Field | Type | Notes |
|---|---|---|
| `id` | PK | |
| `user` | FK → User | |
| `name` | CharField | Rent/Fees/Utilities/EMI/Insurance/Other |
| `amount` | DecimalField | |
| `allocation` | FK → MonthlyAllocation | |

### `dsl_dslcategory`
| Field | Type | Notes |
|---|---|---|
| `id` | PK | |
| `user` | FK → User | |
| `allocation` | FK → MonthlyAllocation | |
| `category_name` | CharField | Food/Travel/Shopping/Entertainment/Others |
| `monthly_budget` | DecimalField | |
| `spent_so_far` | DecimalField | |
| `emergency_fund_trigger_confirmed` | BooleanField | Per-category; user must confirm |

### `dsl_transaction`
| Field | Type | Notes |
|---|---|---|
| `id` | PK | |
| `user` | FK → User | |
| `category` | FK → DSLCategory | |
| `amount` | DecimalField | Positive = expense; negative = refund/reversal |
| `date` | DateField | |
| `note` | TextField | Optional |
| `is_reversed` | BooleanField | Reversal restores weekly limit |

### `savings_goal`
| Field | Type | Notes |
|---|---|---|
| `id` | PK | |
| `user` | FK → User | |
| `name` | CharField | |
| `target_amount` | DecimalField | |
| `current_amount` | DecimalField | |
| `priority_order` | IntegerField | FIFO engine manages this (ascending target amount) |
| `is_active` | BooleanField | |
| `is_complete` | BooleanField | |

### `emergency_fund_emergencyfund`
| Field | Type | Notes |
|---|---|---|
| `id` | PK | |
| `user` | FK → User | One record per user |
| `balance` | DecimalField | Carries forward month-to-month |
| `last_replenished_date` | DateField | |

### `portfolio_portfolio`
| Field | Type | Notes |
|---|---|---|
| `id` | PK | |
| `user` | FK → User | |
| `risk_profile` | CharField | LOW / MEDIUM / HIGH |
| `equity_pct` | DecimalField | |
| `debt_pct` | DecimalField | |
| `liquid_pct` | DecimalField | |
| `last_updated` | DateTimeField | |

### `ml_bridge_mlprediction`
| Field | Type | Notes |
|---|---|---|
| `id` | PK | |
| `company` | CharField | One of 4–5 selected companies |
| `prediction` | CharField | UP / DOWN |
| `confidence` | DecimalField | 0.0–1.0 |
| `model_used` | CharField | RF / XGBoost |
| `top_features` | JSONField | Contributing feature breakdown |
| `date` | DateField | Chronological; no future leakage |

---

## 6. Core DSL Engine (Canonical Logic)

This function is the heart of the app. It MUST be reused for both the overall DSL and each sub-category independently.

```python
# core/services/dsl_engine.py

from decimal import Decimal
from core.utils.week_utils import get_weeks_left

def recalculate_weekly_limit(
    monthly_budget: Decimal,
    spent_so_far: Decimal,
    reference_date=None
) -> dict:
    """
    Canonical DSL formula. Called on every transaction.
    Works for overall DSL and per-category DSL identically.
    Budget changes apply FORWARD only — never retroactive.
    """
    remaining_budget = monthly_budget - spent_so_far
    weeks_left = get_weeks_left(reference_date)  # calendar Mon-Sun weeks

    if weeks_left <= 0:
        weeks_left = 1  # guard: last partial week

    weekly_limit = remaining_budget / Decimal(weeks_left)
    is_overspent = remaining_budget < 0
    overspent_amount = abs(remaining_budget) if is_overspent else Decimal("0")

    return {
        "remaining_budget": remaining_budget,
        "weeks_left": weeks_left,
        "weekly_limit": weekly_limit,
        "is_overspent": is_overspent,
        "overspent_amount": overspent_amount,
    }
```

---

## 7. API Contract (Backend ↔ ML Team)

### `GET /api/ml/predictions/`
```json
{
  "predictions": [
    {
      "company": "RELIANCE",
      "prediction": "UP",
      "confidence": 0.74,
      "model_used": "XGBoost",
      "top_features": {"sentiment_score": 0.31, "fii_net_flow": 0.25},
      "date": "2026-08-19",
      "educational_disclaimer": "This is a model signal with 74% historical accuracy, not a trade recommendation."
    }
  ]
}
```

### `GET /api/ml/risk-profile/`
```json
{
  "risk_profile": "MEDIUM",
  "equity_pct": 60,
  "debt_pct": 30,
  "liquid_pct": 10,
  "rationale": "Based on your income stability, age bracket, and spending patterns."
}
```

### `GET /api/ml/cashflow-forecast/` *(Optional)*
```json
{
  "predicted_breach_date": "2026-08-27",
  "confidence": 0.68,
  "days_warning": 8
}
```

---

## 8. Auth Flow

```
[Signup] → POST /api/auth/register/
          ← { access_token, refresh_token }

[Login]  → POST /api/auth/login/
          ← { access_token, refresh_token }

[Refresh]→ POST /api/auth/token/refresh/
          ← { access_token }

All protected endpoints:
  Header: Authorization: Bearer <access_token>
```

- Access token: short-lived (15 min)
- Refresh token: long-lived (7 days), rotated on use
- Frontend Axios interceptor handles silent refresh

---

## 9. Monthly Cycle State Machine

```
IDLE
  → CONFIGURING   (set Major Expenses, DSL categories, Savings split)
  → INCOME_ENTERED
  → ALLOCATED      (auto-allocation computed, preview shown to user)
  → ACTIVE         (month locked; transactions flowing)
       │
       ├─ [Each transaction] → DSLEngine.recalculate() → weekly_limit updated live
       │
       ├─ [DSL / Category exhausted]
       │       ├─ EF has balance → deduct EmergencyFund, notify user
       │       └─ EF empty → deduct from Savings, reduce Goal/Stocks, notify user
       │
       └─ [Month-end] → REPORTING → generate insights → IDLE (next month)
```

---

## 10. Deployment Topology

```
Render / Railway
├── Web Service (Django + Gunicorn)     ← Single public URL
├── Worker Service (Celery)
├── Redis (managed add-on)
└── PostgreSQL (managed add-on)

CI/CD: GitHub Actions
  push to main → run tests → auto-deploy
```

> Single shared public URL eliminates CORS/laptop-networking issues across both dev machines and the ML pair.

---

## 11. Non-Negotiable Engineering Rules

| Rule | Enforcement |
|---|---|
| Atomic transactions | `with transaction.atomic():` on every money movement |
| Forward-only changes | Budget/ratio edits apply from next week, never retroactive |
| `EmergencyFund` term | Consistent across all models, endpoints, UI labels, docs |
| ML output framing | Always include `confidence` %; never use "buy" / "sell" imperatives |
| Walk-forward ML splits | Train/test split is chronological — never random |
| Sentiment = feature only | FinBERT score is a model input, NOT the prediction label |
| Calendar weeks | Mon–Sun; partial weeks handled by `get_weeks_left()` |
| No cross-category borrowing | Each DSL category taps EmergencyFund independently |
