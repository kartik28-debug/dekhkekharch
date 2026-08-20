"""
Auth URL routes — JWT token endpoints only (stub for now).
Full register/login views will be added in the accounts phase.
"""

from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

urlpatterns = [
    # POST /api/auth/token/       → obtain access + refresh token pair
    path("token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    # POST /api/auth/token/refresh/ → exchange refresh token for new access token
    path("token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
]
