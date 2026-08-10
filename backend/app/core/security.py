"""Authentication and password security utilities."""
from datetime import datetime, timedelta
from typing import Any, Iterable, Optional
import hashlib
import hmac
import re
import secrets
import uuid

from jose import jwt
from passlib.context import CryptContext

from app.core.config import settings

# Argon2id is the OWASP first choice; bcrypt stays registered so every hash
# written before this change still verifies. `deprecated="auto"` marks bcrypt
# hashes as needing an upgrade, and login rehashes them to Argon2id while the
# plaintext is in hand — so the migration happens silently, one login at a
# time, with no password resets and no downtime.
#
# Parameters follow the OWASP Password Storage Cheat Sheet minimum for
# Argon2id (m=47104 KiB, t=1, p=1); the defaults below are deliberately above
# it and tunable per deployment.
_ARGON2_AVAILABLE = True
try:  # pragma: no cover - exercised by the absence of the wheel
    import argon2  # noqa: F401
except ImportError:  # pragma: no cover
    _ARGON2_AVAILABLE = False

if _ARGON2_AVAILABLE:
    pwd_context = CryptContext(
        schemes=["argon2", "bcrypt"],
        deprecated="auto",
        default="argon2",
        argon2__type="ID",
        argon2__time_cost=settings.ARGON2_TIME_COST,
        argon2__memory_cost=settings.ARGON2_MEMORY_KIB,
        argon2__parallelism=settings.ARGON2_PARALLELISM,
        bcrypt__rounds=settings.BCRYPT_ROUNDS,
    )
else:  # pragma: no cover
    # Sanctioned fallback if the wheel is unavailable on the target platform.
    pwd_context = CryptContext(
        schemes=["bcrypt"],
        deprecated="auto",
        bcrypt__rounds=settings.BCRYPT_ROUNDS,
    )

# bcrypt silently truncates past 72 bytes. Argon2id has no such limit, but the
# cap is still enforced on the way in so a password stays valid if a
# deployment ever falls back to bcrypt.
MAX_BCRYPT_PASSWORD_BYTES = 72

# Constant-time comparison target used when an account does not exist, so a
# login attempt costs the same whether or not the email is registered.
_DUMMY_HASH = pwd_context.hash("timing-equalizer-not-a-real-password")

# The passwords that credential-stuffing lists lead with, plus the words this
# product invites people to reuse. Structural checks below catch the long tail
# (keyboard runs, single repeated character, year suffixes).
# ponytail: inline list, swap for a hashed 100k corpus if breach data shows leaks.
_COMMON_PASSWORDS = {
    "123456", "123456789", "12345678", "1234567890", "password", "qwerty",
    "qwerty123", "abc123", "111111", "123123", "1234567", "sunshine",
    "iloveyou", "princess", "admin", "welcome", "monkey", "login", "dragon",
    "passw0rd", "master", "hello", "freedom", "whatever", "qazwsx", "trustno1",
    "letmein", "baseball", "football", "starwars", "superman", "batman",
    "michael", "shadow", "ashley", "jordan", "hunter", "harley", "ranger",
    "buster", "soccer", "hockey", "killer", "george", "andrew", "charlie",
    "jessica", "pepper", "zxcvbnm", "asdfgh", "qwertyuiop", "1q2w3e4r",
    "1qaz2wsx", "password1", "password123", "p@ssw0rd", "p@ssword",
    "administrator", "changeme", "default", "secret", "test123", "temp123",
    "root", "toor", "guest", "user", "manager", "company", "india123",
    "welcome1", "welcome123", "abcd1234", "a1b2c3d4", "qwe123", "asd123",
    "forgequote", "quote123", "machining", "cncquote", "cnc123",
}

# Sequences a password must not lean on wholesale.
_KEYBOARD_RUNS = (
    "qwertyuiop", "asdfghjkl", "zxcvbnm", "abcdefghijklmnopqrstuvwxyz",
    "0123456789",
)


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


def verify_password_dummy(plain_password: str) -> None:
    """Burn the same CPU as a real verify for unknown accounts.

    Without this, "no such user" returns in microseconds while a wrong
    password costs ~100ms, which is a reliable account-enumeration oracle.
    """
    try:
        pwd_context.verify(plain_password[:MAX_BCRYPT_PASSWORD_BYTES], _DUMMY_HASH)
    except ValueError:
        pass


def get_password_hash(password: str) -> str:
    """Create bcrypt hash for a plain-text password."""
    if password_utf8_length(password) > MAX_BCRYPT_PASSWORD_BYTES:
        raise ValueError("Password exceeds bcrypt 72-byte limit")
    return pwd_context.hash(password)


def needs_rehash(hashed_password: str) -> bool:
    """True when a stored hash uses a weaker cost than currently configured."""
    try:
        return pwd_context.needs_update(hashed_password)
    except ValueError:
        return False


