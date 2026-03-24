"""Authentication and password security utilities."""
from datetime import datetime, timedelta
from typing import Any, Optional
import hashlib
import re

from jose import jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
MAX_BCRYPT_PASSWORD_BYTES = 72


def password_utf8_length(password: str) -> int:
    """Return password length in UTF-8 bytes (bcrypt limit is byte-based)."""
    return len(password.encode("utf-8"))


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain-text password against a bcrypt hash."""
    if password_utf8_length(plain_password) > MAX_BCRYPT_PASSWORD_BYTES:
        return False
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except ValueError:
        return False


def get_password_hash(password: str) -> str:
    """Create bcrypt hash for a plain-text password."""
    if password_utf8_length(password) > MAX_BCRYPT_PASSWORD_BYTES:
        raise ValueError("Password exceeds bcrypt 72-byte limit")
    return pwd_context.hash(password)


def create_access_token(subject: str, expires_delta: Optional[timedelta] = None) -> str:
    """Create a signed JWT access token."""
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    payload: dict[str, Any] = {
        "sub": subject,
        "token_type": "access",
        "exp": expire,
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(subject: str, expires_delta: Optional[timedelta] = None) -> str:
    """Create a signed JWT refresh token."""
    expire = datetime.utcnow() + (expires_delta or timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS))
    payload: dict[str, Any] = {
        "sub": subject,
        "token_type": "refresh",
        "exp": expire,
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def hash_token(token: str) -> str:
    """Hash refresh tokens before storing in DB."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def validate_password_strength(password: str) -> Optional[str]:
    """Validate strong password policy and return error message if invalid."""
    if len(password) < 10:
        return "Password must be at least 10 characters long"
    if password_utf8_length(password) > MAX_BCRYPT_PASSWORD_BYTES:
        return "Password must be at most 72 bytes long"
    if not re.search(r"[A-Z]", password):
        return "Password must include at least one uppercase letter"
    if not re.search(r"[a-z]", password):
        return "Password must include at least one lowercase letter"
    if not re.search(r"\d", password):
        return "Password must include at least one number"
    if not re.search(r"[^A-Za-z0-9]", password):
        return "Password must include at least one special character"
    return None
