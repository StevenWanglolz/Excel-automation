from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import engine, Base
from app.api.routes import auth, files, flows, transform

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="SheetPilot API",
    description="AI-assisted Excel automation platform",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/api")
app.include_router(files.router, prefix="/api")
app.include_router(flows.router, prefix="/api")
app.include_router(transform.router, prefix="/api")

# Import transforms to register them
from app.transforms import filters, columns, rows, joins


@app.get("/")
async def root():
    return {"message": "SheetPilot API", "version": "1.0.0"}


@app.get("/health")
async def health():
    return {"status": "healthy"}

