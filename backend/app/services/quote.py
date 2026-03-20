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
from app.core.config import settings


def generate_quote_number() -> str:
    """Generate unique quote number with date prefix."""
    date_prefix = datetime.utcnow().strftime("%Y%m%d")
    random_suffix = uuid.uuid4().hex[:6].upper()
    return f"QT-{date_prefix}-{random_suffix}"


async def create_quote(
    db: AsyncSession,
    cad_file_id: uuid.UUID,
    material_id: uuid.UUID,
    surface_finish_id: uuid.UUID,
    inspection_level_id: uuid.UUID,
    quantity: int = 1,
    customer_name: Optional[str] = None,
    customer_email: Optional[str] = None,
    customer_company: Optional[str] = None,
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
    
    # Calculate pricing
    pricing_result = await calculate_pricing(
        db=db,
        geometry=geometry,
        material=material,
        surface_finish=surface_finish,
        inspection_level=inspection_level,
        quantity=quantity,
        pricing_overrides=pricing_overrides,
    )
    
    # Create quote
    valid_until = datetime.utcnow() + timedelta(days=settings.QUOTE_VALIDITY_DAYS)
    
    quote = Quote(
        quote_number=generate_quote_number(),
        customer_name=customer_name,
        customer_email=customer_email,
        customer_company=customer_company,
        cad_file_id=cad_file_id,
        material_id=material_id,
        surface_finish_id=surface_finish_id,
        inspection_level_id=inspection_level_id,
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
        notes=notes,
    )
    
    db.add(quote)
    await db.commit()
    await db.refresh(quote)
    
    return quote


async def get_quote(
    db: AsyncSession,
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
        )
        .where(Quote.id == quote_id)
    )
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def get_quote_by_number(
    db: AsyncSession,
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
        )
        .where(Quote.quote_number == quote_number)
    )
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def list_quotes(
    db: AsyncSession,
    skip: int = 0,
    limit: int = 50,
    status: Optional[QuoteStatus] = None,
) -> List[Quote]:
    """List quotes with optional filtering."""
    query = select(Quote).order_by(desc(Quote.created_at))
    
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
