"""Platform administration API.

Every route requires the admin role (verified email included, see
``deps.is_admin``) and every state change is written to the security log, so
the audit trail records who changed what. Admins act on other accounts only:
suspending or erasing yourself or another admin is refused here, and the admin
role itself is still granted only from the CLI.
"""
from __future__ import annotations

import enum
import json
import logging
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Literal, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import is_admin, require_admin_hidden
from app.core.database import get_db, get_db_session
from app.core.security_log import flush_security_events, log_security_event, mask_email
from app.models.models import (
    CADFile,
    ConsentRecord,
    Customer,
    PointsLedgerEntry,
    ProcessingStatus,
    Quote,
    QuoteStatus,
    SecurityEvent,
    User,
)
from app.schemas.schemas import (
    AdminCadFailureItem,
    AdminCadFailureListResponse,
    AdminConsentItem,
    AdminDailyPoint,
    AdminDeleteUserRequest,
    AdminOverviewResponse,
    AdminPlanUpdate,
    AdminPrivacyResponse,
    AdminSecurityEventItem,
    AdminSecurityEventListResponse,
    AdminStatusUpdate,
    AdminUserItem,
    AdminUserListResponse,
)
from app.services.account import purge_user_data
from app.services.billing import has_active_subscription
from app.services.geometry import process_cad_file

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["Admin"])

# Never part of a data export: credentials, session material, second factor.
_EXPORT_EXCLUDED_USER_FIELDS = {
    "hashed_password", "refresh_token_hash", "refresh_token_expires_at", "session_id",
    "password_history", "totp_secret", "totp_backup_codes", "totp_last_used_step",
    "failed_login_count", "locked_until",
}


def _audit(request: Request, admin: User, action: str, **details: Any) -> None:
    log_security_event(
        "admin.users", request=request, user_id=admin.id, email=admin.email,
        action=action, **details,
    )


def _user_item(user: User, quote_count: int = 0) -> AdminUserItem:
    return AdminUserItem(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        company_name=user.company_name,
        plan=user.plan or "free",
        plan_expires_at=user.plan_expires_at,
        plan_active=has_active_subscription(user),
        is_admin=is_admin(user),
        is_active=bool(user.is_active),
        email_verified=bool(user.email_verified),
        totp_enabled=bool(user.totp_enabled),
        quote_count=quote_count,
        created_at=user.created_at,
        last_login_at=user.last_login_at,
        last_activity_at=user.last_activity_at,
    )


async def _target_user(db: AsyncSession, user_id: uuid.UUID) -> User:
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def _refuse_self_or_admin(admin: User, target: User, verb: str) -> None:
    if target.id == admin.id:
        raise HTTPException(status_code=400, detail=f"You cannot {verb} your own account.")
    if (target.role or "user").strip().lower() == "admin":
        raise HTTPException(
            status_code=400,
            detail=f"Revoke the admin role first (python -m app.manage revoke-admin) before you {verb} this account.",
        )


# ---------------------------------------------------------------------------
# Overview
# ---------------------------------------------------------------------------

@router.get("/overview", response_model=AdminOverviewResponse)
async def overview(
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin_hidden),
):
    now = datetime.utcnow()
    since = now - timedelta(days=days)

    async def count(query) -> int:
        return int((await db.execute(query)).scalar() or 0)

    users_total = await count(select(func.count(User.id)))
    users_new = await count(select(func.count(User.id)).where(User.created_at >= since))
    users_active = await count(select(func.count(User.id)).where(User.last_activity_at >= since))
    users_pro = await count(
        select(func.count(User.id)).where(
            User.plan == "pro",
            or_(User.plan_expires_at.is_(None), User.plan_expires_at > now),
        )
    )
    users_suspended = await count(select(func.count(User.id)).where(User.is_active.is_(False)))
    quotes_total = await count(select(func.count(Quote.id)))
    quotes_new = await count(select(func.count(Quote.id)).where(Quote.created_at >= since))
    quotes_accepted = await count(
        select(func.count(Quote.id)).where(
            Quote.status == QuoteStatus.ACCEPTED, Quote.responded_at >= since
        )
    )
    cad_failed = await count(
        select(func.count(CADFile.id)).where(
            CADFile.processing_status == ProcessingStatus.FAILED, CADFile.created_at >= since
        )
    )

    # Per-day series; date() works on both PostgreSQL and SQLite.
    async def per_day(column) -> dict[str, int]:
        day = func.date(column)
        rows = await db.execute(select(day, func.count()).where(column >= since).group_by(day))
        return {str(d)[:10]: int(n) for d, n in rows.all() if d is not None}

    signups = await per_day(User.created_at)
    quotes = await per_day(Quote.created_at)
    daily = []
    day = since.date()
    while day <= now.date():
        key = day.isoformat()
        daily.append(AdminDailyPoint(date=key, signups=signups.get(key, 0), quotes=quotes.get(key, 0)))
        day += timedelta(days=1)

    return AdminOverviewResponse(
        days=days,
        users_total=users_total,
        users_new=users_new,
        users_active=users_active,
        users_pro=users_pro,
        users_suspended=users_suspended,
        quotes_total=quotes_total,
        quotes_new=quotes_new,
        quotes_accepted=quotes_accepted,
        cad_failed=cad_failed,
        daily=daily,
    )


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

