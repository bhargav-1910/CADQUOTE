"""Reusable API dependencies."""
from datetime import datetime, timedelta

from jose import JWTError, jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.core.database import get_db
from app.core.security_log import log_security_event
from app.models.models import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# Deliberately vague: a 401 must not reveal whether the account exists, is
# locked, or simply presented a stale token.
_CREDENTIALS_EXCEPTION = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


def session_expired(user: User, session_started_at: datetime | None) -> bool:
    """True when the session is past its idle or absolute lifetime.

    Absolute timeout is anchored to login time (carried in the token as ``sst``
    and mirrored on the user row); idle timeout is measured from the last
    request seen on this session.
    """
    now = datetime.utcnow()
    started = session_started_at or user.session_started_at
    if started and now - started > timedelta(hours=settings.SESSION_ABSOLUTE_TIMEOUT_HOURS):
        return True
    if user.last_activity_at and now - user.last_activity_at > timedelta(
        minutes=settings.SESSION_IDLE_TIMEOUT_MINUTES
    ):
        return True
    return False


async def get_current_user(
    request: Request,
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Resolve and validate the current user from a JWT bearer token."""
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],  # never trust the header 'alg'
        )
        if payload.get("token_type") != "access":
            raise _CREDENTIALS_EXCEPTION
        email = payload.get("sub")
        if not email:
            raise _CREDENTIALS_EXCEPTION
    except JWTError as exc:
        raise _CREDENTIALS_EXCEPTION from exc

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise _CREDENTIALS_EXCEPTION

    # Session binding. Tokens minted before session tracking carry no 'sid';
    # they stay valid until their own short expiry rather than logging the
    # whole user base out on deploy.
    token_sid = payload.get("sid")
    if token_sid is not None and token_sid != user.session_id:
        log_security_event(
            "session.rejected",
            request=request,
            user_id=user.id,
            email=user.email,
            outcome="denied",
            reason="stale_session",
        )
        raise _CREDENTIALS_EXCEPTION

    session_started_at = None
    if payload.get("sst"):
        try:
            session_started_at = datetime.utcfromtimestamp(int(payload["sst"]))
        except (TypeError, ValueError, OSError):
            session_started_at = None

    if token_sid is not None and session_expired(user, session_started_at):
        user.session_id = None
        user.refresh_token_hash = None
        user.refresh_token_expires_at = None
        await db.commit()
        log_security_event(
            "session.expired",
            request=request,
            user_id=user.id,
            email=user.email,
            outcome="denied",
        )
        raise _CREDENTIALS_EXCEPTION

    # Idle-timeout heartbeat, throttled to one write per minute so a busy
    # workspace does not turn every read into a database write.
    now = datetime.utcnow()
    if not user.last_activity_at or (now - user.last_activity_at) > timedelta(minutes=1):
        user.last_activity_at = now
        await db.commit()

    return user


def is_admin(user: User) -> bool:
    """Admin is decided solely by the stored role.

    Deliberately NOT by matching the email against ADMIN_EMAILS. Registration
    is open and unverified, so anyone who guessed a configured admin address —
    and the contact addresses are published on our own policy pages — could
    have claimed it first and been handed the role. "The real admin registers
    first" is a race, not an access control.

    ADMIN_EMAILS now only *reserves* those addresses from public signup; the
    role itself is granted out of band by `python -m app.manage grant-admin`,
    which requires database access.

    The role additionally requires a verified address, so a privileged account
    is always one whose owner provably controls the mailbox — that mailbox is
    the password-reset path, and therefore the account's real root of trust.
    """
    if (user.role or "user").strip().lower() != "admin":
        return False
    if settings.REQUIRE_VERIFIED_EMAIL_FOR_ADMIN and not user.email_verified:
        return False
    return True


async def require_admin(
    request: Request,
    current_user: User = Depends(get_current_user),
) -> User:
    """Gate privileged, tenant-wide configuration endpoints."""
    if not is_admin(current_user):
        log_security_event(
            "authz.denied",
            request=request,
            user_id=current_user.id,
            email=current_user.email,
            outcome="denied",
            required_role="admin",
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator access required")
    return current_user
