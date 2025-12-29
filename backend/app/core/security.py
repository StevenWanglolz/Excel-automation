from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from app.core.config import settings

# CryptContext handles password hashing using bcrypt
# bcrypt is slow by design to prevent brute-force attacks
# 'deprecated="auto"' allows passlib to handle deprecation warnings automatically
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against a hash using constant-time comparison"""
    # Constant-time comparison prevents timing attacks
    # If this used regular string comparison, attackers could determine password correctness by timing
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password using bcrypt"""
    # bcrypt automatically generates a salt and includes it in the hash
    # This means the same password produces different hashes, preventing rainbow table attacks
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token with expiration"""
    # Copy data to avoid mutating the original dict
    to_encode = data.copy()

    # Set expiration time - tokens must expire to limit damage if compromised
    # Use timezone.utc instead of utcnow() (deprecated in Python 3.12+)
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(
            timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    # Add expiration claim to token payload (JWT standard 'exp' claim)
    to_encode.update({"exp": expire})

    # Encode token with secret key - if SECRET_KEY is compromised, all tokens can be forged
    # Algorithm must match in decode - changing this breaks all existing tokens
    encoded_jwt = jwt.encode(
        to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> Optional[dict]:
    """Decode and verify a JWT token"""
    try:
        # Verify signature and expiration automatically
        # Returns None if token is invalid, expired, or tampered with
        payload = jwt.decode(token, settings.SECRET_KEY,
                             algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        # Token is invalid - could be expired, tampered, or wrong secret key
        return None
