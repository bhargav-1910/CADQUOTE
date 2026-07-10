"""CRM-lite customer records.

One place owns the identity rules so quote creation, the customers API and
the startup backfill can never disagree:

1. Match by lowercased email within the owner's customers when present.
2. Else match by case-insensitive name + company.
3. Else create. Matches absorb blank fields from the new data but never
   overwrite anything already stored.
"""
import logging
import uuid
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Customer, Quote

logger = logging.getLogger(__name__)


def normalize_email(email: Optional[str]) -> Optional[str]:
    """Canonical form used for matching; None for blank/whitespace."""
    if not email:
        return None
    cleaned = email.strip().lower()
    return cleaned or None


def normalize_text(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    cleaned = value.strip()
    return cleaned or None


async def find_or_create_customer(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    name: Optional[str] = None,
    email: Optional[str] = None,
    company: Optional[str] = None,
    phone: Optional[str] = None,
    gstin: Optional[str] = None,
    notes: Optional[str] = None,
) -> Optional[Customer]:
    """Resolve the customer record these details belong to, creating it if
    new. Returns None when there is nothing to identify a customer by.

    Does not commit — callers own the transaction.
    """
    email = normalize_email(email)
    name = normalize_text(name)
    company = normalize_text(company)
    phone = normalize_text(phone)
    gstin = normalize_text(gstin)

    if not email and not name:
        return None

    customer: Optional[Customer] = None

    if email:
        result = await db.execute(
            select(Customer).where(
                Customer.user_id == user_id,
                func.lower(Customer.email) == email,
            )
        )
        customer = result.scalars().first()

    if customer is None and name:
        query = select(Customer).where(
            Customer.user_id == user_id,
            Customer.email.is_(None),
            func.lower(Customer.name) == name.lower(),
        )
        if company:
            query = query.where(func.lower(Customer.company) == company.lower())
        result = await db.execute(query)
        customer = result.scalars().first()

    if customer is None:
        customer = Customer(
            user_id=user_id,
            name=name or email or "Unknown customer",
            email=email,
            company=company,
            phone=phone,
            gstin=gstin,
            notes=notes,
        )
        db.add(customer)
        await db.flush()
        return customer

    # Fill blanks from the new data; never overwrite existing values.
    if not customer.email and email:
        customer.email = email
    if not customer.company and company:
        customer.company = company
    if not customer.phone and phone:
        customer.phone = phone
    if not customer.gstin and gstin:
        customer.gstin = gstin
    return customer


async def link_quote_customer(
    db: AsyncSession,
    quote: Quote,
    *,
    customer_id: Optional[uuid.UUID] = None,
) -> None:
    """Attach a customer to a quote.

    An explicit customer_id wins (after an ownership check); otherwise the
    quote's free-text fields are resolved via find-or-create.
    """
    if customer_id is not None:
        customer = await db.get(Customer, customer_id)
        if customer and customer.user_id == quote.user_id:
            quote.customer_id = customer.id
            return

    customer = await find_or_create_customer(
        db,
        quote.user_id,
        name=quote.customer_name,
        email=quote.customer_email,
        company=quote.customer_company,
    )
    if customer is not None:
        quote.customer_id = customer.id


async def backfill_customer_links() -> None:
    """Link pre-CRM quotes to customer records. Idempotent; runs at startup
    (same pattern as the geometry recovery janitor)."""
    from app.core.database import get_db_session

    try:
        async with get_db_session() as db:
            result = await db.execute(
                select(Quote).where(
                    Quote.customer_id.is_(None),
                    (Quote.customer_name.isnot(None)) | (Quote.customer_email.isnot(None)),
                )
            )
            quotes = list(result.scalars().all())
            if not quotes:
                return

            linked = 0
            for quote in quotes:
                await link_quote_customer(db, quote)
                if quote.customer_id is not None:
                    linked += 1
            await db.commit()
            logger.info("Customer backfill linked %d quote(s)", linked)
    except Exception:
        logger.exception("Customer backfill failed")
