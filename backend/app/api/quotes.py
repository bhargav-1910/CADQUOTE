"""Pricing and quote endpoints."""
import uuid
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.models import (
    CADFile, GeometryAnalysis, Material, SurfaceFinish, 
    InspectionLevel, Quote, ProcessingStatus
)
from app.schemas.schemas import (
    PricingRequest, PricingResponse, PriceBreakdown, BoundingBox,
    QuoteCreateRequest, BatchQuoteCreateRequest, BatchQuoteResponse,
    QuoteResponse, QuoteListResponse,
    MaterialResponse, SurfaceFinishResponse, InspectionLevelResponse,
    CADFileResponse, BulkPricingRequest, BulkReportEmailRequest, BulkReportEmailResponse,
    BulkReportPDFRequest,
)
from app.services.pricing import calculate_pricing
from app.services.quote import create_quote, get_quote, get_quote_by_number, list_quotes
from app.services.document import generate_quote_document, generate_bulk_report_pdf
from app.services.email import send_bulk_report_email

router = APIRouter(tags=["Pricing & Quotes"])


def _serialize_pricing_overrides(overrides: Any) -> Optional[Dict[str, Any]]:
    """Convert optional override model to a compact dictionary payload."""
    if overrides is None:
        return None
    payload = overrides.model_dump(exclude_none=True)
    return payload or None


