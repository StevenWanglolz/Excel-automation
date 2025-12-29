from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

# Create database engine - manages connection pool
# Connection string format: postgresql://user:password@host:port/database
engine = create_engine(settings.DATABASE_URL)

# Create session factory - each request gets a new session
# autocommit=False: Changes require explicit commit (prevents accidental commits)
# autoflush=False: Don't auto-flush before queries (better performance)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for all database models
# All models inherit from this to get SQLAlchemy ORM functionality
Base = declarative_base()


def get_db():
    """
    Dependency for getting database session.

    This is a FastAPI dependency that provides a database session to route handlers.
    The session is automatically closed after the request completes (via finally block).
    Using yield makes this a generator dependency - FastAPI handles the cleanup.
    """
    db = SessionLocal()
    try:
        # Yield session to route handler
        # Code after yield runs when request completes
        yield db
    finally:
        # Always close session, even if request raises an exception
        # Prevents connection leaks
        db.close()
