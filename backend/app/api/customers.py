"""CRM-lite customer endpoints (owner-scoped)."""
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.models import Customer, Quote, QuoteStatus, User
from app.schemas.schemas import (
    CustomerCreate,
    CustomerResponse,
    CustomerUpdate,
    QuoteListResponse,
)
from app.services.customers import find_or_create_customer, normalize_email, normalize_text

router = APIRouter(
    prefix="/customers",
    tags=["Customers"],
    dependencies=[Depends(get_current_user)],
)

# Per-customer quote aggregates, reused by list and detail endpoints.
_AGGREGATES = (
    func.count(Quote.id).label("quote_count"),
    func.coalesce(func.sum(Quote.total_price), 0).label("total_quoted_value"),
    func.sum(case((Quote.status == QuoteStatus.ACCEPTED, 1), else_=0)).label("accepted_count"),
    func.sum(case((Quote.status == QuoteStatus.DECLINED, 1), else_=0)).label("declined_count"),
    func.max(Quote.created_at).label("last_quote_at"),
)


def _to_response(customer: Customer, stats) -> CustomerResponse:
    return CustomerResponse(
        id=customer.id,
        name=customer.name,
        email=customer.email,
        company=customer.company,
        phone=customer.phone,
        gstin=customer.gstin,
        notes=customer.notes,
        created_at=customer.created_at,
        updated_at=customer.updated_at,
        quote_count=int(stats.quote_count or 0),
        total_quoted_value=stats.total_quoted_value or 0,
        accepted_count=int(stats.accepted_count or 0),
        declined_count=int(stats.declined_count or 0),
        last_quote_at=stats.last_quote_at,
    )


async def _get_owned_customer(
    db: AsyncSession, user: User, customer_id: uuid.UUID
) -> Customer:
    customer = await db.get(Customer, customer_id)
    if not customer or customer.user_id != user.id:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


@router.get("", response_model=List[CustomerResponse])
async def list_customers(
    search: Optional[str] = Query(None, max_length=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List customers with quote aggregates, most recently active first."""
    query = (
        select(Customer, *_AGGREGATES)
        .outerjoin(Quote, Quote.customer_id == Customer.id)
        .where(Customer.user_id == current_user.id)
        .group_by(Customer.id)
        .order_by(func.max(Quote.created_at).desc().nullslast(), Customer.created_at.desc())
    )
    if search:
        needle = f"%{search.strip().lower()}%"
        query = query.where(
            or_(
                func.lower(Customer.name).like(needle),
                func.lower(Customer.company).like(needle),
                func.lower(Customer.email).like(needle),
            )
        )

    result = await db.execute(query)
    return [_to_response(row[0], row) for row in result.all()]


@router.post("", response_model=CustomerResponse, status_code=201)
async def create_customer(
    payload: CustomerCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a customer (find-or-create: an existing record with the same
    email or name+company is returned instead of a duplicate)."""
    customer = await find_or_create_customer(
        db,
        current_user.id,
        name=payload.name,
        email=payload.email,
        company=payload.company,
        phone=payload.phone,
        gstin=payload.gstin,
        notes=payload.notes,
    )
    if customer is None:
        raise HTTPException(status_code=400, detail="A name or email is required")
    await db.commit()
    await db.refresh(customer)
    return await get_customer(customer.id, db, current_user)


@router.get("/{customer_id}", response_model=CustomerResponse)
async def get_customer(
    customer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Customer detail with quote aggregates."""
    customer = await _get_owned_customer(db, current_user, customer_id)
    result = await db.execute(
        select(*_AGGREGATES).where(Quote.customer_id == customer.id)
    )
    return _to_response(customer, result.one())


@router.patch("/{customer_id}", response_model=CustomerResponse)
async def update_customer(
    customer_id: uuid.UUID,
    payload: CustomerUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update customer contact fields; historical quote snapshots stay as-is."""
    customer = await _get_owned_customer(db, current_user, customer_id)

    data = payload.model_dump(exclude_unset=True)
    if "email" in data:
        data["email"] = normalize_email(data["email"])
    for field in ("name", "company", "phone", "gstin"):
        if field in data:
            data[field] = normalize_text(data[field])
    if data.get("name") is None and "name" in data:
        raise HTTPException(status_code=400, detail="Name cannot be empty")

    for field, value in data.items():
        setattr(customer, field, value)
    await db.commit()
    await db.refresh(customer)
    return await get_customer(customer.id, db, current_user)


@router.get("/{customer_id}/quotes", response_model=List[QuoteListResponse])
async def list_customer_quotes(
    customer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """All quotes for one customer, newest first."""
    customer = await _get_owned_customer(db, current_user, customer_id)
    result = await db.execute(
        select(Quote)
        .where(Quote.customer_id == customer.id)
        .order_by(Quote.created_at.desc())
    )
    quotes = result.scalars().all()
    return [
        QuoteListResponse(
            id=q.id,
            quote_number=q.quote_number,
            cad_file_id=q.cad_file_id,
            customer_name=q.customer_name,
            total_price=q.total_price,
            status=q.status.value if hasattr(q.status, "value") else str(q.status),
            valid_until=q.valid_until,
            created_at=q.created_at,
            responded_at=q.responded_at,
            customer_response_note=q.customer_response_note,
        )
        for q in quotes
    ]
