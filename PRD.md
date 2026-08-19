# Product Requirements Document (PRD)
## Personal Finance App — Hack-4-Crown · Track 03 Fintech

**Version**: 1.0  
**Date**: 2026-08-19  
**Team**: 2 Backend/Frontend Devs + 2 ML Engineers

---

## 1. Executive Summary

A proactive personal finance app that shifts users from passive expense tracking to active daily guidance. The app answers the exact moment-of-decision question — *"How much can I safely spend today?"* — with live, recalculating spending limits, predicts budget problems before they happen, and personalizes all recommendations by lifestyle mode.

**Target Users**: Students, early-career professionals, and lower-income individuals in India operating on tight monthly budgets (₹5,000–₹30,000/month discretionary spend).

---

## 2. Problem Statement

| Problem | Current State | Our Solution |
|---|---|---|
| Delayed feedback | Monthly summaries flag overspending after the fact | Live weekly limits recalculate on every transaction |
| No daily guidance | Users don't know their daily safe-to-spend amount | Dynamic Spend Limit (DSL) shows exact weekly limit always |
| Impulsive spending | No friction at point of spend decision | Real-time category status + alerts |
| No goal path | Savings spread thin across multiple goals | FIFO Smart Goal Prioritization Engine |
| Investing = black box | No personalized portfolio guidance | ML-powered risk profile + allocation recommendation |
| Budget breach prediction | No warning before running out | Cash-flow Forecaster predicts breach days in advance |

---

## 3. User Stories

### Authentication & Onboarding
| ID | As a... | I want to... | So that... |
|---|---|---|---|
| US-01 | New user | Register with email + password | I can access the app |
| US-02 | Returning user | Log in and get a persistent session | I don't re-enter credentials constantly |
| US-03 | New user | Select my lifestyle mode (Focus / Balanced / Foody) | The app personalizes my default budget split |
| US-04 | New user | Complete onboarding in < 3 minutes | I'm not overwhelmed before I start |

### Monthly Setup
| ID | As a... | I want to... | So that... |
|---|---|---|---|
| US-05 | User | Enter my monthly income | The app can auto-allocate my budget |
| US-06 | User | Add/edit my fixed monthly expenses (rent, EMI, fees) | They are excluded from my discretionary budget |
| US-07 | User | Set my monthly Dynamic Spend Limit (DSL) amount | I have a spending cap for discretionary expenses |
| US-08 | User | Configure DSL sub-category budgets (Food, Travel, etc.) | I have per-category limits |
| US-09 | User | Preview my auto-allocation before locking it | I can adjust before committing |
| US-10 | User | Lock my monthly allocation with "Start Month" | The budget is active and transactions can be logged |

### Expense Tracking
| ID | As a... | I want to... | So that... |
|---|---|---|---|
| US-11 | User | Log a transaction to a DSL category | My spending is tracked |
| US-12 | User | See my updated weekly limit immediately after logging | I know my remaining safe-to-spend amount right now |
| US-13 | User | Log a refund/reversal | My limits are accurately restored |
| US-14 | User | Add a note to a transaction | I remember what I spent on |
| US-15 | User | View my transaction history per category | I can review spending patterns |

### Emergency Fund
| ID | As a... | I want to... | So that... |
|---|---|---|---|
| US-16 | User | Enable the Emergency Fund trigger per category | That category can tap the EF when its budget is exhausted |
| US-17 | User | Be alerted when my Emergency Fund is used | I'm aware my safety net is being tapped |
| US-18 | User | See my current Emergency Fund balance | I know how much buffer I have left |
| US-19 | User | Be alerted when EF is empty and savings are being used | I know I'm in a critical financial state |

### Savings & Goals
| ID | As a... | I want to... | So that... |
|---|---|---|---|
| US-20 | User | Create a savings goal with a name and target amount | I have something concrete to save toward |
| US-21 | User | See my active goal and progress bar | I stay motivated |
| US-22 | User | Have goals automatically prioritized (smallest first) | I complete goals faster and stay motivated |
| US-23 | User | Be prompted at month-end when I have unspent budget | I can consciously move it to savings or a goal |

