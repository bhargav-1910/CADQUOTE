"""Quote service for generating and managing quotations."""
import uuid
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional, List, Dict, Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from sqlalchemy.orm import selectinload

from app.models.models import (
    Quote, QuoteStatus, CADFile, GeometryAnalysis,
    Material, SurfaceFinish, InspectionLevel
)
from app.services.pricing import calculate_pricing, PricingResult
from app.services.vendor_matching import match_vendor_for_quote, vendor_match_to_pricing_overrides
from app.core.config import settings


def generate_quote_number() -> str:
    """Generate unique quote number with date prefix."""
    date_prefix = datetime.utcnow().strftime("%Y%m%d")
    random_suffix = uuid.uuid4().hex[:6].upper()
    return f"QT-{date_prefix}-{random_suffix}"


async def create_quote(
    db: AsyncSession,
    user_id: uuid.UUID,
    cad_file_id: uuid.UUID,
    material_id: uuid.UUID,
    surface_finish_id: uuid.UUID,
    inspection_level_id: uuid.UUID,
    quantity: int = 1,
    customer_id: Optional[uuid.UUID] = None,
    customer_name: Optional[str] = None,
    customer_email: Optional[str] = None,
    customer_company: Optional[str] = None,
    rfq_number: Optional[str] = None,
    part_name: Optional[str] = None,
    part_number: Optional[str] = None,
    revision: Optional[str] = None,
    rfq_date: Optional[datetime] = None,
    quote_due_date: Optional[datetime] = None,
    annual_volume: Optional[int] = None,
    batch_size: Optional[int] = None,
    target_price: Optional[Decimal] = None,
    application: Optional[str] = None,
    raw_form: Optional[str] = None,
    raw_size: Optional[str] = None,
    net_weight_kg: Optional[float] = None,
    raw_weight_kg: Optional[float] = None,
    buy_to_fly_ratio: Optional[float] = None,
    requested_surface_finish: Optional[str] = None,
    tolerance_notes: Optional[str] = None,
    hsn_code: Optional[str] = None,
    complexity_level: Optional[str] = None,
    process_routing: Optional[List[Dict[str, Any]]] = None,
    required_certifications: Optional[List[str]] = None,
    price_validity: Optional[str] = None,
    gst: Optional[str] = None,
    delivery: Optional[str] = None,
    payment_terms: Optional[str] = None,
    incoterms: Optional[str] = None,
    tooling_ownership: Optional[str] = None,
    packaging: Optional[str] = None,
    terms_and_conditions: Optional[str] = None,
    dfm_exceptions: Optional[str] = None,
    pricing_overrides: Optional[Dict[str, Any]] = None,
    notes: Optional[str] = None,
) -> Quote:
    """
    Create a formal quotation.
    
    This calculates pricing and generates a quote record.
    """
    # Fetch all required entities
    cad_file = await db.get(CADFile, cad_file_id)
    if not cad_file:
        raise ValueError("CAD file not found")
    if cad_file.user_id != user_id:
        raise ValueError("CAD file not found")
    
    geometry_query = select(GeometryAnalysis).where(
        GeometryAnalysis.cad_file_id == cad_file_id
    )
    geometry_result = await db.execute(geometry_query)
    geometry = geometry_result.scalar_one_or_none()
    if not geometry:
        raise ValueError("Geometry analysis not found. Process the file first.")
    
    material = await db.get(Material, material_id)
    if not material:
        raise ValueError("Material not found")
    
    surface_finish = await db.get(SurfaceFinish, surface_finish_id)
    if not surface_finish:
        raise ValueError("Surface finish not found")
    
    inspection_level = await db.get(InspectionLevel, inspection_level_id)
    if not inspection_level:
        raise ValueError("Inspection level not found")
    
    vendor_match = await match_vendor_for_quote(
        db=db,
        geometry=geometry,
        material=material,
        pricing_overrides=pricing_overrides,
        required_certifications=required_certifications,
    )

    # Explicit user overrides win over vendor-derived values, matching the
    # instant-pricing preview behaviour.
    effective_overrides = dict(pricing_overrides or {})
    for key, value in vendor_match_to_pricing_overrides(vendor_match).items():
        effective_overrides.setdefault(key, value)

    # Calculate pricing
    pricing_result = await calculate_pricing(
        db=db,
        geometry=geometry,
        material=material,
        surface_finish=surface_finish,
        inspection_level=inspection_level,
        quantity=quantity,
        pricing_overrides=effective_overrides,
    )
    
    # Create quote
    valid_until = datetime.utcnow() + timedelta(days=settings.QUOTE_VALIDITY_DAYS)
    
    quote = Quote(
        quote_number=generate_quote_number(),
        user_id=user_id,
        customer_name=customer_name,
        customer_email=customer_email,
        customer_company=customer_company,
        rfq_number=rfq_number,
        part_name=part_name,
        part_number=part_number,
        revision=revision,
        rfq_date=rfq_date,
        quote_due_date=quote_due_date,
        annual_volume=annual_volume,
        batch_size=batch_size,
        target_price=target_price,
        application=application,
        raw_form=raw_form,
        raw_size=raw_size,
        net_weight_kg=net_weight_kg,
        raw_weight_kg=raw_weight_kg,
        buy_to_fly_ratio=buy_to_fly_ratio,
        requested_surface_finish=requested_surface_finish,
        tolerance_notes=tolerance_notes,
        hsn_code=hsn_code,
        complexity_level=complexity_level,
        process_routing=process_routing,
        cad_file_id=cad_file_id,
        material_id=material_id,
        surface_finish_id=surface_finish_id,
        inspection_level_id=inspection_level_id,
        matched_vendor_id=(vendor_match.vendor.id if vendor_match.vendor else None),
        vendor_match_details=vendor_match.details,
        quantity=quantity,
        material_cost=pricing_result.material_cost,
        machining_cost=pricing_result.machining_cost,
        finish_cost=pricing_result.finish_cost,
        inspection_cost=pricing_result.inspection_cost,
        subtotal=pricing_result.subtotal,
        margin_factor=pricing_result.details["margin"]["margin_factor"],
        total_price=pricing_result.total_price,
        unit_price=pricing_result.unit_price,
        estimated_lead_time_days=pricing_result.estimated_lead_time_days,
        status=QuoteStatus.GENERATED,
        valid_until=valid_until,
        price_validity=price_validity,
        gst=gst,
        delivery=delivery,
        payment_terms=payment_terms,
        incoterms=incoterms,
        tooling_ownership=tooling_ownership,
        packaging=packaging,
        terms_and_conditions=terms_and_conditions,
        dfm_exceptions=dfm_exceptions,
        notes=notes,
    )
    
    # Link the CRM customer record (find-or-create from the free-text
    # fields; an explicit customer_id wins after an ownership check).
    from app.services.customers import link_quote_customer

    await link_quote_customer(db, quote, customer_id=customer_id)

    db.add(quote)
    await db.commit()
    await db.refresh(quote)

    return quote


