from pydantic_settings import BaseSettings
from typing import Optional, Union


class Settings(BaseSettings):
    # Database connection string - can be overridden via .env file
    # Format: postgresql://user:password@host:port/database
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/sheetpilot"

    # Security settings
    # SECRET_KEY must be changed in production - used to sign JWT tokens
    # If compromised, attackers can forge tokens and impersonate any user
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"  # JWT signing algorithm - must match in security.py
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30  # Token expiration time

    # File Storage settings
    UPLOAD_DIR: str = "./uploads"  # Directory where uploaded files are stored
    MAX_FILE_SIZE: int = 10 * 1024 * 1024  # 10MB - maximum file upload size

    # CORS origins - allows frontend to make requests to backend
    # Can be string (comma-separated) or list for flexibility
    # Must include frontend URL or browser will block requests
    CORS_ORIGINS: Union[str, list[str]
                        ] = "http://localhost:5173,http://localhost:3000"

    # Dev auth bypass - skips JWT validation for local development
    DISABLE_AUTH: bool = True
    DEV_AUTH_EMAIL: str = "test@gmail.com"
    DEV_AUTH_PASSWORD: str = "test"

    def get_cors_origins(self) -> list[str]:
        """Parse CORS_ORIGINS string into list"""
        # Handle both string and list formats for flexibility
        # If CORS_ORIGINS is a string, split by comma and strip whitespace
        if isinstance(self.CORS_ORIGINS, str):
            return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]
        # If already a list, return it; otherwise return empty list
        return self.CORS_ORIGINS if isinstance(self.CORS_ORIGINS, list) else []

    class Config:
        # Load settings from .env file if it exists
        # Environment variables override defaults
        env_file = ".env"
        case_sensitive = True  # Environment variable names are case-sensitive


settings = Settings()