@router.get("/users", response_model=AdminUserListResponse)
async def list_users(
    q: Optional[str] = Query(None, max_length=200),
    plan: Optional[Literal["free", "pro"]] = None,
    status: Optional[Literal["active", "suspended"]] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin_hidden),
):
    filters = []
    if q and q.strip():
        term = f"%{q.strip()}%"
        filters.append(or_(User.email.ilike(term), User.full_name.ilike(term), User.company_name.ilike(term)))
    if plan:
        filters.append(User.plan == plan)
    if status:
        filters.append(User.is_active.is_(status == "active"))

    total = int((await db.execute(select(func.count(User.id)).where(*filters))).scalar() or 0)

    quote_counts = (
        select(Quote.user_id, func.count(Quote.id).label("n")).group_by(Quote.user_id).subquery()
    )
    rows = await db.execute(
        select(User, func.coalesce(quote_counts.c.n, 0))
        .outerjoin(quote_counts, quote_counts.c.user_id == User.id)
        .where(*filters)
        .order_by(User.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return AdminUserListResponse(
        items=[_user_item(user, int(n)) for user, n in rows.all()],
        total=total,
    )


@router.patch("/users/{user_id}/plan", response_model=AdminUserItem)
async def update_plan(
    request: Request,
    user_id: uuid.UUID,
    payload: AdminPlanUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin_hidden),
):
    """Grant or revoke Pro (replaces the manual SQL UPDATE)."""
    target = await _target_user(db, user_id)
    if payload.plan == "pro" and payload.expires_at and payload.expires_at <= datetime.utcnow():
        raise HTTPException(status_code=400, detail="Expiry must be in the future.")
    previous = target.plan
    target.plan = payload.plan
    target.plan_expires_at = payload.expires_at if payload.plan == "pro" else None
    await db.commit()
    await db.refresh(target)
    _audit(request, admin, "plan.update", target_user_id=str(target.id),
           previous_plan=previous, plan=target.plan,
           expires_at=target.plan_expires_at.isoformat() if target.plan_expires_at else None)
    return _user_item(target)


@router.patch("/users/{user_id}/status", response_model=AdminUserItem)
async def update_status(
    request: Request,
    user_id: uuid.UUID,
    payload: AdminStatusUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin_hidden),
):
    """Suspend (and sign out everywhere) or reinstate an account."""
    target = await _target_user(db, user_id)
    if not payload.active:
        _refuse_self_or_admin(admin, target, "suspend")
    target.is_active = payload.active
    if not payload.active:
        # Kill every session now: access tokens are bound to session_id, and
        # the refresh token can no longer mint new ones.
        target.session_id = None
        target.refresh_token_hash = None
        target.refresh_token_expires_at = None
    await db.commit()
    await db.refresh(target)
    _audit(request, admin, "account.suspend" if not payload.active else "account.reinstate",
           target_user_id=str(target.id))
    return _user_item(target)


# ---------------------------------------------------------------------------
# Failed CAD processing
# ---------------------------------------------------------------------------

