"""Account lifecycle operations (GDPR erasure).

Deletion is a hard delete rather than a soft flag: the privacy policy promises
erasure, and a tombstoned row that still holds the customer list would not be
erasure. Ordering follows the foreign keys, children first.
"""
from __future__ import annotations

import logging
from pathlib import Path

from sqlalchemy import delete as sql_delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.models import (
    CADFile,
    ConsentRecord,
    Customer,
    GeometryAnalysis,
    PasswordResetToken,
    PointsLedgerEntry,
    PointsWallet,
    Quote,
    StripeCheckoutCredit,
    User,
)
from app.services.storage import storage

logger = logging.getLogger(__name__)


async def _delete_stored_files(db: AsyncSession, user_id) -> None:
    """Remove CAD uploads, generated PDFs and the company logo from storage."""
    file_rows = await db.execute(select(CADFile.file_path).where(CADFile.user_id == user_id))
    pdf_rows = await db.execute(
        select(Quote.pdf_path).where(Quote.user_id == user_id, Quote.pdf_path.isnot(None))
    )
    for path in [*file_rows.scalars().all(), *pdf_rows.scalars().all()]:
        if not path:
            continue
        try:
            await storage.delete(path)
        except Exception as exc:  # noqa: BLE001 - a stuck file must not block erasure
            logger.warning("Could not delete stored object during account purge: %s", exc)


async def purge_user_data(db: AsyncSession, user: User) -> None:
    """Delete the user and everything owned by them, then commit."""
    user_id = user.id
    logo_path = user.company_logo_path

    await _delete_stored_files(db, user_id)

    cad_file_ids = (
        await db.execute(select(CADFile.id).where(CADFile.user_id == user_id))
    ).scalars().all()

    # Children before parents: geometry -> quotes -> files -> customers.
    if cad_file_ids:
        await db.execute(
            sql_delete(GeometryAnalysis).where(GeometryAnalysis.cad_file_id.in_(cad_file_ids))
        )
    await db.execute(sql_delete(Quote).where(Quote.user_id == user_id))
    await db.execute(sql_delete(CADFile).where(CADFile.user_id == user_id))
    await db.execute(sql_delete(Customer).where(Customer.user_id == user_id))
    await db.execute(sql_delete(PointsLedgerEntry).where(PointsLedgerEntry.user_id == user_id))
    await db.execute(sql_delete(PointsWallet).where(PointsWallet.user_id == user_id))
    await db.execute(sql_delete(StripeCheckoutCredit).where(StripeCheckoutCredit.user_id == user_id))
    await db.execute(sql_delete(PasswordResetToken).where(PasswordResetToken.user_id == user_id))
    await db.execute(sql_delete(ConsentRecord).where(ConsentRecord.user_id == user_id))
    await db.execute(sql_delete(User).where(User.id == user_id))
    await db.commit()

    if logo_path:
        try:
            (Path(settings.UPLOAD_DIR) / logo_path).unlink(missing_ok=True)
        except OSError as exc:
            logger.warning("Could not delete company logo during account purge: %s", exc)