@router.post("/pricing", response_model=PricingResponse)
async def get_instant_pricing(
    request: PricingRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Get instant pricing for a CNC job.
    
    Returns detailed price breakdown with transparent calculations.
    """
    # Fetch all required entities
    cad_file = await db.get(CADFile, request.cad_file_id)
    if not cad_file:
        raise HTTPException(status_code=404, detail="CAD file not found")
    
    if cad_file.processing_status != ProcessingStatus.COMPLETED:
        raise HTTPException(
            status_code=400,
            detail="CAD file has not been processed yet"
        )
    
    # Get geometry
    geometry_query = select(GeometryAnalysis).where(
        GeometryAnalysis.cad_file_id == request.cad_file_id
    )
    geometry_result = await db.execute(geometry_query)
    geometry = geometry_result.scalar_one_or_none()
    if not geometry:
        raise HTTPException(status_code=404, detail="Geometry analysis not found")
    
    # Get configuration options
    material = await db.get(Material, request.material_id)
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    
    surface_finish = await db.get(SurfaceFinish, request.surface_finish_id)
    if not surface_finish:
        raise HTTPException(status_code=404, detail="Surface finish not found")
    
    inspection_level = await db.get(InspectionLevel, request.inspection_level_id)
    if not inspection_level:
        raise HTTPException(status_code=404, detail="Inspection level not found")
    
    # Calculate pricing
    pricing_result = await calculate_pricing(
        db=db,
        geometry=geometry,
        material=material,
        surface_finish=surface_finish,
        inspection_level=inspection_level,
        quantity=request.quantity,
        pricing_overrides=_serialize_pricing_overrides(request.pricing_overrides),
    )
    
    # Calculate weight
    weight_kg = (geometry.volume * material.density) / 1000
    
    return PricingResponse(
        cad_file_id=cad_file.id,
        file_name=cad_file.original_filename,
        quantity=request.quantity,
        material=MaterialResponse.model_validate(material),
        surface_finish=SurfaceFinishResponse.model_validate(surface_finish),
        inspection_level=InspectionLevelResponse.model_validate(inspection_level),
        volume_cm3=geometry.volume,
        weight_kg=round(weight_kg, 4),
        bounding_box=BoundingBox(
            x=geometry.bbox_x,
            y=geometry.bbox_y,
            z=geometry.bbox_z,
            volume=geometry.bounding_box_volume,
        ),
        complexity_score=geometry.complexity_score,
        price_breakdown=PriceBreakdown(
            material_cost=pricing_result.material_cost,
            machining_cost=pricing_result.machining_cost,
            finish_cost=pricing_result.finish_cost,
            inspection_cost=pricing_result.inspection_cost,
            subtotal=pricing_result.subtotal,
            margin_factor=pricing_result.details["margin"]["margin_factor"],
            total_price=pricing_result.total_price,
            unit_price=pricing_result.unit_price,
        ),
        estimated_lead_time_days=pricing_result.estimated_lead_time_days,
        pricing_explanation=pricing_result.details,
    )


@router.post("/pricing/bulk", response_model=List[PricingResponse])
async def get_bulk_pricing(
    request_data: dict,
    db: AsyncSession = Depends(get_db),
):
    """
    Get pricing for multiple CNC jobs at once.
    
    Efficiently process multiple pricing requests in parallel.
    Returns detailed price breakdown for each file.
    """
    from app.schemas.schemas import BulkPricingRequest
    
    # Parse the request
    try:
        bulk_request = BulkPricingRequest(**request_data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid request format: {str(e)}")
    
    responses: List[PricingResponse] = []
    
    for pricing_request in bulk_request.requests:
        try:
            # Fetch all required entities
            cad_file = await db.get(CADFile, pricing_request.cad_file_id)
            if not cad_file:
                raise HTTPException(status_code=404, detail=f"CAD file {pricing_request.cad_file_id} not found")
            
            if cad_file.processing_status != ProcessingStatus.COMPLETED:
                raise HTTPException(
                    status_code=400,
                    detail=f"CAD file {cad_file.original_filename} has not been processed yet"
                )
            
            # Get geometry
            geometry_query = select(GeometryAnalysis).where(
                GeometryAnalysis.cad_file_id == pricing_request.cad_file_id
            )
            geometry_result = await db.execute(geometry_query)
            geometry = geometry_result.scalar_one_or_none()
            if not geometry:
                raise HTTPException(status_code=404, detail=f"Geometry analysis not found for {pricing_request.cad_file_id}")
            
            # Get configuration options
            material = await db.get(Material, pricing_request.material_id)
            if not material:
                raise HTTPException(status_code=404, detail=f"Material {pricing_request.material_id} not found")
            
            surface_finish = await db.get(SurfaceFinish, pricing_request.surface_finish_id)
            if not surface_finish:
                raise HTTPException(status_code=404, detail=f"Surface finish {pricing_request.surface_finish_id} not found")
            
            inspection_level = await db.get(InspectionLevel, pricing_request.inspection_level_id)
            if not inspection_level:
                raise HTTPException(status_code=404, detail=f"Inspection level {pricing_request.inspection_level_id} not found")
            
            # Calculate pricing
            pricing_result = await calculate_pricing(
                db=db,
                geometry=geometry,
                material=material,
                surface_finish=surface_finish,
                inspection_level=inspection_level,
                quantity=pricing_request.quantity,
                pricing_overrides=_serialize_pricing_overrides(pricing_request.pricing_overrides),
            )
            
            # Calculate weight
            weight_kg = (geometry.volume * material.density) / 1000
            
            responses.append(
                PricingResponse(
                    cad_file_id=cad_file.id,
                    file_name=cad_file.original_filename,
                    quantity=pricing_request.quantity,
                    material=MaterialResponse.model_validate(material),
                    surface_finish=SurfaceFinishResponse.model_validate(surface_finish),
                    inspection_level=InspectionLevelResponse.model_validate(inspection_level),
                    volume_cm3=geometry.volume,
                    weight_kg=round(weight_kg, 4),
                    bounding_box=BoundingBox(
                        x=geometry.bbox_x,
                        y=geometry.bbox_y,
                        z=geometry.bbox_z,
                        volume=geometry.bounding_box_volume,
                    ),
                    complexity_score=geometry.complexity_score,
                    price_breakdown=PriceBreakdown(
                        material_cost=pricing_result.material_cost,
                        machining_cost=pricing_result.machining_cost,
                        finish_cost=pricing_result.finish_cost,
                        inspection_cost=pricing_result.inspection_cost,
                        subtotal=pricing_result.subtotal,
                        margin_factor=pricing_result.details["margin"]["margin_factor"],
                        total_price=pricing_result.total_price,
                        unit_price=pricing_result.unit_price,
                    ),
                    estimated_lead_time_days=pricing_result.estimated_lead_time_days,
                    pricing_explanation=pricing_result.details,
                )
            )
        except HTTPException:
            # Re-raise HTTP exceptions
            raise
        except Exception as e:
            # Log and continue with next request
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Error processing pricing for file {pricing_request.cad_file_id}: {str(e)}")
            raise HTTPException(status_code=400, detail=f"Error processing pricing: {str(e)}")
    
    return responses

@router.post("/quotes/batch", response_model=BatchQuoteResponse, status_code=201)
async def create_batch_quotation(
    request: BatchQuoteCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Create multiple quotes at once with shared configuration.

    All files use the same material, finish, inspection and quantity settings.
    """
    from decimal import Decimal as D
    created = []
    for cad_file_id in request.cad_file_ids:
        try:
            quote = await create_quote(
                db=db,
                cad_file_id=cad_file_id,
                material_id=request.material_id,
                surface_finish_id=request.surface_finish_id,
                inspection_level_id=request.inspection_level_id,
                quantity=request.quantity,
                customer_name=request.customer_name,
                customer_email=request.customer_email,
                customer_company=request.customer_company,
                pricing_overrides=_serialize_pricing_overrides(request.pricing_overrides),
                notes=request.notes,
            )
            quote = await get_quote(db, quote.id)
            created.append(_quote_to_response(quote))
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    total = sum(D(str(q.total_price)) for q in created)
    return BatchQuoteResponse(quotes=created, total_price=total, quote_count=len(created))

@router.post("/quotes", response_model=QuoteResponse, status_code=201)
async def create_quotation(
    request: QuoteCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Create a formal quotation.
    
    This generates a quote with a unique ID and creates a PDF document.
    """
    try:
        quote = await create_quote(
            db=db,
            cad_file_id=request.cad_file_id,
            material_id=request.material_id,
            surface_finish_id=request.surface_finish_id,
            inspection_level_id=request.inspection_level_id,
            quantity=request.quantity,
            customer_name=request.customer_name,
            customer_email=request.customer_email,
            customer_company=request.customer_company,
            pricing_overrides=_serialize_pricing_overrides(request.pricing_overrides),
            notes=request.notes,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    # Reload with relationships
    quote = await get_quote(db, quote.id)
    
    return _quote_to_response(quote)


@router.get("/quotes", response_model=List[QuoteListResponse])
async def list_quotations(
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    """List all quotations."""
    quotes = await list_quotes(db, skip=skip, limit=limit)
    return [
        QuoteListResponse(
            id=q.id,
            quote_number=q.quote_number,
            customer_name=q.customer_name,
            total_price=q.total_price,
            status=q.status.value,
            valid_until=q.valid_until,
            created_at=q.created_at,
        )
        for q in quotes
    ]


@router.get("/quotes/{quote_id}", response_model=QuoteResponse)
async def get_quotation(
    quote_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get quotation by ID."""
    quote = await get_quote(db, quote_id)
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")
    
    return _quote_to_response(quote)


@router.get("/quotes/number/{quote_number}", response_model=QuoteResponse)
async def get_quotation_by_number(
    quote_number: str,
    db: AsyncSession = Depends(get_db),
):
    """Get quotation by quote number."""
    quote = await get_quote_by_number(db, quote_number)
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")
    
    return _quote_to_response(quote)


@router.post("/quotes/{quote_id}/pdf")
async def generate_quote_pdf(
    quote_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Generate PDF document for a quote."""
    quote = await get_quote(db, quote_id)
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")
    
    try:
        pdf_path = await generate_quote_document(db, quote)
        return {"pdf_path": pdf_path, "message": "PDF generated successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"PDF generation failed: {str(e)}"
        )


@router.post("/reports/bulk/email", response_model=BulkReportEmailResponse)
async def email_bulk_report(request: BulkReportEmailRequest):
    """Email a pre-computed bulk pricing report summary to a recipient."""
    try:
        await send_bulk_report_email(request)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send report email: {str(e)}")

    return BulkReportEmailResponse(message="Bulk report email sent successfully")


@router.post("/reports/bulk/pdf")
async def download_bulk_report_pdf(request: BulkReportPDFRequest):
    """Generate and download bulk quote report PDF."""
    try:
        pdf_path = generate_bulk_report_pdf(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate bulk PDF report: {str(e)}")

    return FileResponse(
        path=pdf_path,
        filename="bulk-quote-report.pdf",
        media_type="application/pdf",
    )


@router.get("/quotes/{quote_id}/pdf/download")
async def download_quote_pdf(
    quote_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Download the PDF document for a quote."""
    quote = await get_quote(db, quote_id)
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")
    
    if not quote.pdf_path:
        # Generate PDF if not exists
        try:
            pdf_path = await generate_quote_document(db, quote)
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"PDF generation failed: {str(e)}"
            )
    else:
        pdf_path = quote.pdf_path
    
    return FileResponse(
        path=pdf_path,
        filename=f"{quote.quote_number}.pdf",
        media_type="application/pdf",
    )


def _quote_to_response(quote: Quote) -> QuoteResponse:
    """Convert Quote model to response schema."""
    return QuoteResponse(
        id=quote.id,
        quote_number=quote.quote_number,
        customer_name=quote.customer_name,
        customer_email=quote.customer_email,
        customer_company=quote.customer_company,
        cad_file=CADFileResponse(
            id=quote.cad_file.id,
            original_filename=quote.cad_file.original_filename,
            file_format=quote.cad_file.file_format,
            file_size=quote.cad_file.file_size,
            file_hash=quote.cad_file.file_hash,
            processing_status=quote.cad_file.processing_status.value,
            processing_error=quote.cad_file.processing_error,
            created_at=quote.cad_file.created_at,
            processed_at=quote.cad_file.processed_at,
        ),
        material=MaterialResponse.model_validate(quote.material),
        surface_finish=SurfaceFinishResponse.model_validate(quote.surface_finish),
        inspection_level=InspectionLevelResponse.model_validate(quote.inspection_level),
        quantity=quote.quantity,
        material_cost=quote.material_cost,
        machining_cost=quote.machining_cost,
        finish_cost=quote.finish_cost,
        inspection_cost=quote.inspection_cost,
        subtotal=quote.subtotal,
        margin_factor=quote.margin_factor,
        total_price=quote.total_price,
        unit_price=quote.unit_price,
        estimated_lead_time_days=quote.estimated_lead_time_days,
        status=quote.status.value,
        valid_until=quote.valid_until,
        pdf_path=quote.pdf_path,
        notes=quote.notes,
        created_at=quote.created_at,
        updated_at=quote.updated_at,
    )
