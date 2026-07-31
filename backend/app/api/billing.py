"""Billing endpoints for points wallets and Stripe checkout."""
from __future__ import annotations

import uuid
import json
from urllib.parse import urlparse

import stripe
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_admin
from app.core import ratelimit
from app.core.config import settings
from app.core.database import get_db
from app.core.security_log import log_security_event
from app.models.models import PointsLedgerEntry, PointsPackage, User
from app.schemas.schemas import (
    CreateCheckoutSessionRequest,
    CreateCheckoutSessionResponse,
    PointsLedgerEntryResponse,
    PointsPackageCreateRequest,
    PointsPackageResponse,
    PointsPackageUpdateRequest,
    PointsWalletResponse,
)
from app.services.billing import (
    add_points,
    get_points_package_by_code,
    get_or_create_wallet,
    has_checkout_credit,
    list_points_packages,
    mark_checkout_credit,
)

router = APIRouter(prefix="/billing", tags=["Billing"])


def _get_stripe_client() -> stripe:
    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(status_code=400, detail="Stripe is not configured")
    stripe.api_key = settings.STRIPE_SECRET_KEY
    return stripe


def _validate_return_url(url: str | None, *, fallback: str) -> str:
    """Only allow return URLs on our own frontend origin.

    Stripe will redirect the customer wherever these point, so accepting a
    client-supplied absolute URL turns checkout into an open redirect that
    borrows our domain's credibility for phishing.
    """
    if not url:
        return fallback

    allowed = urlparse(settings.FRONTEND_BASE_URL)
    candidate = urlparse(url)
    if candidate.scheme not in {"http", "https"}:
        raise HTTPException(status_code=400, detail="Return URL must be http(s)")
    if (candidate.scheme, candidate.netloc) != (allowed.scheme, allowed.netloc):
        raise HTTPException(status_code=400, detail="Return URL must stay on this application")
    return url


@router.get("/packages", response_model=list[PointsPackageResponse])
async def list_points_packages_endpoint(
    include_inactive: bool = False,
    db: AsyncSession = Depends(get_db),
) -> list[PointsPackageResponse]:
    rows = await list_points_packages(db, active_only=not include_inactive)
    return [
        PointsPackageResponse(
            id=item.package_code,
            name=item.name,
            points=item.points,
            price_minor=item.price_minor,
            currency=item.currency,
            is_active=item.is_active,
            display_order=item.display_order,
        )
        for item in rows
    ]


