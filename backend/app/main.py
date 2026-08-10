"""CNC Quote Platform - Main FastAPI Application."""
import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.core.config import settings
from app.core.database import init_db, close_db
from app.core.cache import cache
from app.core.errors import register_exception_handlers
from app.core.middleware import (
    BodySizeLimitMiddleware,
    HTTPSRedirectMiddleware,
    SecurityHeadersMiddleware,
)
from app.api import files, config, quotes, auth, billing, public, customers, legal
from app.seed import seed_if_empty

# Configure logging
logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)
# Security events go to their own logger so they can be routed to a SIEM
# without the rest of the application's output.
logging.getLogger("security").setLevel(logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup
    logger.info("Starting CNC Quote Platform...")
    
    # Initialize database
    await init_db()
    logger.info("Database connection verified")

    try:
        await seed_if_empty()
    except Exception as e:
        logger.warning(f"Seed check failed: {e}")
    
    # Connect to Redis. cache.connect() swallows its own failure, so report
    # what actually happened rather than always claiming success.
    try:
        await cache.connect()
        if not cache._connected:
            logger.warning("Redis unavailable. Caching disabled.")
    except Exception as e:
        logger.warning(f"Redis connection failed: {e}. Caching disabled.")

    # Requeue geometry processing interrupted by a previous crash/restart.
    from app.services.geometry import recover_interrupted_processing, reanalyze_stale_brep_geometry

    async def _geometry_janitors():
        await recover_interrupted_processing()
        # After recovery: refresh analyses from older engine versions so
        # deduped re-uploads stop serving pre-fix geometry.
        await reanalyze_stale_brep_geometry()

    recovery_task = asyncio.create_task(_geometry_janitors())

    # Link pre-CRM quotes to customer records (idempotent janitor).
    from app.services.customers import backfill_customer_links
    backfill_task = asyncio.create_task(backfill_customer_links())

    yield

    recovery_task.cancel()
    backfill_task.cancel()
    
    # Shutdown
    logger.info("Shutting down...")
    from app.services.geometry import shutdown_pool
    shutdown_pool()
    await cache.disconnect()
    await close_db()
    logger.info("Shutdown complete")


# Create FastAPI application
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="""
    CNC Instant Quotation Platform API
    
    A rule-based engineering quotation system for CNC machining.
    
    ## Features
    
    - **CAD File Upload**: Upload STEP and STL files for analysis
    - **Geometry Processing**: Automatic extraction of volume, surface area, complexity
    - **Instant Pricing**: Transparent, rule-based pricing with detailed breakdown
    - **Quote Generation**: Professional PDF quotation documents
    
    ## Pricing Logic
    
    All pricing is rule-based and fully explainable:
    
    - Material Cost = Volume × Density × Material Cost per kg
    - Machining Cost = Estimated Time × Hourly Rate × Difficulty Factors
    - Finish Cost = Machining Cost × Finish Multiplier + Fixed Cost
    - Inspection Cost = Fixed Cost + Percentage of Subtotal
    - Total = (Subtotal × Margin Factor) - Quantity Discounts
    """,
    lifespan=lifespan,
    # Interactive docs enumerate every endpoint and schema. Useful in
    # development, free reconnaissance in production.
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None if settings.is_production else "/redoc",
    openapi_url=None if settings.is_production else "/openapi.json",
)

register_exception_handlers(app)

# Middleware runs bottom-up: the last one added is the outermost. Size limit
# and HTTPS redirect must run before anything reads the body.
app.add_middleware(SecurityHeadersMiddleware)

# Configure CORS. Explicit methods and headers instead of "*": with
# allow_credentials a wildcard is both invalid and, where honoured, an
# invitation for any origin to drive the API with a victim's token.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Stripe-Signature"],
    expose_headers=["Content-Disposition", "Retry-After"],
    max_age=600,
)

app.add_middleware(BodySizeLimitMiddleware, max_bytes=settings.MAX_REQUEST_BODY_MB * 1024 * 1024)
app.add_middleware(HTTPSRedirectMiddleware)

# Host header allowlist: blocks host-header poisoning of absolute URLs and
# cache entries. "*" (the default) disables the check.
if settings.allowed_host_list != ["*"]:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_host_list)

# Include routers
app.include_router(auth.router, prefix="/api")
app.include_router(billing.router, prefix="/api")
app.include_router(files.router, prefix="/api")
app.include_router(config.router, prefix="/api")
app.include_router(quotes.router, prefix="/api")
app.include_router(public.router, prefix="/api")
app.include_router(customers.router, prefix="/api")
app.include_router(legal.router, prefix="/api")

# Serve company logos only. Never mount the whole upload dir: it also holds
# quote PDFs and customer CAD files, which must stay behind authenticated
# download endpoints.
_logo_dir = Path(settings.UPLOAD_DIR) / "company_logos"
_logo_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads/company_logos", StaticFiles(directory=_logo_dir), name="company_logos")


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs": "/docs",
    }


@app.get("/health")
@app.get("/api/v1/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "version": settings.APP_VERSION,
    }


@app.get("/.well-known/security.txt", response_class=PlainTextResponse, include_in_schema=False)
@app.get("/security.txt", response_class=PlainTextResponse, include_in_schema=False)
async def security_txt():
    """RFC 9116 contact information for reporting vulnerabilities."""
    base = settings.FRONTEND_BASE_URL.rstrip("/")
    expires = datetime.utcnow().replace(microsecond=0) + timedelta(days=365)
    return "\n".join(
        [
            f"Contact: mailto:{settings.LEGAL_SECURITY_EMAIL}",
            f"Expires: {expires.isoformat()}Z",
            "Preferred-Languages: en",
            f"Canonical: {base}/.well-known/security.txt",
            f"Policy: {base}/legal/disclosure",
            "",
        ]
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
    )