### Portfolio & Investing
| ID | As a... | I want to... | So that... |
|---|---|---|---|
| US-24 | User | See a personalized risk profile | I understand my investment personality |
| US-25 | User | See a recommended equity/debt/liquid allocation | I have a starting point for investing |
| US-26 | User | View my consolidated portfolio | I see all investments in one place |
| US-27 | User | See stock movement signals for watched companies | I have an educational data point when making decisions |
| US-28 | User | Always see a confidence % and disclaimer with ML signals | I understand the prediction is not financial advice |

### Reports & Insights
| ID | As a... | I want to... | So that... |
|---|---|---|---|
| US-29 | User | See a month-end spending vs budget report | I understand how I did this month |
| US-30 | User | See goal progress in the month-end report | I see my savings trajectory |
| US-31 | User | Receive at least 3 personalized insights | I know what to do differently next month |

---

## 4. Functional Requirements

### FR-1: Dynamic Spend Limit (DSL) Engine
- **FR-1.1**: The system SHALL recalculate the weekly limit after every transaction using the formula: `weekly_limit = remaining_budget / weeks_left`
- **FR-1.2**: Weeks SHALL be defined as Mon–Sun calendar weeks; partial weeks are counted as 1 week
- **FR-1.3**: The recalculation formula SHALL be identical for overall DSL and each sub-category
- **FR-1.4**: Budget changes made mid-week SHALL apply forward only; no retroactive recalculation
- **FR-1.5**: DSL categories SHALL be siloed — no cross-category surplus borrowing

### FR-2: Transactions
- **FR-2.1**: Every transaction that modifies monetary fields SHALL be wrapped in a database atomic transaction
- **FR-2.2**: Refunds/reversals SHALL be logged as negative-amount transactions; direct deletion of transactions SHALL NOT be permitted
- **FR-2.3**: A reversal SHALL restore the affected category's `spent_so_far` and trigger a DSL recalculation

### FR-3: Emergency Fund
- **FR-3.1**: The Emergency Fund trigger MUST be explicitly confirmed by the user per DSL category before it activates
- **FR-3.2**: When a category budget is exhausted and the trigger is confirmed, the system SHALL deduct from EmergencyFund atomically
- **FR-3.3**: When EmergencyFund.balance = 0, the system SHALL fall back to Goal/Stocks savings and notify the user
- **FR-3.4**: When all funds (EF + Savings) are exhausted, the system SHALL block the transaction and show an alert
- **FR-3.5**: Each Emergency Fund deduction SHALL be logged as a separate record (even if multiple categories overdraw in the same week)
- **FR-3.6**: EmergencyFund balance SHALL NOT go below zero

### FR-4: Goals
- **FR-4.1**: Goals SHALL be automatically ordered ascending by `target_amount` (FIFO prioritization)
- **FR-4.2**: Only the lowest-priority active goal SHALL receive savings contributions
- **FR-4.3**: When a goal reaches its target, `is_complete` SHALL be set to True and the next goal becomes active
- **FR-4.4**: The month-end surplus prompt SHALL only appear when `remaining_budget > 0`
- **FR-4.5**: If no response to the surplus prompt within 3 days, the system SHALL auto-route to savings

### FR-5: Monthly Cycle
- **FR-5.1**: Monthly allocation SHALL be locked when the user taps "Start Month"; no changes permitted after lock
- **FR-5.2**: Auto-allocation SHALL compute: `allocatable = income - major_expenses_total`, then split into DSL + Savings + EF carry-forward
- **FR-5.3**: A new month cycle SHALL automatically start after the previous month-end report is generated

