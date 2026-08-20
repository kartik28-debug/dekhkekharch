"""
Dev settings — SQLite3, DEBUG=True, CORS open.
Usage: DJANGO_SETTINGS_MODULE=config.settings.dev  (default in manage.py)
"""

from .base import *  # noqa: F401, F403

DEBUG = True

SECRET_KEY = "dev-insecure-secret-key-change-in-prod"

ALLOWED_HOSTS = ["*"]

# ---------------------------------------------------------------------------
# Database — SQLite3 for local dev (architecture.md §2)
# ---------------------------------------------------------------------------
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",  # noqa: F405  (BASE_DIR from base.py)
    }
}

# ---------------------------------------------------------------------------
# CORS — allow all origins for local development (NFR-5 restricts in prod)
# ---------------------------------------------------------------------------
CORS_ALLOW_ALL_ORIGINS = True
