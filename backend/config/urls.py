"""Root URL configuration."""

from django.contrib import admin
from django.urls import include, path

from apps.budget.urls import dashboard_urlpatterns, savings_urlpatterns, goals_urlpatterns

urlpatterns = [
    path("admin/", admin.site.urls),

    # Dashboard + budget allocation endpoints
    path("api/dashboard/", include(dashboard_urlpatterns)),

    # Savings Goal/Stocks split endpoint
    path("api/savings/", include(savings_urlpatterns)),

    # Goals CRUD endpoints
    path("api/goals/", include(goals_urlpatterns)),

    # JWT auth endpoints (token obtain + refresh)
    path("api/auth/", include("apps.accounts.urls")),
]