@router.post("/packages", response_model=PointsPackageResponse, status_code=201)
async def create_points_package(
    request: Request,
    payload: PointsPackageCreateRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> PointsPackageResponse:
    """Create a points package. Admin-only: the price/points ratio here is
    what customers are charged, so an ordinary user must not be able to mint
    a package granting a million points for one rupee."""
    existing = await get_points_package_by_code(db, payload.package_code, active_only=False)
    if existing is not None:
        raise HTTPException(status_code=409, detail="Package code already exists")

    package = PointsPackage(
        package_code=payload.package_code.strip().lower(),
        name=payload.name.strip(),
        points=payload.points,
        price_minor=payload.price_minor,
        currency=payload.currency.strip().lower(),
        is_active=payload.is_active,
        display_order=payload.display_order,
    )
    db.add(package)
    await db.commit()
    await db.refresh(package)
    log_security_event(
        "admin.billing", request=request, user_id=admin.id, email=admin.email,
        action="package.create", package_code=package.package_code,
    )

    return PointsPackageResponse(
        id=package.package_code,
        name=package.name,
        points=package.points,
        price_minor=package.price_minor,
        currency=package.currency,
        is_active=package.is_active,
        display_order=package.display_order,
    )


@router.patch("/packages/{package_code}", response_model=PointsPackageResponse)
async def update_points_package(
    request: Request,
    package_code: str,
    payload: PointsPackageUpdateRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> PointsPackageResponse:
    """Update a points package (admin-only, see create_points_package)."""
    package = await get_points_package_by_code(db, package_code, active_only=False)
    if package is None:
        raise HTTPException(status_code=404, detail="Points package not found")

    updates = payload.model_dump(exclude_unset=True)
    for key, value in updates.items():
        if key == "name" and isinstance(value, str):
            value = value.strip()
        if key == "currency" and isinstance(value, str):
            value = value.strip().lower()
        setattr(package, key, value)

    await db.commit()
    await db.refresh(package)
    log_security_event(
        "admin.billing", request=request, user_id=admin.id, email=admin.email,
        action="package.update", package_code=package.package_code, fields=sorted(updates),
    )

    return PointsPackageResponse(
        id=package.package_code,
        name=package.name,
        points=package.points,
        price_minor=package.price_minor,
        currency=package.currency,
        is_active=package.is_active,
        display_order=package.display_order,
    )


@router.get("/wallet", response_model=PointsWalletResponse)
async def get_wallet(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PointsWalletResponse:
    wallet = await get_or_create_wallet(db, current_user.id)
    await db.commit()
    return PointsWalletResponse(balance_points=wallet.balance_points)


@router.get("/ledger", response_model=list[PointsLedgerEntryResponse])
async def list_wallet_ledger(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[PointsLedgerEntryResponse]:
    safe_limit = max(1, min(limit, 200))
    result = await db.execute(
        select(PointsLedgerEntry)
        .where(PointsLedgerEntry.user_id == current_user.id)
        .order_by(PointsLedgerEntry.created_at.desc())
        .limit(safe_limit)
    )
    entries = list(result.scalars().all())
    return [
        PointsLedgerEntryResponse(
            id=item.id,
            delta_points=item.delta_points,
            balance_after=item.balance_after,
            action=item.action,
            description=item.description,
            created_at=item.created_at,
        )
        for item in entries
    ]


@router.post("/checkout-session", response_model=CreateCheckoutSessionResponse)
async def create_checkout_session(
    request: Request,
    payload: CreateCheckoutSessionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CreateCheckoutSessionResponse:
    await ratelimit.enforce(
        request,
        "billing.checkout",
        limit=10,
        window_seconds=600,
        identifier=str(current_user.id),
    )
    stripe_client = _get_stripe_client()
    package = await get_points_package_by_code(db, payload.package_id, active_only=True)
    if package is None:
        raise HTTPException(status_code=404, detail="Points package not found")

    base = settings.FRONTEND_BASE_URL.rstrip("/")
    success_url = _validate_return_url(payload.success_url, fallback=f"{base}/billing?status=success")
    cancel_url = _validate_return_url(payload.cancel_url, fallback=f"{base}/billing?status=cancel")

    session = stripe_client.checkout.Session.create(
        mode="payment",
        success_url=success_url,
        cancel_url=cancel_url,
        customer_email=current_user.email,
        line_items=[
            {
                "quantity": 1,
                "price_data": {
                    "currency": package.currency,
                    "unit_amount": package.price_minor,
                    "product_data": {
                        "name": f"{package.name} Points Pack",
                        "description": f"Credits {package.points} points to your ForgeQuote wallet",
                    },
                },
            }
        ],
        metadata={
            "user_id": str(current_user.id),
            "package_id": package.package_code,
            "points": str(package.points),
        },
    )

    return CreateCheckoutSessionResponse(checkout_url=session.url, session_id=session.id)


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: str | None = Header(None, alias="Stripe-Signature"),
    db: AsyncSession = Depends(get_db),
):
    stripe_client = _get_stripe_client()
    body = await request.body()

    if settings.STRIPE_WEBHOOK_SECRET:
        if not stripe_signature:
            raise HTTPException(status_code=400, detail="Missing Stripe-Signature header")
        try:
            event = stripe_client.Webhook.construct_event(
                payload=body,
                sig_header=stripe_signature,
                secret=settings.STRIPE_WEBHOOK_SECRET,
            )
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Invalid webhook signature: {str(exc)}") from exc
    else:
        # An unsigned webhook is an unauthenticated "credit my wallet" endpoint.
        # Tolerable on a developer machine, never in production.
        if settings.is_production:
            log_security_event(
                "billing.webhook", request=request, outcome="denied",
                reason="webhook_secret_not_configured",
            )
            raise HTTPException(status_code=503, detail="Webhook processing is not configured")
        try:
            event = stripe.Event.construct_from(json.loads(body.decode("utf-8")), stripe.api_key)
        except Exception:
            raise HTTPException(status_code=400, detail="Webhook secret not configured and payload parse failed")

    if event["type"] != "checkout.session.completed":
        return {"received": True}

    session = event["data"]["object"]
    if session.get("payment_status") != "paid":
        return {"received": True}

    stripe_session_id = session.get("id")
    metadata = session.get("metadata") or {}

    user_id_raw = metadata.get("user_id")
    package_id = metadata.get("package_id")
    points_raw = metadata.get("points")
    if not stripe_session_id or not user_id_raw or not package_id or not points_raw:
        return {"received": True}

    if await has_checkout_credit(db, stripe_session_id):
        return {"received": True}

    try:
        user_id = uuid.UUID(user_id_raw)
        points = int(points_raw)
    except Exception:
        return {"received": True}

    await add_points(
        db,
        user_id=user_id,
        points=points,
        action="stripe_topup",
        description=f"Points top-up via Stripe package {package_id}",
        reference_type="stripe_checkout_session",
        reference_id=stripe_session_id,
        metadata_json={"package_id": package_id},
    )
    await mark_checkout_credit(
        db,
        stripe_session_id=stripe_session_id,
        user_id=user_id,
        package_id=package_id,
        points_credited=points,
        amount_paid_minor=session.get("amount_total"),
        currency=session.get("currency"),
    )
    await db.commit()

    return {"received": True}