async def get_quote(
    db: AsyncSession,
    user_id: uuid.UUID,
    quote_id: uuid.UUID,
) -> Optional[Quote]:
    """Get quote by ID with all relationships loaded."""
    query = (
        select(Quote)
        .options(
            selectinload(Quote.cad_file),
            selectinload(Quote.material),
            selectinload(Quote.surface_finish),
            selectinload(Quote.inspection_level),
            selectinload(Quote.matched_vendor),
        )
        .where(Quote.id == quote_id, Quote.user_id == user_id)
    )
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def get_quote_by_number(
    db: AsyncSession,
    user_id: uuid.UUID,
    quote_number: str,
) -> Optional[Quote]:
    """Get quote by quote number with all relationships loaded."""
    query = (
        select(Quote)
        .options(
            selectinload(Quote.cad_file),
            selectinload(Quote.material),
            selectinload(Quote.surface_finish),
            selectinload(Quote.inspection_level),
            selectinload(Quote.matched_vendor),
        )
        .where(Quote.quote_number == quote_number, Quote.user_id == user_id)
    )
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def list_quotes(
    db: AsyncSession,
    user_id: uuid.UUID,
    skip: int = 0,
    limit: int = 50,
    status: Optional[QuoteStatus] = None,
) -> List[Quote]:
    """List quotes with optional filtering."""
    query = select(Quote).where(Quote.user_id == user_id).order_by(desc(Quote.created_at))
    
    if status:
        query = query.where(Quote.status == status)
    
    query = query.offset(skip).limit(limit)
    
    result = await db.execute(query)
    return list(result.scalars().all())


async def update_quote_pdf_path(
    db: AsyncSession,
    quote_id: uuid.UUID,
    pdf_path: str,
) -> None:
    """Update quote with PDF path."""
    quote = await db.get(Quote, quote_id)
    if quote:
        quote.pdf_path = pdf_path
        await db.commit()


async def update_quote_status(
    db: AsyncSession,
    quote_id: uuid.UUID,
    status: QuoteStatus,
) -> None:
    """Update quote status."""
    quote = await db.get(Quote, quote_id)
    if quote:
        quote.status = status
        await db.commit()
