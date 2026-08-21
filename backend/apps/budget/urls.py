"""Budget app URL configuration."""

from django.urls import path

from .views import (
    DashboardView,
    LockAllocationView,
    SalaryView,
    SavingsAllocationView,
    GoalListCreateView,
    GoalDetailView,
    BufferReserveView,
    BufferReserveDepositView,
    BufferReserveWithdrawView,
    SmartBudgetStateView,
    SmartBudgetExpenseV2ListView,
    SmartBudgetExpenseV2DetailView,
    SmartBudgetEndWeekView,
    SmartBudgetSettleMonthView,
    SmartBudgetAllocateSurplusView,
)

dashboard_urlpatterns = [
    # GET  /api/dashboard/         → current salary, mode, 4 bucket balances
    path("", DashboardView.as_view(), name="dashboard"),

    # POST /api/dashboard/salary/  → set/update salary + mode
    path("salary/", SalaryView.as_view(), name="dashboard-salary"),

    # POST /api/dashboard/lock/    → 'Start Month' — lock current month
    path("lock/", LockAllocationView.as_view(), name="dashboard-lock"),
]

savings_urlpatterns = [
    # GET/PUT /api/savings/allocation/  → goal vs. stocks split for the month
    path("allocation/", SavingsAllocationView.as_view(), name="savings-allocation"),
]

goals_urlpatterns = [
    # GET /api/goals/        → list all goals
    # POST /api/goals/       → create a new goal
    path("", GoalListCreateView.as_view(), name="goals-list-create"),

    # PUT  /api/goals/<pk>/  → update a goal
    # DELETE /api/goals/<pk>/ → delete a goal
    path("<int:pk>/", GoalDetailView.as_view(), name="goals-detail"),
]

buffer_reserve_urlpatterns = [
    # GET  /api/buffer-reserve/           → balance + paginated transaction log
    path("", BufferReserveView.as_view(), name="buffer-reserve"),

    # POST /api/buffer-reserve/deposit/   → DSL surplus → Buffer Reserve
    path("deposit/", BufferReserveDepositView.as_view(), name="buffer-reserve-deposit"),

    # POST /api/buffer-reserve/withdraw/  → cover DSL deficit or manual expense
    path("withdraw/", BufferReserveWithdrawView.as_view(), name="buffer-reserve-withdraw"),
]

smart_budget_urlpatterns = [
    # GET  /api/smart-budget/state/         → full state (auto catch-up missed weeks)
    path("state/", SmartBudgetStateView.as_view(), name="smart-budget-state"),

    # GET  /api/smart-budget/entries/       → list entries
    # POST /api/smart-budget/entries/       → add expense (cascade if in settled week)
    path("entries/", SmartBudgetExpenseV2ListView.as_view(), name="smart-budget-entries"),

    # PUT    /api/smart-budget/entries/<pk>/ → edit expense (cascade if in settled week)
    # DELETE /api/smart-budget/entries/<pk>/ → delete expense (cascade if in settled week)
    path("entries/<int:pk>/", SmartBudgetExpenseV2DetailView.as_view(), name="smart-budget-entry-detail"),

    # POST /api/smart-budget/end-week/      → manually trigger week-end settlement
    path("end-week/", SmartBudgetEndWeekView.as_view(), name="smart-budget-end-week"),

    # POST /api/smart-budget/settle-month/  → trigger month-end settlement
    path("settle-month/", SmartBudgetSettleMonthView.as_view(), name="smart-budget-settle-month"),

    # POST /api/smart-budget/allocate-surplus/ → transfer surplus to savings/EF (atomic)
    path("allocate-surplus/", SmartBudgetAllocateSurplusView.as_view(), name="smart-budget-allocate-surplus"),
]

# Keep a top-level urlpatterns alias so Django's include() still works
urlpatterns = dashboard_urlpatterns