@router.get("/cad-failures", response_model=AdminCadFailureListResponse)
async def list_cad_failures(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin_hidden),
):
    failed = CADFile.processing_status == ProcessingStatus.FAILED
    total = int((await db.execute(select(func.count(CADFile.id)).where(failed))).scalar() or 0)
    rows = await db.execute(
        select(CADFile, User.email)
        .join(User, User.id == CADFile.user_id)
        .where(failed)
        .order_by(CADFile.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return AdminCadFailureListResponse(
        items=[
            AdminCadFailureItem(
                id=cad.id,
                original_filename=cad.original_filename,
                file_format=cad.file_format,
                file_size=cad.file_size,
                processing_status=cad.processing_status.value,
                processing_error=cad.processing_error,
                created_at=cad.created_at,
                user_id=cad.user_id,
                user_email=email,
            )
            for cad, email in rows.all()
        ],
        total=total,
    )


async def _reprocess(file_id: uuid.UUID) -> None:
    try:
        async with get_db_session() as session:
            cad = await session.get(CADFile, file_id)
            if cad is not None:
                await process_cad_file(session, cad)
    except Exception as exc:  # noqa: BLE001 - mirror the upload path's failure handling
        logger.error(f"Admin retry of geometry processing failed for {file_id}: {exc}")
        async with get_db_session() as session:
            cad = await session.get(CADFile, file_id)
            if cad is not None:
                cad.processing_status = ProcessingStatus.FAILED
                cad.processing_error = "Geometry analysis failed for this file."


@router.post("/cad-files/{file_id}/retry", status_code=202)
async def retry_cad_processing(
    request: Request,
    file_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin_hidden),
):
    """Re-run geometry analysis for a failed file (no points charged)."""
    cad = await db.get(CADFile, file_id)
    if cad is None:
        raise HTTPException(status_code=404, detail="File not found")
    if cad.processing_status != ProcessingStatus.FAILED:
        raise HTTPException(status_code=400, detail="Only failed files can be retried.")
    cad.processing_status = ProcessingStatus.PENDING
    cad.processing_error = None
    await db.commit()
    background_tasks.add_task(_reprocess, cad.id)
    log_security_event("admin.cad", request=request, user_id=admin.id, email=admin.email,
                       action="cad.retry", file_id=str(file_id))
    return {"status": "queued"}


# ---------------------------------------------------------------------------
# Audit log
# ---------------------------------------------------------------------------

@router.get("/audit-events", response_model=AdminSecurityEventListResponse)
async def list_audit_events(
    event: Optional[str] = Query(None, max_length=80, description="Prefix match, e.g. 'auth.'"),
    outcome: Optional[Literal["success", "failure", "denied"]] = None,
    user_id: Optional[uuid.UUID] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin_hidden),
):
    await flush_security_events()  # include anything logged in the last few seconds
    filters = []
    if event:
        filters.append(SecurityEvent.event.like(f"{event.strip()}%"))
    if outcome:
        filters.append(SecurityEvent.outcome == outcome)
    if user_id:
        filters.append(SecurityEvent.user_id == user_id)
    total = int((await db.execute(select(func.count(SecurityEvent.id)).where(*filters))).scalar() or 0)
    rows = await db.execute(
        select(SecurityEvent).where(*filters)
        .order_by(SecurityEvent.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return AdminSecurityEventListResponse(
        items=[AdminSecurityEventItem.model_validate(row, from_attributes=True) for row in rows.scalars().all()],
        total=total,
    )


# ---------------------------------------------------------------------------
# Privacy requests
# ---------------------------------------------------------------------------

@router.get("/users/{user_id}/privacy", response_model=AdminPrivacyResponse)
async def privacy_summary(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin_hidden),
):
    target = await _target_user(db, user_id)

    async def count(model) -> int:
        return int((await db.execute(select(func.count(model.id)).where(model.user_id == user_id))).scalar() or 0)

    counts = {
        "quotes": await count(Quote),
        "cad_files": await count(CADFile),
        "customers": await count(Customer),
        "points_ledger_entries": await count(PointsLedgerEntry),
        "consent_records": await count(ConsentRecord),
    }
    consents = await db.execute(
        select(ConsentRecord).where(ConsentRecord.user_id == user_id).order_by(ConsentRecord.created_at.desc())
    )
    return AdminPrivacyResponse(
        user=_user_item(target, counts["quotes"]),
        counts=counts,
        consents=[AdminConsentItem.model_validate(c, from_attributes=True) for c in consents.scalars().all()],
    )


def _row_dict(row: Any, exclude: set[str] = frozenset()) -> dict[str, Any]:
    """Column values of an ORM row, JSON-safe."""
    out: dict[str, Any] = {}
    for column in row.__table__.columns:
        if column.name in exclude:
            continue
        value = getattr(row, column.name)
        if isinstance(value, (datetime, date)):
            value = value.isoformat()
        elif isinstance(value, (uuid.UUID, Decimal)):
            value = str(value)
        elif isinstance(value, enum.Enum):
            value = value.value
        out[column.name] = value
    return out


@router.get("/users/{user_id}/export")
async def export_user_data(
    request: Request,
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin_hidden),
):
    """Everything held about one user as a JSON download (data-subject access)."""
    target = await _target_user(db, user_id)

    async def rows(model, *order):
        result = await db.execute(select(model).where(model.user_id == user_id).order_by(*order))
        return [_row_dict(r) for r in result.scalars().all()]

    bundle = {
        "exported_at": datetime.utcnow().isoformat() + "Z",
        "profile": _row_dict(target, _EXPORT_EXCLUDED_USER_FIELDS),
        "customers": await rows(Customer, Customer.created_at),
        "quotes": await rows(Quote, Quote.created_at),
        "cad_files": await rows(CADFile, CADFile.created_at),
        "points_ledger": await rows(PointsLedgerEntry, PointsLedgerEntry.created_at),
        "consent_records": await rows(ConsentRecord, ConsentRecord.created_at),
    }
    _audit(request, admin, "privacy.export", target_user_id=str(target.id))
    filename = f"forgequote-export-{target.id}.json"
    return Response(
        content=json.dumps(bundle, indent=2, default=str),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(
    request: Request,
    user_id: uuid.UUID,
    payload: AdminDeleteUserRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin_hidden),
):
    """Erase an account and everything it owns (same purge as self-deletion)."""
    target = await _target_user(db, user_id)
    _refuse_self_or_admin(admin, target, "delete")
    if payload.confirm_email.strip().lower() != target.email.lower():
        raise HTTPException(status_code=400, detail="Type the account's email address to confirm.")
    target_id, target_email = target.id, target.email
    await purge_user_data(db, target)
    _audit(request, admin, "privacy.erase", target_user_id=str(target_id), target_email=mask_email(target_email))
    return Response(status_code=204)
