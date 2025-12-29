from sqlalchemy import Column, Integer, String, DateTime, Boolean
from sqlalchemy.sql import func
from app.core.database import Base


class User(Base):
    """
    User model representing application users.
    
    Stores authentication credentials and user profile information.
    Passwords are stored as hashes (never plaintext).
    """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    # Email is unique and indexed for fast lookups during login
    email = Column(String, unique=True, index=True, nullable=False)
    # Password is hashed using bcrypt - never store plaintext passwords
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=True)  # Optional display name
    # is_active allows soft-deleting users without removing data
    is_active = Column(Boolean, default=True)
    # Timestamps are set automatically by database
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