### FR-6: ML Features
- **FR-6.1**: Market Awareness signals SHALL cover exactly 4–5 pre-selected companies only
- **FR-6.2**: All ML outputs displayed in the UI SHALL include a `confidence` percentage and an educational disclaimer
- **FR-6.3**: No ML-facing copy in the UI SHALL use imperative language ("buy", "sell", "avoid", "invest now")
- **FR-6.4**: The ML training pipeline SHALL use walk-forward (chronological) train/test splits only
- **FR-6.5**: FinBERT sentiment score SHALL be used as a training feature — it SHALL NOT be used as the prediction label
- **FR-6.6**: Two models (Random Forest, XGBoost) SHALL be trained and compared; the better performer is used in production

### FR-7: Auth
- **FR-7.1**: All endpoints except `/api/auth/register/` and `/api/auth/login/` SHALL require a valid JWT
- **FR-7.2**: Every API queryset SHALL filter by `request.user`; cross-user data access SHALL be impossible

---

## 5. Non-Functional Requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-1 | Consistency | `EmergencyFund` is the canonical term everywhere — models, endpoints, UI, docs |
| NFR-2 | Data Integrity | All money-movement operations use Django `atomic transactions` |
| NFR-3 | Precision | All monetary fields use `DecimalField(max_digits=12, decimal_places=2)` — never `FloatField` |
| NFR-4 | Security | JWT access tokens expire in 15 min; refresh tokens rotate on every use |
| NFR-5 | Security | CORS restricted to single shared production URL in prod |
| NFR-6 | Security | User data always scoped to `request.user` |
| NFR-7 | Deployment | Single shared public URL for both devs + ML pair (no CORS/networking issues) |
| NFR-8 | Availability | Render/Railway free tier uptime; no SLA required for hackathon |
| NFR-9 | Performance | DSL recalculation response < 500ms per transaction |
| NFR-10 | ML Safety | Predictions cached in Redis; never block transaction logging if ML service is down |

---

## 6. Out of Scope (Hackathon v1)

- Push notifications (in-app alerts only)
- Bank account / UPI integration (manual transaction entry only)
- Multi-currency support (INR only)
- Social / family budget sharing
- Loan/credit tracking
- Tax calculation
- iOS / Android native apps (web only)
- A/B testing infrastructure
- Full observability / tracing (basic Django logging only)

---

## 7. Success Metrics (Hackathon Demo)

| Metric | Target |
|---|---|
| Core user flow completable end-to-end | Yes (register → setup → log txn → see live DSL update) |
| DSL recalculation correctness | 100% match against manual formula calculation in judges' review |
| EmergencyFund cascade works | Demonstrated live: category exhausted → EF deducted → EF empty → Savings deducted |
| FIFO goal completion | Demonstrated: smallest goal completes first, next activates |
| ML signal displayed with disclaimer | Yes — confidence % visible, no "buy/sell" language |
| Month-end report renders | Yes — spending vs budget chart + 3 insights |
| App runs on shared public URL | Yes — all 4 team members confirm |

---

## 8. Glossary

| Term | Definition |
|---|---|
| **DSL** | Dynamic Spend Limit — the user's monthly discretionary spending cap, broken into sub-categories |
| **EmergencyFund** | The buffer reserve that absorbs category overflows; carries forward month-to-month |
| **Weekly Limit** | `remaining_budget / weeks_left` — recalculates on every transaction |
| **FIFO Goal Engine** | Sorts goals ascending by target amount; lowest-cost goal gets funded first |
| **Walk-Forward Split** | Chronological train/test split for ML; respects time-ordering of financial data |
| **Atomic Transaction** | A DB operation that either completes fully or rolls back entirely; no partial state |
| **Lifestyle Mode** | User's spending personality: `FOCUS` (minimal), `BALANCED`, `FOODY` (food-heavy) |
| **Auto Allocation** | System-computed split of monthly income into Major Expenses / DSL / Savings / EF |
| **Start Month** | User action that locks the monthly allocation; triggers the active budget cycle |
| **Surplus Prompt** | Month-end modal asking user where to route unspent budget |
