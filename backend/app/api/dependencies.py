from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import decode_access_token, get_password_hash
from app.core.config import settings
from app.models.user import User

# OAuth2 password bearer scheme - extracts token from Authorization header
# tokenUrl tells FastAPI where to find the login endpoint for Swagger UI
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login", auto_error=False)


async def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    """
    Get current authenticated user from JWT token.
    
    This is a FastAPI dependency used in route handlers to require authentication.
    Extracts token from Authorization header, validates it, and returns the user.
    If token is invalid or user doesn't exist, raises 401 Unauthorized.
    """
    # Reusable exception for invalid credentials
    # Consistent error format across all auth failures
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if settings.DISABLE_AUTH:
        # Dev bypass returns a real user so ownership checks still work.
        user = db.query(User).filter(User.email == settings.DEV_AUTH_EMAIL).first()
        if user:
            return user
        user = User(
            email=settings.DEV_AUTH_EMAIL,
            hashed_password=get_password_hash(settings.DEV_AUTH_PASSWORD),
            full_name="Dev User",
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    if token is None:
        raise credentials_exception

    # Decode and verify JWT token
    # Returns None if token is invalid, expired, or tampered with
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception

    # Extract user ID from token payload
    # JWT standard uses 'sub' (subject) claim for user identifier
    user_id_str = payload.get("sub")
    if user_id_str is None:
        raise credentials_exception

    # Convert user ID string to integer
    # Token stores ID as string, but database uses integer
    try:
        user_id: int = int(user_id_str)
    except (ValueError, TypeError):
        # Invalid user ID format - token might be corrupted
        raise credentials_exception

    # Look up user in database
    # If user was deleted after token was issued, this will be None
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception

    # Check if user account is active
    # Prevents disabled accounts from accessing the system
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )

    return user
