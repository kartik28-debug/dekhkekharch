"""Budget app URL configuration."""

from django.urls import path

from .views import (
    DashboardView,
    LockAllocationView,
    SalaryView,
    SavingsAllocationView,
    GoalListCreateView,
    GoalDetailView,
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

# Keep a top-level urlpatterns alias so Django's include() still works
urlpatterns = dashboard_urlpatterns
