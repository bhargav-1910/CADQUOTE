"""Points wallet and Stripe billing service helpers."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import PointsWallet, PointsLedgerEntry, StripeCheckoutCredit, PointsPackage, User
from app.core.config import settings


class InsufficientPointsError(ValueError):
    """Raised when a user does not have enough points for an action."""


def has_active_subscription(user: User) -> bool:
    """Pro plan, either perpetual (no expiry) or not yet expired."""
    if user.plan != "pro":
        return False
    return user.plan_expires_at is None or user.plan_expires_at > datetime.utcnow()


async def list_points_packages(db: AsyncSession, *, active_only: bool = True) -> list[PointsPackage]:
    query = select(PointsPackage)
    if active_only:
        query = query.where(PointsPackage.is_active.is_(True))
    query = query.order_by(PointsPackage.display_order.asc(), PointsPackage.created_at.asc())
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_points_package_by_code(
    db: AsyncSession,
    package_code: str,
    *,
    active_only: bool = True,
) -> Optional[PointsPackage]:
    query = select(PointsPackage).where(PointsPackage.package_code == package_code)
    if active_only:
        query = query.where(PointsPackage.is_active.is_(True))
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def get_or_create_wallet(db: AsyncSession, user_id: UUID) -> PointsWallet:
    result = await db.execute(select(PointsWallet).where(PointsWallet.user_id == user_id))
    wallet = result.scalar_one_or_none()
    if wallet is not None:
        return wallet

    wallet = PointsWallet(user_id=user_id, balance_points=0)
    db.add(wallet)
    await db.flush()
    return wallet


async def append_ledger_entry(
    db: AsyncSession,
    *,
    user_id: UUID,
    delta_points: int,
    balance_after: int,
    action: str,
    description: Optional[str] = None,
    reference_type: Optional[str] = None,
    reference_id: Optional[str] = None,
    metadata_json: Optional[dict[str, Any]] = None,
) -> PointsLedgerEntry:
    entry = PointsLedgerEntry(
        user_id=user_id,
        delta_points=delta_points,
        balance_after=balance_after,
        action=action,
        description=description,
        reference_type=reference_type,
        reference_id=reference_id,
        metadata_json=metadata_json,
    )
    db.add(entry)
    await db.flush()
    return entry


async def add_points(
    db: AsyncSession,
    *,
    user_id: UUID,
    points: int,
    action: str,
    description: Optional[str] = None,
    reference_type: Optional[str] = None,
    reference_id: Optional[str] = None,
    metadata_json: Optional[dict[str, Any]] = None,
) -> PointsWallet:
    if points <= 0:
        raise ValueError("Points to add must be positive")

    wallet = await get_or_create_wallet(db, user_id)
    wallet.balance_points += points

    await append_ledger_entry(
        db,
        user_id=user_id,
        delta_points=points,
        balance_after=wallet.balance_points,
        action=action,
        description=description,
        reference_type=reference_type,
        reference_id=reference_id,
        metadata_json=metadata_json,
    )
    await db.flush()
    return wallet


async def consume_points(
    db: AsyncSession,
    *,
    user_id: UUID,
    points: int,
    action: str,
    description: Optional[str] = None,
    reference_type: Optional[str] = None,
    reference_id: Optional[str] = None,
    metadata_json: Optional[dict[str, Any]] = None,
) -> PointsWallet:
    if points <= 0:
        raise ValueError("Points to consume must be positive")

    wallet = await get_or_create_wallet(db, user_id)

    # Points system disabled (dev/testing): every action is free, nothing is
    # deducted and no ledger entry is written.
    if not settings.POINTS_SYSTEM_ENABLED:
        return wallet

    if wallet.balance_points < points:
        raise InsufficientPointsError("Insufficient points balance")

    wallet.balance_points -= points

    await append_ledger_entry(
        db,
        user_id=user_id,
        delta_points=-points,
        balance_after=wallet.balance_points,
        action=action,
        description=description,
        reference_type=reference_type,
        reference_id=reference_id,
        metadata_json=metadata_json,
    )
    await db.flush()
    return wallet


async def has_checkout_credit(db: AsyncSession, stripe_session_id: str) -> bool:
    result = await db.execute(
        select(StripeCheckoutCredit).where(StripeCheckoutCredit.stripe_session_id == stripe_session_id)
    )
    return result.scalar_one_or_none() is not None


async def mark_checkout_credit(
    db: AsyncSession,
    *,
    stripe_session_id: str,
    user_id: UUID,
    package_id: str,
    points_credited: int,
    amount_paid_minor: Optional[int],
    currency: Optional[str],
) -> StripeCheckoutCredit:
    row = StripeCheckoutCredit(
        stripe_session_id=stripe_session_id,
        user_id=user_id,
        package_id=package_id,
        points_credited=points_credited,
        amount_paid_minor=amount_paid_minor,
        currency=currency,
    )
    db.add(row)
    await db.flush()
    return row
