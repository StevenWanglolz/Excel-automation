from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from pydantic import BaseModel, EmailStr
from app.core.database import get_db
from app.core.security import verify_password, get_password_hash, create_access_token
from app.core.config import settings
from app.models.user import User
from app.api.dependencies import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str | None = None


class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str | None
    is_active: bool

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str

# REST api
# -----------------------------
# POST, PUT, DELETE, GET

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserCreate, db: Session = Depends(get_db)):
    """Register a new user"""
    try:
        # Check if user exists - prevents duplicate email registration
        # This explicit check provides clearer error messages than database constraint violations
        existing_user = db.query(User).filter(
            User.email == user_data.email
        ).first()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )

        # Hash password before storing - critical for security
        # Never store plaintext passwords; if this is removed, all user passwords would be exposed
        hashed_password = get_password_hash(user_data.password)
        db_user = User(
            email=user_data.email,
            hashed_password=hashed_password,
            full_name=user_data.full_name
        )
        db.add(db_user)
        db.commit()
        # Refresh to load auto-generated fields (id, timestamps) from database
        db.refresh(db_user)

        return db_user
    except IntegrityError:
        # Handle race condition: if two requests register same email simultaneously
        # The explicit check above might pass for both, but database constraint will catch it
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    except SQLAlchemyError:
        # Database-level errors (connection issues, constraint violations, etc.)
        # Rollback prevents partial state if transaction was partially committed
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error occurred"
        )
    except Exception:
        # Catch-all for unexpected errors - prevents exposing internal error details
        # Rollback ensures database consistency even on unexpected failures
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred during registration"
        )


@router.post("/login", response_model=Token)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """Login and get access token"""
    # OAuth2PasswordRequestForm uses 'username' field, but we store emails
    # This mapping allows OAuth2 compatibility while using email as identifier
    user = db.query(User).filter(User.email == form_data.username).first()

    # Verify password using constant-time comparison to prevent timing attacks
    # Generic error message prevents email enumeration (can't tell if email exists)
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check account status before issuing token - prevents disabled accounts from accessing system
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )

    # Create JWT token with user ID in 'sub' claim (JWT standard)
    # Token expiration prevents indefinite access if token is compromised
    access_token_expires = timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id)},
        expires_delta=access_token_expires
    )

    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Get current user information"""
    return current_user
