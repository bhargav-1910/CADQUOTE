"""Authentication endpoints for signup/login/profile/password recovery."""
from pathlib import Path
import re
import uuid
from datetime import datetime, timedelta
from jose import JWTError, jwt

from fastapi import (
    APIRouter, BackgroundTasks, Cookie, Depends, File, Form, HTTPException,
    Request, Response, UploadFile,
)
from sqlalchemy import delete as sql_delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, is_admin, session_expired
from app.core import ratelimit
from app.core.config import settings
from app.core.database import get_db
from app.core.security import (
    create_access_token,
    create_refresh_token,
    generate_reset_token,
    get_password_hash,
    hash_token,
    needs_rehash,
    new_session_id,
    password_was_used_before,
    push_password_history,
    tokens_equal,
    validate_password_strength,
    verify_password,
    verify_password_dummy,
)
from app.core import totp
from app.core.security_log import log_security_event
from app.models.models import EmailVerificationToken, PasswordResetToken, User
from app.services.billing import add_points
from app.services.email import (
    build_reset_url,
    build_verify_url,
    render_password_changed_email,
    render_password_reset_email,
    render_totp_changed_email,
    render_verify_email,
    send_email,
)
from app.schemas.schemas import (
    AccountDeleteRequest,
    EmailVerificationConfirm,
    TotpDisableRequest,
    TotpEnableRequest,
    TotpSetupResponse,
    TotpStatusResponse,
    AuthTokenResponse,
    LoginRequest,
    MessageResponse,
    PasswordChangeRequest,
    PasswordResetConfirm,
    PasswordResetRequest,
    RefreshTokenRequest,
    UserProfileResponse,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])

# Uniform response for the reset flow. Returning the same message whether or
# not the address exists is what stops account enumeration.
_RESET_ACK = (
    "If an account exists for that email, we've sent password reset instructions."
)


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _build_logo_url(path: str | None) -> str | None:
    if not path:
        return None
    normalized = path.replace("\\", "/")
    return f"/uploads/{normalized}"


def _profile_from_user(user: User) -> UserProfileResponse:
    return UserProfileResponse(
        id=user.id,
        full_name=user.full_name,
        email=user.email,
        company_name=user.company_name,
        company_address=user.company_address,
        phone_number=user.phone_number,
        company_logo_url=_build_logo_url(user.company_logo_path),
        brand_color=user.brand_color,
        gstin=user.gstin,
        plan=user.plan,
        plan_expires_at=user.plan_expires_at,
        created_at=user.created_at,
        role="admin" if is_admin(user) else "user",
        email_verified=bool(user.email_verified),
        totp_enabled=bool(user.totp_enabled),
    )


def _normalize_phone(phone_number: str | None) -> str | None:
    if phone_number is None:
        return None
    value = phone_number.strip()
    if not value:
        return None
    allowed = set("+0123456789 -()")
    if any(ch not in allowed for ch in value):
        raise HTTPException(status_code=400, detail="Phone number contains invalid characters")
    digits = [ch for ch in value if ch.isdigit()]
    if len(digits) < 7 or len(digits) > 15:
        raise HTTPException(status_code=400, detail="Phone number must contain 7 to 15 digits")
    return value


# Raster formats only. SVG is an executable document: served from our own
# origin it becomes stored XSS against every page that renders the logo, so it
# is not accepted no matter what the browser would do with it.
_LOGO_TYPES: dict[str, tuple[bytes, ...]] = {
    ".png": (b"\x89PNG\r\n\x1a\n",),
    ".jpg": (b"\xff\xd8\xff",),
    ".jpeg": (b"\xff\xd8\xff",),
    ".webp": (b"RIFF",),
}
_MAX_LOGO_BYTES = 5 * 1024 * 1024


