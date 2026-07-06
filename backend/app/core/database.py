"""Database connection and session management."""
from contextlib import asynccontextmanager
import ssl
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base

from app.core.config import settings

def _get_postgres_connect_args(database_url: str) -> dict:
    """Return SSL connect args for hosted Postgres services."""
    hostname = database_url.split("@", 1)[-1].split("/", 1)[0].split(":", 1)[0].lower()

    # Docker Compose and local dev Postgres services do not expose SSL.
    if hostname in {"localhost", "127.0.0.1", "::1", "postgres", "db"}:
        return {}

    ssl_context = ssl.create_default_context()
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_NONE
    return {"ssl": ssl_context}


# Create async engine - handle SQLite vs PostgreSQL
if settings.DATABASE_URL.startswith("sqlite"):
    engine = create_async_engine(
        settings.DATABASE_URL,
        echo=settings.DEBUG,
        connect_args={"check_same_thread": False},
    )
else:
    engine = create_async_engine(
        settings.DATABASE_URL,
        pool_size=settings.DATABASE_POOL_SIZE,
        pool_pre_ping=True,
        echo=settings.DEBUG,
        connect_args=_get_postgres_connect_args(settings.DATABASE_URL),
    )

# Create async session factory
async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

# Base class for models
Base = declarative_base()


async def get_db() -> AsyncSession:
    """Dependency to get database session."""
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


@asynccontextmanager
async def get_db_session():
    """Context manager to get database session (for background tasks)."""
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    """Initialize database connection and optional dev schema bootstrap."""
    async with engine.begin() as conn:
        await conn.execute(text("SELECT 1"))

    # Keep automatic table creation as an explicit opt-in for local/dev workflows.
    if not settings.AUTO_CREATE_TABLES:
        return

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def close_db():
    """Close database connections."""
    await engine.dispose()
