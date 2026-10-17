"""
main.py — FastAPI application entry point.

Run with:
  uvicorn app.main:app --reload --port 8001

This server handles ONLY the authentication layer (/api/auth/*).
The existing Django backend (port 8000) continues to serve all budget/
financial data endpoints unchanged.

The Vite dev proxy is updated to forward /api/auth/* to port 8001 and
keep /api/* for port 8000.
"""

import logging
import os

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# slowapi rate-limiting
try:
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.errors import RateLimitExceeded
    from slowapi.util import get_remote_address
    limiter = Limiter(key_func=get_remote_address)
    _slowapi_available = True
except ImportError:
    limiter = None  # type: ignore[assignment]
    _slowapi_available = False

from .database import create_tables
from .routes.auth_routes import router as auth_router

# ─── Logging (NEVER log passwords, hashes, or tokens) ───────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger(__name__)

# ─── App ────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="FinanceOS Auth API",
    version="1.0.0",
    docs_url="/api/auth/docs",
    redoc_url=None,
    openapi_url="/api/auth/openapi.json",
)

# ─── Rate limiting ───────────────────────────────────────────────────────────
if _slowapi_available and limiter:
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]

# ─── CORS ────────────────────────────────────────────────────────────────────
_allowed_origins = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _allowed_origins],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# ─── Startup — create DB tables ──────────────────────────────────────────────
@app.on_event("startup")
async def startup() -> None:
    logger.info("Starting FinanceOS Auth API — creating tables if needed …")
    await create_tables()
    logger.info("Database ready.")


# ─── Routes ──────────────────────────────────────────────────────────────────
app.include_router(auth_router)


# ─── Health check ────────────────────────────────────────────────────────────
@app.get("/api/auth/health", tags=["health"])
async def health() -> dict:
    return {"status": "ok"}