def create_access_token(
    subject: str,
    expires_delta: Optional[timedelta] = None,
    *,
    session_id: Optional[str] = None,
    session_started_at: Optional[datetime] = None,
) -> str:
    """Create a signed JWT access token.

    ``sid`` ties the token to a login session so logout and password changes
    can invalidate it; ``iat``/``sst`` carry the absolute-timeout anchor.
    """
    now = datetime.utcnow()
    expire = now + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    payload: dict[str, Any] = {
        "sub": subject,
        "token_type": "access",
        "iat": now,
        "exp": expire,
        "jti": uuid.uuid4().hex,
    }
    if session_id:
        payload["sid"] = session_id
    if session_started_at:
        payload["sst"] = int(session_started_at.timestamp())
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(
    subject: str,
    expires_delta: Optional[timedelta] = None,
    *,
    session_id: Optional[str] = None,
    session_started_at: Optional[datetime] = None,
) -> str:
    """Create a signed JWT refresh token."""
    now = datetime.utcnow()
    expire = now + (expires_delta or timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS))
    payload: dict[str, Any] = {
        "sub": subject,
        "token_type": "refresh",
        "iat": now,
        "exp": expire,
        "jti": uuid.uuid4().hex,
    }
    if session_id:
        payload["sid"] = session_id
    if session_started_at:
        payload["sst"] = int(session_started_at.timestamp())
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def hash_token(token: str) -> str:
    """Hash refresh/reset tokens before storing in DB."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_reset_token() -> tuple[str, str]:
    """Return (clear_token, token_hash) for a password reset link.

    The clear token is only ever put in the email; the database holds the
    SHA-256 so a database leak cannot be replayed into account takeover.
    """
    token = secrets.token_urlsafe(32)
    return token, hash_token(token)


def tokens_equal(candidate_hash: str, stored_hash: str) -> bool:
    """Constant-time token hash comparison."""
    return hmac.compare_digest(candidate_hash, stored_hash)


def new_session_id() -> str:
    """Opaque identifier for one login session (session regeneration key)."""
    return secrets.token_urlsafe(18)


def _has_repetition_or_sequence(password: str) -> bool:
    lowered = password.lower()
    if len(set(lowered)) <= 3:
        return True
    for run in _KEYBOARD_RUNS:
        for size in range(6, len(run) + 1):
            for start in range(len(run) - size + 1):
                chunk = run[start:start + size]
                if chunk in lowered or chunk[::-1] in lowered:
                    return True
    return False


def _normalize_for_common_check(password: str) -> str:
    """Strip the decorations people add to a weak base word."""
    lowered = password.lower()
    for source, target in (("@", "a"), ("$", "s"), ("0", "o"), ("1", "i"), ("!", "i"), ("3", "e")):
        lowered = lowered.replace(source, target)
    return re.sub(r"[^a-z]", "", lowered)


def validate_password_strength(
    password: str,
    *,
    email: Optional[str] = None,
    full_name: Optional[str] = None,
) -> Optional[str]:
    """Validate strong password policy and return error message if invalid.

    Policy (OWASP ASVS 2.1): length, all four character classes, no common
    or structurally weak passwords, and no reuse of the user's own identity.
    """
    if len(password) < settings.PASSWORD_MIN_LENGTH:
        return f"Password must be at least {settings.PASSWORD_MIN_LENGTH} characters long"
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

    lowered = password.lower()
    normalized = _normalize_for_common_check(password)
    # Exact match, plus "weak base word with decorations" — Password123!,
    # P@ssw0rd2026 and friends are what stuffing lists actually contain.
    if lowered in _COMMON_PASSWORDS or normalized in _COMMON_PASSWORDS:
        return "This password is too common. Choose something unique."
    if any(
        len(common) >= 6 and (common in lowered or common in normalized)
        for common in _COMMON_PASSWORDS
    ):
        return "This password is too common. Choose something unique."
    if _has_repetition_or_sequence(password):
        return "Password must not rely on repeated characters or keyboard sequences"

    if email:
        local_part = email.split("@", 1)[0].strip().lower()
        if len(local_part) >= 4 and local_part in lowered:
            return "Password must not contain your email address"
    if full_name:
        for word in re.split(r"\s+", full_name.strip().lower()):
            if len(word) >= 4 and word in lowered:
                return "Password must not contain your name"
    return None


def password_was_used_before(password: str, previous_hashes: Optional[Iterable[str]]) -> bool:
    """True when the candidate password matches any stored historical hash."""
    for old_hash in previous_hashes or []:
        if not old_hash:
            continue
        try:
            if pwd_context.verify(password, old_hash):
                return True
        except ValueError:
            continue
    return False


def push_password_history(
    current_hash: Optional[str],
    history: Optional[list[str]],
) -> list[str]:
    """Append the outgoing hash and trim to the configured history depth."""
    entries = list(history or [])
    if current_hash:
        entries.append(current_hash)
    depth = max(settings.PASSWORD_HISTORY_DEPTH, 0)
    return entries[-depth:] if depth else []
