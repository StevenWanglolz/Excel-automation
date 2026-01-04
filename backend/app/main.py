from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.core.config import settings
from sqlalchemy import inspect, text
from app.core.database import engine, Base
from app.models import file_batch  # Ensure batch model is registered before create_all.
from app.core.scheduler import start_scheduler, stop_scheduler
from app.api.routes import auth, files, flows, transform

def ensure_schema_updates() -> None:
    """
    Apply lightweight schema updates for local development.

    This keeps the SQLite schema in sync when new columns are added
    without requiring a full migration setup.
    """
    inspector = inspect(engine)
    if "files" in inspector.get_table_names():
        columns = {column["name"] for column in inspector.get_columns("files")}
        if "batch_id" not in columns:
            # Add batch_id column for grouping files into batches.
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE files ADD COLUMN batch_id INTEGER"))


# Create database tables from all models that inherit from Base
# This runs on app startup - creates tables if they don't exist
# In production, use migrations (Alembic) instead of create_all
Base.metadata.create_all(bind=engine)
ensure_schema_updates()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manage app lifecycle events.
    
    Startup: Start background scheduler for periodic cleanup
    Shutdown: Stop background scheduler
    """
    # Startup
    start_scheduler()
    yield
    # Shutdown
    stop_scheduler()


app = FastAPI(
    title="SheetPilot API",
    description="AI-assisted Excel automation platform",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware - allows frontend to make requests to backend
# Without this, browser would block requests due to same-origin policy
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_cors_origins(),  # List of allowed frontend URLs
    allow_credentials=True,  # Allow cookies/auth headers
    allow_methods=["*"],  # Allow all HTTP methods
    allow_headers=["*"],  # Allow all headers
)

# Register API route modules
# All routes are prefixed with /api for consistency
app.include_router(auth.router, prefix="/api")
app.include_router(files.router, prefix="/api")
app.include_router(flows.router, prefix="/api")
app.include_router(transform.router, prefix="/api")

# Import transforms to register them with the registry
# The @register_transform decorator runs when modules are imported
# This must happen after app creation but before first request
from app.transforms import filters, columns, rows, joins


@app.get("/")
async def root():
    """Root endpoint - API information"""
    return {"message": "SheetPilot API", "version": "1.0.0"}


@app.get("/health")
async def health():
    """Health check endpoint - used by monitoring/deployment tools"""
    return {"status": "healthy"}
