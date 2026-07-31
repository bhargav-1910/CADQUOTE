"""Per-user pricing catalog resolution.

Every shop has its own machine rates, material prices and finish costs, so the
catalog is per user rather than global:

* ``user_id IS NULL`` — a system default. Visible to everyone, editable only
  by an admin.
* ``user_id = <uid>`` — that user's private row. Editable by them alone.
* ``source_id`` — set when a private row replaces a system default, so the
  default is hidden for that user and can be restored by deleting the override.

Editing a system default performs copy-on-write: the user gets their own copy
with the change, and nobody else's pricing moves.
"""
from __future__ import annotations

import uuid
from typing import Iterable, Optional, Sequence, Type, TypeVar

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import InspectionLevel, Material, MachineRate, SurfaceFinish

# Every table that follows the owned-catalog pattern.
CatalogModel = TypeVar("CatalogModel", Material, SurfaceFinish, InspectionLevel, MachineRate)

CATALOG_MODELS: tuple[type, ...] = (Material, SurfaceFinish, InspectionLevel, MachineRate)

# Columns that identify a row rather than describe it; never copied verbatim.
_NON_COPYABLE = {"id", "user_id", "source_id", "created_at", "updated_at"}


def _column_names(model: Type[CatalogModel]) -> list[str]:
    return [column.name for column in model.__table__.columns]


async def _overridden_source_ids(
    db: AsyncSession, model: Type[CatalogModel], user_id: uuid.UUID
) -> list[uuid.UUID]:
    """System-row ids this user has already replaced with their own copy."""
    result = await db.execute(
        select(model.source_id).where(
            model.user_id == user_id, model.source_id.isnot(None)
        )
    )
    return [row for row in result.scalars().all() if row is not None]


async def effective_catalog(
    db: AsyncSession,
    model: Type[CatalogModel],
    user_id: uuid.UUID,
    *,
    active_only: bool = True,
    order_by: Optional[Sequence] = None,
) -> list[CatalogModel]:
    """The rows this user should see: their own, plus defaults they have not
    overridden."""
    shadowed = await _overridden_source_ids(db, model, user_id)

    visible = or_(
        model.user_id == user_id,
        model.user_id.is_(None) if not shadowed else (
            model.user_id.is_(None) & model.id.notin_(shadowed)
        ),
    )
    query = select(model).where(visible)
    if active_only:
        query = query.where(model.is_active.is_(True))
    if order_by:
        query = query.order_by(*order_by)

    result = await db.execute(query)
    return list(result.scalars().all())


async def get_for_user(
    db: AsyncSession,
    model: Type[CatalogModel],
    entity_id: uuid.UUID,
    user_id: uuid.UUID,
) -> Optional[CatalogModel]:
    """Fetch one catalog row if this user is allowed to use it.

    Rows owned by *another* user are invisible: material cost per kg and
    machine hourly rates are commercially sensitive, so one shop must never
    resolve another shop's pricing by guessing an id.
    """
    entity = await db.get(model, entity_id)
    if entity is None:
        return None
    if entity.user_id is not None and entity.user_id != user_id:
        return None
    return entity


def clone_for_user(
    model: Type[CatalogModel],
    source: CatalogModel,
    user_id: uuid.UUID,
) -> CatalogModel:
    """Build an unsaved private copy of a system default."""
    values = {
        name: getattr(source, name)
        for name in _column_names(model)
        if name not in _NON_COPYABLE
    }
    return model(
        id=uuid.uuid4(),
        user_id=user_id,
        source_id=source.id,
        **values,
    )


async def apply_update(
    db: AsyncSession,
    model: Type[CatalogModel],
    entity: CatalogModel,
    updates: dict,
    user_id: uuid.UUID,
) -> tuple[CatalogModel, bool]:
    """Apply ``updates``, copying on write when the row is a system default.

    Returns ``(row, created_override)``.
    """
    if entity.user_id == user_id:
        for field, value in updates.items():
            setattr(entity, field, value)
        return entity, False

    # System default: never mutate it on a normal user's behalf.
    override = clone_for_user(model, entity, user_id)
    for field, value in updates.items():
        setattr(override, field, value)
    db.add(override)
    return override, True


async def resolve_machine_rate(
    db: AsyncSession, user_id: Optional[uuid.UUID]
) -> Optional[MachineRate]:
    """The machine rate to price with: the user's own default, else theirs,
    else the system default.

    Falls back to system rows so a user who has customised nothing still gets
    sensible pricing.
    """
    if user_id is not None:
        own = await db.execute(
            select(MachineRate)
            .where(MachineRate.user_id == user_id, MachineRate.is_active.is_(True))
            .order_by(MachineRate.is_default.desc(), MachineRate.updated_at.desc())
        )
        rate = own.scalars().first()
        if rate is not None:
            return rate

        shadowed = await _overridden_source_ids(db, MachineRate, user_id)
    else:
        shadowed = []

    query = (
        select(MachineRate)
        .where(MachineRate.user_id.is_(None), MachineRate.is_active.is_(True))
        .order_by(MachineRate.is_default.desc(), MachineRate.updated_at.desc())
    )
    if shadowed:
        query = query.where(MachineRate.id.notin_(shadowed))
    result = await db.execute(query)
    return result.scalars().first()


async def user_override_count(db: AsyncSession, user_id: uuid.UUID) -> dict[str, int]:
    """How many rows this user has customised, per catalog."""
    counts: dict[str, int] = {}
    for model in CATALOG_MODELS:
        result = await db.execute(
            select(model.id).where(model.user_id == user_id)
        )
        counts[model.__tablename__] = len(result.scalars().all())
    return counts
