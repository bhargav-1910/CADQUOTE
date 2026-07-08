"""CNC Quote Platform - Main FastAPI Application."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.database import init_db, close_db
from app.core.cache import cache
from app.api import files, config, quotes, auth, billing, public
from app.seed import seed_if_empty

# Configure logging
logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


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
    
    # Connect to Redis
    try:
        await cache.connect()
        logger.info("Redis cache connected")
    except Exception as e:
        logger.warning(f"Redis connection failed: {e}. Caching disabled.")
    
    yield
    
    # Shutdown
    logger.info("Shutting down...")
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
    docs_url="/docs",
    redoc_url="/redoc",
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/api")
app.include_router(billing.router, prefix="/api")
app.include_router(files.router, prefix="/api")
app.include_router(config.router, prefix="/api")
app.include_router(quotes.router, prefix="/api")
app.include_router(public.router, prefix="/api")

# Serve user-uploaded assets such as company logos and generated PDFs
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")


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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
    )