async def _store_logo_file(logo: UploadFile | None) -> str | None:
    if logo is None or not logo.filename:
        return None

    ext = Path(logo.filename).suffix.lower()
    if ext not in _LOGO_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Unsupported logo format. Use PNG, JPG or WEBP.",
        )

    # Read with a hard ceiling: reading first and checking length afterwards
    # lets a 2GB upload exhaust memory before the check runs.
    content = await logo.read(_MAX_LOGO_BYTES + 1)
    if len(content) > _MAX_LOGO_BYTES:
        raise HTTPException(status_code=400, detail="Logo exceeds 5MB limit")
    if not content:
        raise HTTPException(status_code=400, detail="Logo file is empty")

    # The extension is a claim; the bytes decide.
    if not any(content.startswith(signature) for signature in _LOGO_TYPES[ext]):
        raise HTTPException(status_code=400, detail="Logo content does not match its file type")
    if ext == ".webp" and content[8:12] != b"WEBP":
        raise HTTPException(status_code=400, detail="Logo content does not match its file type")

    logo_dir = Path(settings.UPLOAD_DIR) / "company_logos"
    logo_dir.mkdir(parents=True, exist_ok=True)
    # Random name: the client filename never reaches the filesystem, which
    # rules out traversal and overwrite of another tenant's asset.
    generated_name = f"{uuid.uuid4().hex}{ext}"
    (logo_dir / generated_name).write_bytes(content)
    return str(Path("company_logos") / generated_name)


async def _issue_tokens_for_user(
    db: AsyncSession,
    user: User,
    *,
    regenerate_session: bool = False,
) -> tuple[str, str]:
    """Mint an access/refresh pair bound to the user's current session.

    ``regenerate_session=True`` is used on login: a brand-new session id makes
    any token minted before authentication useless (session fixation defence).
    """
    now = datetime.utcnow()
    if regenerate_session or not user.session_id:
        user.session_id = new_session_id()
        user.session_started_at = now
    user.last_activity_at = now

    access_token = create_access_token(
        subject=user.email,
        session_id=user.session_id,
        session_started_at=user.session_started_at,
    )
    refresh_token = create_refresh_token(
        subject=user.email,
        session_id=user.session_id,
        session_started_at=user.session_started_at,
    )
    user.refresh_token_hash = hash_token(refresh_token)
    refresh_payload = jwt.decode(refresh_token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    exp = refresh_payload.get("exp")
    user.refresh_token_expires_at = datetime.utcfromtimestamp(exp) if exp else None
    await db.commit()
    await db.refresh(user)
    return access_token, refresh_token


# The refresh token is the long-lived credential, so it is kept out of
# JavaScript's reach entirely: HttpOnly blocks XSS exfiltration, SameSite=strict
# blocks cross-site use, and the narrow path means it is only ever sent to the
# endpoints that need it. The short-lived access token still travels in the
# Authorization header, so no CSRF token is needed for the rest of the API.
REFRESH_COOKIE_NAME = "forgequote_refresh"
_REFRESH_COOKIE_PATH = "/api/auth"


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600,
        httponly=True,
        secure=settings.is_production or settings.FORCE_HTTPS,
        samesite="strict",
        path=_REFRESH_COOKIE_PATH,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=REFRESH_COOKIE_NAME,
        path=_REFRESH_COOKIE_PATH,
        httponly=True,
        secure=settings.is_production or settings.FORCE_HTTPS,
        samesite="strict",
    )


def _account_locked_for(user: User) -> int:
    """Remaining lock seconds, or 0 when the account is usable."""
    if user.locked_until and user.locked_until > datetime.utcnow():
        return int((user.locked_until - datetime.utcnow()).total_seconds()) + 1
    return 0



async def _issue_verification_email(
    db: AsyncSession, user: User, background_tasks: BackgroundTasks
) -> None:
    """Send a fresh verification link, invalidating any outstanding one."""
    await db.execute(
        sql_delete(EmailVerificationToken).where(
            EmailVerificationToken.user_id == user.id,
            EmailVerificationToken.used.is_(False),
        )
    )
    clear_token, token_hash = generate_reset_token()
    db.add(
        EmailVerificationToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=datetime.utcnow() + timedelta(hours=settings.EMAIL_VERIFICATION_TTL_HOURS),
        )
    )
    await db.commit()

    subject, text_body, html_body = render_verify_email(
        full_name=user.full_name, verify_url=build_verify_url(clear_token)
    )
    background_tasks.add_task(send_email, user.email, subject, text_body, html_body)


