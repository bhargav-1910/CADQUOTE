"""Authentication endpoints for signup/login/profile."""
from pathlib import Path
import uuid
from datetime import datetime, timedelta
import secrets
from jose import JWTError, jwt

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.core.security import (
    create_access_token,
    create_refresh_token,
    get_password_hash,
    hash_token,
    validate_password_strength,
    verify_password,
)
from app.models.models import User, PasswordResetToken
from app.services.email import send_plain_email
from app.services.billing import add_points
from app.schemas.schemas import (
    AuthTokenResponse,
    ForgotPasswordRequest,
    GenericMessageResponse,
    LoginRequest,
    RefreshTokenRequest,
    ResetPasswordRequest,
    UserProfileResponse,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])

PASSWORD_RESET_EXPIRY_SECONDS = 30 * 60


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
        created_at=user.created_at,
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


async def _store_logo_file(logo: UploadFile | None) -> str | None:
    if logo is None or not logo.filename:
        return None

    ext = Path(logo.filename).suffix.lower()
    allowed = {".png", ".jpg", ".jpeg", ".svg", ".webp"}
    if ext not in allowed:
        raise HTTPException(status_code=400, detail="Unsupported logo format")

    logo_dir = Path(settings.UPLOAD_DIR) / "company_logos"
    logo_dir.mkdir(parents=True, exist_ok=True)
    generated_name = f"{uuid.uuid4().hex}{ext}"
    target = logo_dir / generated_name

    content = await logo.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Logo exceeds 5MB limit")

    target.write_bytes(content)
    return str(Path("company_logos") / generated_name)


async def _issue_tokens_for_user(db: AsyncSession, user: User) -> tuple[str, str]:
    access_token = create_access_token(subject=user.email)
    refresh_token = create_refresh_token(subject=user.email)
    user.refresh_token_hash = hash_token(refresh_token)
    refresh_payload = jwt.decode(refresh_token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    exp = refresh_payload.get("exp")
    user.refresh_token_expires_at = datetime.utcfromtimestamp(exp) if exp else None
    await db.commit()
    await db.refresh(user)
    return access_token, refresh_token


@router.post("/register", response_model=AuthTokenResponse, status_code=201)
async def register(
    full_name: str = Form(...),
    email: str = Form(...),
    password: str = Form(...),
    company_name: str = Form(...),
    company_address: str = Form(...),
    phone_number: str | None = Form(None),
    logo: UploadFile | None = File(None),
    db: AsyncSession = Depends(get_db),
):
    """Register a new user with company details and optional logo upload."""
    normalized_email = _normalize_email(email)

    password_error = validate_password_strength(password)
    if password_error:
        raise HTTPException(status_code=400, detail=password_error)

    existing = await db.execute(select(User).where(User.email == normalized_email))
    if existing.scalar_one_or_none() is not None:
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

    access_token, refresh_token = await _issue_tokens_for_user(db, user)
    return AuthTokenResponse(access_token=access_token, refresh_token=refresh_token, user=_profile_from_user(user))


@router.post("/login", response_model=AuthTokenResponse)
async def login(
    payload: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate with email/password and issue JWT token."""
    normalized_email = _normalize_email(payload.email)
    result = await db.execute(select(User).where(User.email == normalized_email))
    user = result.scalar_one_or_none()

    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    access_token, refresh_token = await _issue_tokens_for_user(db, user)
    return AuthTokenResponse(access_token=access_token, refresh_token=refresh_token, user=_profile_from_user(user))


@router.post("/refresh", response_model=AuthTokenResponse)
async def refresh(
    payload: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db),
):
    """Refresh access token using a valid refresh token."""
    refresh_token = payload.refresh_token.strip()
    try:
        token_payload = jwt.decode(refresh_token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        if token_payload.get("token_type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid refresh token")
        email = token_payload.get("sub")
        if not email:
            raise HTTPException(status_code=401, detail="Invalid refresh token")
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid refresh token") from exc

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    expected_hash = user.refresh_token_hash
    if not expected_hash or expected_hash != hash_token(refresh_token):
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    if user.refresh_token_expires_at and user.refresh_token_expires_at < datetime.utcnow():
        raise HTTPException(status_code=401, detail="Refresh token expired")

    access_token, new_refresh_token = await _issue_tokens_for_user(db, user)
    return AuthTokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
        user=_profile_from_user(user),
    )


@router.post("/password/forgot", response_model=GenericMessageResponse)
async def forgot_password(
    payload: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    """Send password reset link email if account exists."""
    normalized_email = _normalize_email(payload.email)
    result = await db.execute(select(User).where(User.email == normalized_email))
    user = result.scalar_one_or_none()

    generic_message = GenericMessageResponse(
        message="If the email exists, a password reset link has been sent."
    )
    if user is None:
        return generic_message

    # Revoke previous unused tokens for this user.
    existing_tokens = await db.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used.is_(False),
        )
    )
    for token in existing_tokens.scalars().all():
        token.used = True

    reset_token_raw = secrets.token_urlsafe(32)
    token_entry = PasswordResetToken(
        user_id=user.id,
        token_hash=hash_token(reset_token_raw),
        expires_at=datetime.utcnow() + timedelta(seconds=PASSWORD_RESET_EXPIRY_SECONDS),
        used=False,
    )
    db.add(token_entry)
    await db.commit()

    reset_url = f"{settings.FRONTEND_BASE_URL.rstrip('/')}/reset-password?token={reset_token_raw}"
    subject = "Reset your ForgeQuote password"
    body = (
        "We received a request to reset your password.\n\n"
        f"Reset link: {reset_url}\n"
        f"This link expires in {PASSWORD_RESET_EXPIRY_SECONDS // 60} minutes.\n\n"
        "If you did not request this, you can ignore this email."
    )

    try:
        await send_plain_email(recipient_email=normalized_email, subject=subject, body=body)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to send reset email: {str(exc)}") from exc

    return generic_message


@router.post("/password/reset", response_model=GenericMessageResponse)
async def reset_password(
    payload: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    """Reset password from a valid one-time reset token."""
    password_error = validate_password_strength(payload.new_password)
    if password_error:
        raise HTTPException(status_code=400, detail=password_error)

    token_hash = hash_token(payload.token.strip())
    query = (
        select(PasswordResetToken)
        .where(PasswordResetToken.token_hash == token_hash)
        .limit(1)
    )
    result = await db.execute(query)
    token_entry = result.scalar_one_or_none()

    if token_entry is None or token_entry.used or token_entry.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    user = await db.get(User, token_entry.user_id)
    if user is None:
        raise HTTPException(status_code=400, detail="Invalid reset token")

    user.hashed_password = get_password_hash(payload.new_password)
    user.refresh_token_hash = None
    user.refresh_token_expires_at = None
    token_entry.used = True

    await db.commit()
    return GenericMessageResponse(message="Password reset successful")


@router.post("/logout")
async def logout(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Invalidate current refresh session state for the user."""
    current_user.refresh_token_hash = None
    current_user.refresh_token_expires_at = None
    await db.commit()
    return {"message": "Logged out"}


@router.get("/me", response_model=UserProfileResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Return the authenticated user's profile."""
    return _profile_from_user(current_user)


@router.patch("/me", response_model=UserProfileResponse)
async def update_me(
    full_name: str | None = Form(None),
    company_name: str | None = Form(None),
    company_address: str | None = Form(None),
    phone_number: str | None = Form(None),
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

    logo_relative_path = await _store_logo_file(logo)
    if logo_relative_path is not None:
        current_user.company_logo_path = logo_relative_path

    await db.commit()
    await db.refresh(current_user)
    return _profile_from_user(current_user)
