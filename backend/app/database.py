"""
database.py — SQLAlchemy async engine wired to Neon PostgreSQL.

DATABASE_URL must be set in .env (never hardcoded here).
Pattern: postgresql+asyncpg://user:password@host/dbname?sslmode=require
"""

import os
import ssl
from urllib.parse import parse_qs, urlparse, urlunparse

from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

load_dotenv()

raw_url = os.environ.get("DATABASE_URL", "")

connect_args = {}

if raw_url.startswith("postgresql://") or raw_url.startswith("postgres://"):
    raw_url = raw_url.replace("postgres://", "postgresql+asyncpg://", 1)
    raw_url = raw_url.replace("postgresql://", "postgresql+asyncpg://", 1)

parsed = urlparse(raw_url)
query_params = parse_qs(parsed.query)

use_ssl = False
if "sslmode" in query_params or "ssl" in query_params or (parsed.netloc and "neon.tech" in parsed.netloc):
    use_ssl = True

# asyncpg does not accept query parameters like sslmode or channel_binding in URL
clean_url = urlunparse((parsed.scheme, parsed.netloc, parsed.path, "", "", ""))

if use_ssl and "sqlite" not in parsed.scheme:
    connect_args["ssl"] = ssl.create_default_context()

# asyncpg driver — required for async SQLAlchemy
engine = create_async_engine(
    clean_url,
    connect_args=connect_args,
    echo=False,           # flip to True to see SQL in logs (never in prod)
    pool_pre_ping=True,   # detect stale Neon connections
    pool_size=5,
    max_overflow=10,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Shared declarative base for all SQLAlchemy models."""


async def get_db():
    """FastAPI dependency — yields an async DB session, always closed after."""
    async with AsyncSessionLocal() as session:
        yield session


async def create_tables():
    """Create all tables defined via Base.metadata (called at startup)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