@router.post("/register", response_model=AuthTokenResponse, status_code=201)
async def register(
    request: Request,
    response: Response,
    background_tasks: BackgroundTasks,
    full_name: str = Form(..., max_length=200),
    email: str = Form(..., max_length=200),
    password: str = Form(..., max_length=200),
    company_name: str = Form(..., max_length=200),
    # Address and logo are collected later in Profile Settings — requiring
    # them at signup measurably hurts completion.
    company_address: str = Form("", max_length=1000),
    phone_number: str | None = Form(None, max_length=40),
    logo: UploadFile | None = File(None),
    db: AsyncSession = Depends(get_db),
):
    """Register a new user with company details and optional logo upload."""
    await ratelimit.enforce(
        request, "auth.register", limit=5, window_seconds=3600, event="auth.register.throttled"
    )
    normalized_email = _normalize_email(email)
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[A-Za-z]{2,}", normalized_email):
        raise HTTPException(status_code=400, detail="Enter a valid email address")

    # Operator-owned addresses cannot be claimed through public signup. An
    # attacker registering the address first would otherwise be sitting on the
    # account an operator later promotes to admin.
    if normalized_email in settings.reserved_admin_emails:
        log_security_event(
            "auth.register", request=request, email=normalized_email,
            outcome="denied", reason="reserved_address",
        )
        raise HTTPException(
            status_code=403,
            detail="This email address is reserved. Contact the site administrator.",
        )

    password_error = validate_password_strength(
        password, email=normalized_email, full_name=full_name
    )
    if password_error:
        raise HTTPException(status_code=400, detail=password_error)

    existing = await db.execute(select(User).where(User.email == normalized_email))
    if existing.scalar_one_or_none() is not None:
        log_security_event(
            "auth.register", request=request, email=normalized_email,
            outcome="failure", reason="duplicate_email",
        )
        raise HTTPException(status_code=409, detail="Email is already registered")

    logo_relative_path = await _store_logo_file(logo)
    normalized_phone_number = _normalize_phone(phone_number)

    user = User(
        full_name=full_name.strip(),
        email=normalized_email,
        hashed_password="",
        company_name=company_name.strip(),
        company_address=company_address.strip(),
        phone_number=normalized_phone_number,
        company_logo_path=logo_relative_path,
        password_changed_at=datetime.utcnow(),
        role="user",
    )
    try:
        user.hashed_password = get_password_hash(password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    db.add(user)
    await db.flush()
    await add_points(
        db,
        user_id=user.id,
        points=settings.POINTS_STARTING_BONUS,
        action="starting_bonus",
        description="Welcome bonus points",
        reference_type="user",
        reference_id=str(user.id),
    )
    await db.commit()
    await db.refresh(user)

    access_token, refresh_token = await _issue_tokens_for_user(db, user, regenerate_session=True)
    _set_refresh_cookie(response, refresh_token)
    await _issue_verification_email(db, user, background_tasks)
    log_security_event("auth.register", request=request, user_id=user.id, email=user.email)
    return AuthTokenResponse(access_token=access_token, refresh_token=refresh_token, user=_profile_from_user(user))


@router.post("/login", response_model=AuthTokenResponse)
async def login(
    request: Request,
    response: Response,
    payload: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate with email/password and issue JWT tokens."""
    normalized_email = _normalize_email(payload.email)

    # Two windows: one per source address (spray from one host) and one per
    # account (distributed stuffing against a single victim).
    await ratelimit.enforce(
        request, "auth.login.ip", limit=20, window_seconds=300, event="auth.login.throttled"
    )
    await ratelimit.enforce(
        request,
        "auth.login.account",
        limit=10,
        window_seconds=300,
        identifier=normalized_email,
        event="auth.login.throttled",
    )

    result = await db.execute(select(User).where(User.email == normalized_email))
    user = result.scalar_one_or_none()

    if user is None:
        # Equalize response time so a missing account is indistinguishable
        # from a wrong password.
        verify_password_dummy(payload.password)
        log_security_event(
            "auth.login", request=request, email=normalized_email,
            outcome="failure", reason="unknown_account",
        )
        raise HTTPException(status_code=401, detail="Invalid email or password")

    locked_seconds = _account_locked_for(user)
    if locked_seconds:
        log_security_event(
            "auth.login", request=request, user_id=user.id, email=user.email,
            outcome="denied", reason="account_locked",
        )
        raise HTTPException(
            status_code=423,
            detail="Account temporarily locked after repeated failed logins. Try again shortly.",
            headers={"Retry-After": str(locked_seconds)},
        )

    if not user.is_active:
        log_security_event(
            "auth.login", request=request, user_id=user.id, email=user.email,
            outcome="denied", reason="inactive_account",
        )
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not verify_password(payload.password, user.hashed_password):
        user.failed_login_count = (user.failed_login_count or 0) + 1
        locked = user.failed_login_count >= settings.LOGIN_MAX_ATTEMPTS
        if locked:
            user.locked_until = datetime.utcnow() + timedelta(minutes=settings.LOGIN_LOCKOUT_MINUTES)
            user.failed_login_count = 0
        await db.commit()
        log_security_event(
            "auth.login", request=request, user_id=user.id, email=user.email,
            outcome="failure", reason="bad_password",
            failed_count=user.failed_login_count, locked=locked,
        )
        if locked:
            raise HTTPException(
                status_code=423,
                detail="Account temporarily locked after repeated failed logins. Try again shortly.",
                headers={"Retry-After": str(settings.LOGIN_LOCKOUT_MINUTES * 60)},
            )
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Password is correct. If the account carries a second factor, it must be
    # satisfied before any token is issued — a valid password alone must not
    # produce a session.
    if user.totp_enabled and user.totp_secret:
        submitted = (payload.totp_code or "").strip()
        if not submitted:
            log_security_event(
                "auth.login", request=request, user_id=user.id, email=user.email,
                outcome="failure", reason="totp_required",
            )
            raise HTTPException(
                status_code=401,
                detail="totp_required: Enter the code from your authenticator app.",
            )

        valid, step = totp.verify_code(
            user.totp_secret, submitted, last_used_step=user.totp_last_used_step
        )
        if valid:
            user.totp_last_used_step = step
        else:
            # Not a TOTP code: it may be a single-use recovery code.
            remaining = totp.consume_backup_code(submitted, user.totp_backup_codes)
            if remaining is None:
                user.failed_login_count = (user.failed_login_count or 0) + 1
                locked_now = user.failed_login_count >= settings.LOGIN_MAX_ATTEMPTS
                if locked_now:
                    user.locked_until = datetime.utcnow() + timedelta(
                        minutes=settings.LOGIN_LOCKOUT_MINUTES
                    )
                    user.failed_login_count = 0
                await db.commit()
                log_security_event(
                    "auth.login", request=request, user_id=user.id, email=user.email,
                    outcome="failure", reason="bad_totp", locked=locked_now,
                )
                raise HTTPException(status_code=401, detail="Invalid authentication code")

            user.totp_backup_codes = remaining
            log_security_event(
                "auth.totp.backup_code_used", request=request, user_id=user.id,
                email=user.email, remaining=len(remaining),
            )

    # Successful login: clear the failure state and upgrade a stale hash to
    # the current bcrypt cost while the plaintext is in hand.
    user.failed_login_count = 0
    user.locked_until = None
    user.last_login_at = datetime.utcnow()
    if needs_rehash(user.hashed_password):
        user.hashed_password = get_password_hash(payload.password)
    await ratelimit.reset_shared(ratelimit.build_key('auth.login.account', request, normalized_email))

    access_token, refresh_token = await _issue_tokens_for_user(db, user, regenerate_session=True)
    _set_refresh_cookie(response, refresh_token)
    log_security_event("auth.login", request=request, user_id=user.id, email=user.email)
    return AuthTokenResponse(access_token=access_token, refresh_token=refresh_token, user=_profile_from_user(user))


@router.get("/login-challenge")
async def login_challenge(request: Request, email: str = ""):
    """Whether the client should present a challenge before the next attempt.

    Driven by recent failures from this source; deliberately says nothing
    about whether the address is registered.
    """
    ip = ratelimit.client_ip(request) or "unknown"
    failures = ratelimit.peek(f"auth.login.ip|{ip}", window_seconds=300)
    if email:
        failures = max(
            failures,
            ratelimit.peek(f"auth.login.account|{ip}|{_normalize_email(email)}", window_seconds=300),
        )
    return {"challenge_required": failures >= settings.LOGIN_CAPTCHA_AFTER_FAILURES}


@router.post("/refresh", response_model=AuthTokenResponse)
async def refresh(
    request: Request,
    response: Response,
    payload: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db),
    refresh_cookie: str | None = Cookie(default=None, alias=REFRESH_COOKIE_NAME),
):
    """Refresh access token using a valid refresh token.

    The HttpOnly cookie is preferred; the request body stays supported for
    non-browser clients that hold the token themselves.
    """
    await ratelimit.enforce(
        request, "auth.refresh", limit=60, window_seconds=300, event="auth.refresh.throttled"
    )
    invalid = HTTPException(status_code=401, detail="Invalid refresh token")
    refresh_token = (refresh_cookie or payload.refresh_token or "").strip()
    if not refresh_token:
        raise invalid
    try:
        token_payload = jwt.decode(
            refresh_token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
        if token_payload.get("token_type") != "refresh":
            raise invalid
        email = token_payload.get("sub")
        if not email:
            raise invalid
    except JWTError as exc:
        raise invalid from exc

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise invalid

    expected_hash = user.refresh_token_hash
    if not expected_hash or not tokens_equal(hash_token(refresh_token), expected_hash):
        # A refresh token that verifies as a JWT but is not the stored one is
        # either replayed or stolen: kill the session outright.
        user.refresh_token_hash = None
        user.refresh_token_expires_at = None
        user.session_id = None
        await db.commit()
        log_security_event(
            "auth.refresh", request=request, user_id=user.id, email=user.email,
            outcome="failure", reason="token_reuse",
        )
        raise invalid

    token_sid = token_payload.get("sid")
    if token_sid is not None and token_sid != user.session_id:
        raise invalid

    if user.refresh_token_expires_at and user.refresh_token_expires_at < datetime.utcnow():
        raise HTTPException(status_code=401, detail="Refresh token expired")

    if session_expired(user, user.session_started_at):
        user.refresh_token_hash = None
        user.refresh_token_expires_at = None
        user.session_id = None
        await db.commit()
        log_security_event(
            "auth.refresh", request=request, user_id=user.id, email=user.email,
            outcome="denied", reason="session_timeout",
        )
        raise HTTPException(status_code=401, detail="Session expired. Please sign in again.")

    access_token, new_refresh_token = await _issue_tokens_for_user(db, user)
    _set_refresh_cookie(response, new_refresh_token)
    return AuthTokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
        user=_profile_from_user(user),
    )


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Invalidate the current session for the user."""
    current_user.refresh_token_hash = None
    current_user.refresh_token_expires_at = None
    # Dropping the session id invalidates every access token issued for it,
    # not just the refresh token.
    current_user.session_id = None
    current_user.session_started_at = None
    await db.commit()
    _clear_refresh_cookie(response)
    log_security_event("auth.logout", request=request, user_id=current_user.id, email=current_user.email)
    return {"message": "Logged out"}


# ============================================================================
# Password recovery
# ============================================================================

@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(
    request: Request,
    payload: PasswordResetRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Start a password reset. Always returns the same acknowledgement."""
    normalized_email = _normalize_email(payload.email)
    await ratelimit.enforce(
        request,
        "auth.forgot.ip",
        limit=settings.PASSWORD_RESET_MAX_PER_HOUR,
        window_seconds=3600,
        event="auth.password_reset.throttled",
    )
    await ratelimit.enforce(
        request,
        "auth.forgot.account",
        limit=settings.PASSWORD_RESET_MAX_PER_HOUR,
        window_seconds=3600,
        identifier=normalized_email,
        event="auth.password_reset.throttled",
    )

    result = await db.execute(select(User).where(User.email == normalized_email))
    user = result.scalar_one_or_none()

    if user is None or not user.is_active:
        log_security_event(
            "auth.password_reset.requested", request=request, email=normalized_email,
            outcome="failure", reason="unknown_account",
        )
        return MessageResponse(message=_RESET_ACK)

    # Outstanding tokens for this account are void the moment a new one is
    # issued, so a leaked older link cannot be used.
    await db.execute(
        sql_delete(PasswordResetToken).where(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used.is_(False),
        )
    )

    clear_token, token_hash = generate_reset_token()
    db.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=datetime.utcnow() + timedelta(minutes=settings.PASSWORD_RESET_TOKEN_TTL_MINUTES),
        )
    )
    await db.commit()

    subject, text_body, html_body = render_password_reset_email(
        full_name=user.full_name, reset_url=build_reset_url(clear_token)
    )
    # Sent after the response so delivery latency cannot be timed to tell a
    # registered address from an unregistered one.
    background_tasks.add_task(send_email, user.email, subject, text_body, html_body)

    log_security_event(
        "auth.password_reset.requested", request=request, user_id=user.id, email=user.email
    )
    return MessageResponse(message=_RESET_ACK)


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(
    request: Request,
    payload: PasswordResetConfirm,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Complete a password reset using a one-time token."""
    await ratelimit.enforce(
        request, "auth.reset", limit=10, window_seconds=3600, event="auth.password_reset.throttled"
    )
    invalid = HTTPException(
        status_code=400, detail="This reset link is invalid or has expired. Request a new one."
    )

    token_hash = hash_token(payload.token.strip())
    result = await db.execute(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash)
    )
    token_row = result.scalar_one_or_none()
    if token_row is None or token_row.used or token_row.expires_at < datetime.utcnow():
        log_security_event(
            "auth.password_reset.completed", request=request,
            outcome="failure", reason="invalid_or_expired_token",
        )
        raise invalid

    user = await db.get(User, token_row.user_id)
    if user is None or not user.is_active:
        raise invalid

    policy_error = validate_password_strength(
        payload.new_password, email=user.email, full_name=user.full_name
    )
    if policy_error:
        raise HTTPException(status_code=400, detail=policy_error)

    if verify_password(payload.new_password, user.hashed_password) or password_was_used_before(
        payload.new_password, user.password_history
    ):
        raise HTTPException(
            status_code=400,
            detail=f"Choose a password you have not used in your last {settings.PASSWORD_HISTORY_DEPTH} passwords",
        )

    user.password_history = push_password_history(user.hashed_password, user.password_history)
    user.hashed_password = get_password_hash(payload.new_password)
    user.password_changed_at = datetime.utcnow()
    # A recovered account must not leave the attacker's session alive.
    user.session_id = None
    user.session_started_at = None
    user.refresh_token_hash = None
    user.refresh_token_expires_at = None
    user.failed_login_count = 0
    user.locked_until = None

    token_row.used = True
    # Any sibling token for this account dies with it.
    await db.execute(
        sql_delete(PasswordResetToken).where(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.id != token_row.id,
        )
    )
    await db.commit()

    subject, text_body, html_body = render_password_changed_email(full_name=user.full_name)
    background_tasks.add_task(send_email, user.email, subject, text_body, html_body)

    log_security_event(
        "auth.password_reset.completed", request=request, user_id=user.id, email=user.email
    )
    return MessageResponse(message="Password updated. You can now sign in with your new password.")


@router.post("/change-password", response_model=MessageResponse)
async def change_password(
    request: Request,
    payload: PasswordChangeRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Change password while signed in; ends all other sessions."""
    await ratelimit.enforce(
        request,
        "auth.change_password",
        limit=10,
        window_seconds=3600,
        identifier=str(current_user.id),
        event="auth.change_password.throttled",
    )
    if not verify_password(payload.current_password, current_user.hashed_password):
        log_security_event(
            "auth.password_change", request=request, user_id=current_user.id,
            email=current_user.email, outcome="failure", reason="bad_current_password",
        )
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    policy_error = validate_password_strength(
        payload.new_password, email=current_user.email, full_name=current_user.full_name
    )
    if policy_error:
        raise HTTPException(status_code=400, detail=policy_error)

    if verify_password(payload.new_password, current_user.hashed_password) or password_was_used_before(
        payload.new_password, current_user.password_history
    ):
        raise HTTPException(
            status_code=400,
            detail=f"Choose a password you have not used in your last {settings.PASSWORD_HISTORY_DEPTH} passwords",
        )

    current_user.password_history = push_password_history(
        current_user.hashed_password, current_user.password_history
    )
    current_user.hashed_password = get_password_hash(payload.new_password)
    current_user.password_changed_at = datetime.utcnow()
    current_user.session_id = None
    current_user.session_started_at = None
    current_user.refresh_token_hash = None
    current_user.refresh_token_expires_at = None
    await db.commit()

    subject, text_body, html_body = render_password_changed_email(full_name=current_user.full_name)
    background_tasks.add_task(send_email, current_user.email, subject, text_body, html_body)

    log_security_event(
        "auth.password_change", request=request, user_id=current_user.id, email=current_user.email
    )
    return MessageResponse(message="Password updated. Please sign in again.")


# ============================================================================
# Email verification
# ============================================================================

@router.post("/verify-email", response_model=MessageResponse)
async def verify_email(
    request: Request,
    payload: EmailVerificationConfirm,
    db: AsyncSession = Depends(get_db),
):
    """Confirm ownership of the signup address using the emailed token."""
    await ratelimit.enforce(
        request, "auth.verify_email", limit=20, window_seconds=3600,
        event="auth.verify_email.throttled",
    )
    invalid = HTTPException(
        status_code=400,
        detail="This confirmation link is invalid or has expired. Request a new one.",
    )

    token_hash = hash_token(payload.token.strip())
    result = await db.execute(
        select(EmailVerificationToken).where(EmailVerificationToken.token_hash == token_hash)
    )
    row = result.scalar_one_or_none()
    if row is None or row.used or row.expires_at < datetime.utcnow():
        log_security_event(
            "auth.email_verified", request=request, outcome="failure",
            reason="invalid_or_expired_token",
        )
        raise invalid

    user = await db.get(User, row.user_id)
    if user is None or not user.is_active:
        raise invalid

    user.email_verified = True
    user.email_verified_at = datetime.utcnow()
    row.used = True
    await db.execute(
        sql_delete(EmailVerificationToken).where(
            EmailVerificationToken.user_id == user.id,
            EmailVerificationToken.id != row.id,
        )
    )
    await db.commit()

    log_security_event(
        "auth.email_verified", request=request, user_id=user.id, email=user.email
    )
    return MessageResponse(message="Email address confirmed.")


@router.post("/resend-verification", response_model=MessageResponse)
async def resend_verification(
    request: Request,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Send a fresh confirmation link to the signed-in user's address."""
    await ratelimit.enforce(
        request, "auth.resend_verification", limit=5, window_seconds=3600,
        identifier=str(current_user.id), event="auth.verify_email.throttled",
    )
    if current_user.email_verified:
        return MessageResponse(message="Your email address is already confirmed.")

    await _issue_verification_email(db, current_user, background_tasks)
    log_security_event(
        "auth.email_verification.resent", request=request,
        user_id=current_user.id, email=current_user.email,
    )
    return MessageResponse(message="Confirmation email sent.")


# ============================================================================
# Two-factor authentication (TOTP)
# ============================================================================

@router.get("/totp", response_model=TotpStatusResponse)
async def totp_status(current_user: User = Depends(get_current_user)):
    """Whether a second factor is active on this account."""
    return TotpStatusResponse(
        enabled=bool(current_user.totp_enabled),
        confirmed_at=current_user.totp_confirmed_at,
        backup_codes_remaining=len(current_user.totp_backup_codes or []),
    )


@router.post("/totp/setup", response_model=TotpSetupResponse)
async def totp_setup(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Begin enrolment: issue a secret and recovery codes.

    Nothing is enforced until /totp/enable proves the authenticator app is
    generating valid codes, so a half-finished enrolment cannot lock anyone
    out. Calling this again before enabling replaces the pending secret.
    """
    await ratelimit.enforce(
        request, "auth.totp.setup", limit=10, window_seconds=3600,
        identifier=str(current_user.id),
    )
    if current_user.totp_enabled:
        raise HTTPException(
            status_code=409,
            detail="Two-factor authentication is already enabled. Disable it first to re-enrol.",
        )

    secret = totp.generate_secret()
    codes, hashes = totp.generate_backup_codes()

    current_user.totp_secret = secret
    current_user.totp_backup_codes = hashes
    current_user.totp_enabled = False
    current_user.totp_last_used_step = None
    await db.commit()

    log_security_event(
        "auth.totp.setup_started", request=request,
        user_id=current_user.id, email=current_user.email,
    )
    return TotpSetupResponse(
        secret=secret,
        otpauth_uri=totp.provisioning_uri(
            secret,
            account=current_user.email,
            issuer=settings.LEGAL_COMPANY_NAME or settings.APP_NAME,
        ),
        backup_codes=codes,
    )


@router.post("/totp/enable", response_model=MessageResponse)
async def totp_enable(
    request: Request,
    payload: TotpEnableRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Finish enrolment by proving the app produces valid codes."""
    await ratelimit.enforce(
        request, "auth.totp.enable", limit=10, window_seconds=900,
        identifier=str(current_user.id),
    )
    if current_user.totp_enabled:
        return MessageResponse(message="Two-factor authentication is already enabled.")
    if not current_user.totp_secret:
        raise HTTPException(status_code=400, detail="Start setup before enabling two-factor authentication")

    valid, step = totp.verify_code(current_user.totp_secret, payload.code)
    if not valid:
        log_security_event(
            "auth.totp.enable", request=request, user_id=current_user.id,
            email=current_user.email, outcome="failure",
        )
        raise HTTPException(status_code=400, detail="That code is not valid. Check your authenticator app and try again.")

    current_user.totp_enabled = True
    current_user.totp_confirmed_at = datetime.utcnow()
    current_user.totp_last_used_step = step
    await db.commit()

    subject, text_body, html_body = render_totp_changed_email(
        full_name=current_user.full_name, enabled=True
    )
    background_tasks.add_task(send_email, current_user.email, subject, text_body, html_body)

    log_security_event(
        "auth.totp.enabled", request=request, user_id=current_user.id, email=current_user.email
    )
    return MessageResponse(message="Two-factor authentication is on. Keep your recovery codes safe.")


@router.post("/totp/disable", response_model=MessageResponse)
async def totp_disable(
    request: Request,
    payload: TotpDisableRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Turn off the second factor. Requires the account password."""
    await ratelimit.enforce(
        request, "auth.totp.disable", limit=10, window_seconds=3600,
        identifier=str(current_user.id),
    )
    if not verify_password(payload.password, current_user.hashed_password):
        log_security_event(
            "auth.totp.disable", request=request, user_id=current_user.id,
            email=current_user.email, outcome="failure", reason="bad_password",
        )
        raise HTTPException(status_code=400, detail="Password is incorrect")

    current_user.totp_enabled = False
    current_user.totp_secret = None
    current_user.totp_backup_codes = None
    current_user.totp_confirmed_at = None
    current_user.totp_last_used_step = None
    await db.commit()

    subject, text_body, html_body = render_totp_changed_email(
        full_name=current_user.full_name, enabled=False
    )
    background_tasks.add_task(send_email, current_user.email, subject, text_body, html_body)

    log_security_event(
        "auth.totp.disabled", request=request, user_id=current_user.id, email=current_user.email
    )
    return MessageResponse(message="Two-factor authentication is off.")


@router.get("/me", response_model=UserProfileResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Return the authenticated user's profile."""
    return _profile_from_user(current_user)


@router.delete("/me", response_model=MessageResponse)
async def delete_me(
    request: Request,
    payload: AccountDeleteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Permanently delete the account and all workspace data (GDPR erasure).

    Password plus an explicit confirmation phrase are required because this is
    irreversible and removes quotes that may be business records.
    """
    if payload.confirm.strip().upper() != "DELETE":
        raise HTTPException(status_code=400, detail="Type DELETE to confirm account deletion")
    if not verify_password(payload.password, current_user.hashed_password):
        log_security_event(
            "account.delete", request=request, user_id=current_user.id,
            email=current_user.email, outcome="failure", reason="bad_password",
        )
        raise HTTPException(status_code=400, detail="Password is incorrect")

    from app.services.account import purge_user_data

    user_id, email = current_user.id, current_user.email
    await purge_user_data(db, current_user)
    log_security_event("account.delete", request=request, user_id=user_id, email=email)
    return MessageResponse(message="Your account and all associated data have been deleted.")


@router.patch("/me", response_model=UserProfileResponse)
async def update_me(
    full_name: str | None = Form(None, max_length=200),
    company_name: str | None = Form(None, max_length=200),
    company_address: str | None = Form(None, max_length=1000),
    phone_number: str | None = Form(None, max_length=40),
    brand_color: str | None = Form(None, max_length=20),
    gstin: str | None = Form(None, max_length=20),
    logo: UploadFile | None = File(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update authenticated user's profile details and logo."""
    if full_name is not None:
        value = full_name.strip()
        if not value:
            raise HTTPException(status_code=400, detail="Full name cannot be empty")
        current_user.full_name = value

    if company_name is not None:
        value = company_name.strip()
        if not value:
            raise HTTPException(status_code=400, detail="Company name cannot be empty")
        current_user.company_name = value

    if company_address is not None:
        value = company_address.strip()
        if not value:
            raise HTTPException(status_code=400, detail="Company address cannot be empty")
        current_user.company_address = value

    if phone_number is not None:
        current_user.phone_number = _normalize_phone(phone_number)

    if brand_color is not None:
        value = brand_color.strip().lower()
        if not value:
            current_user.brand_color = None
        else:
            if not re.fullmatch(r"#[0-9a-f]{6}", value):
                raise HTTPException(status_code=400, detail="Brand color must be a hex value like #0284c7")
            current_user.brand_color = value

    if gstin is not None:
        value = gstin.strip().upper()
        if not value:
            current_user.gstin = None
        else:
            if not re.fullmatch(r"[0-9A-Z]{15}", value):
                raise HTTPException(status_code=400, detail="GSTIN must be 15 characters (digits and capital letters)")
            current_user.gstin = value

    logo_relative_path = await _store_logo_file(logo)
    if logo_relative_path is not None:
        current_user.company_logo_path = logo_relative_path

    await db.commit()
    await db.refresh(current_user)
    return _profile_from_user(current_user)
