from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import logging
import time
from .core.config import settings
from .core.database import engine, Base, migrate_sqlite_schema
from .api import auth, products, vendors, chat, quotations, admin

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create database tables
Base.metadata.create_all(bind=engine)
migrate_sqlite_schema()

app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description="AI-Powered IT Procurement & Vendor Verification System"
)

# CORS middleware - Configure to allow all necessary origins and methods
# Ensure CORS_ORIGINS is properly formatted
cors_origins = settings.CORS_ORIGINS if settings.CORS_ORIGINS else ["*"]
if isinstance(cors_origins, str):
    # Handle case where it's a JSON string
    import json
    try:
        cors_origins = json.loads(cors_origins)
    except:
        cors_origins = [cors_origins]

logger.info(f"CORS Origins configured: {cors_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH", "HEAD"],  # Include HEAD
    allow_headers=["*"],  # Allow all headers including Authorization, Content-Type
    expose_headers=["*"],  # Expose all headers in response
    max_age=3600,  # Cache preflight requests for 1 hour
)

# Include routers
app.include_router(auth.router, prefix=settings.API_V1_PREFIX)
app.include_router(products.router, prefix=settings.API_V1_PREFIX)
app.include_router(vendors.router, prefix=settings.API_V1_PREFIX)
app.include_router(chat.router, prefix=settings.API_V1_PREFIX)
app.include_router(quotations.router, prefix=settings.API_V1_PREFIX)
app.include_router(admin.router, prefix=settings.API_V1_PREFIX)

uploads_dir = Path("uploads")
uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")


@app.get("/")
async def root():
    return {"message": "AI Procurement System API", "version": "1.0.0"}


@app.get("/health")
async def health_check():
    """Enhanced health check endpoint with database connectivity test."""
    try:
        # Test database connection
        from sqlalchemy import text
        from urllib.parse import urlparse
        import socket
        from .core.database import engine
        
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1"))
            result.fetchone()

        supabase_host = urlparse(settings.SUPABASE_URL or "").hostname
        supabase_dns = "unconfigured"
        if supabase_host:
            try:
                socket.getaddrinfo(supabase_host, 443)
                supabase_dns = "ok"
            except OSError:
                supabase_dns = "failed"
        
        return {
            "status": "healthy",
            "timestamp": time.time(),
            "database": "connected",
            "supabase_host": supabase_host,
            "supabase_dns": supabase_dns,
            "version": "1.0.0"
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {
            "status": "unhealthy",
            "timestamp": time.time(),
            "database": "disconnected",
            "error": str(e),
            "version": "1.0.0"
        }, 503


@app.on_event("startup")
async def startup_event():
    """Log startup information."""
    logger.info("=" * 50)
    logger.info("ProcureX Backend Starting")
    logger.info("=" * 50)
    logger.info(f"API Version: 1.0.0")
    logger.info(f"Database: {settings.DATABASE_URL.split('@')[-1] if '@' in settings.DATABASE_URL else 'configured'}")
    logger.info(f"AI Provider: {settings.AI_PROVIDER}")
    logger.info("=" * 50)


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown."""
    logger.info("ProcureX Backend Shutting Down")
    # Close database connections
    try:
        engine.dispose()
        logger.info("Database connections closed")
    except Exception as e:
        logger.error(f"Error closing database connections: {e}")
