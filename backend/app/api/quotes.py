"""Pricing and quote endpoints."""
import uuid
from typing import List, Optional, Dict, Any
from decimal import Decimal
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.models import (
    CADFile, GeometryAnalysis, Material, SurfaceFinish, 
    InspectionLevel, Quote, ProcessingStatus, QuoteStatus, User
)
from app.schemas.schemas import (
    PricingRequest, PricingResponse, BatchPricingRequest, BatchPricingResponse,
    PriceBreakdown, BoundingBox,
    QuoteCreateRequest, BatchQuoteCreateRequest, BatchQuoteResponse, CombinedQuoteCreateRequest,
    QuoteResponse, QuoteListResponse, VendorMatchSummary,
    VendorMatchPreviewRequest, VendorMatchPreviewResponse,
    QuoteEmailRequest, QuoteEmailResponse,
    MaterialResponse, SurfaceFinishResponse, InspectionLevelResponse,
    CADFileResponse,
)
from app.services.pricing import calculate_pricing
from app.services.vendor_matching import match_vendor_for_quote
from app.services.quote import (
    create_quote,
    get_quote,
    get_quote_by_number,
    list_quotes,
    generate_quote_number,
    update_quote_status,
)
from app.services.document import generate_quote_document
from app.services.email import send_quote_email
from app.core.config import settings
from app.services.billing import consume_points, InsufficientPointsError

router = APIRouter(tags=["Pricing & Quotes"], dependencies=[Depends(get_current_user)])


@router.post("/quotes/match-vendors", response_model=VendorMatchPreviewResponse)
async def preview_vendor_match(
    request: VendorMatchPreviewRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cad_file = await db.get(CADFile, request.cad_file_id)
    if not cad_file or cad_file.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="CAD file not found")
    if cad_file.processing_status != ProcessingStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="CAD file has not been processed yet")

    geometry_query = select(GeometryAnalysis).where(GeometryAnalysis.cad_file_id == request.cad_file_id)
    geometry_result = await db.execute(geometry_query)
    geometry = geometry_result.scalar_one_or_none()
    if not geometry:
        raise HTTPException(status_code=404, detail="Geometry analysis not found")

    material = await db.get(Material, request.material_id)
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    pricing_overrides: Dict[str, Any] = {}
    if request.machine_name:
        pricing_overrides["machine_name"] = request.machine_name

    match_result = await match_vendor_for_quote(
        db=db,
        geometry=geometry,
        material=material,
        pricing_overrides=pricing_overrides,
        required_certifications=request.required_certifications,
    )

    selected_vendor = None
    if match_result.vendor:
        selected_vendor = VendorMatchSummary(
            vendor_id=match_result.vendor.id,
            vendor_name=match_result.vendor.name,
            score=match_result.score,
            details=match_result.details,
        )

    return VendorMatchPreviewResponse(
        matched=match_result.vendor is not None,
        selected_vendor=selected_vendor,
        details=match_result.details,
    )


async def _auto_send_quote_email_if_requested(
    *,
    db: AsyncSession,
    quote: Quote,
    current_user: User,
    auto_send_email: bool,
) -> None:
    if not auto_send_email:
        return

    recipient_email = (quote.customer_email or "").strip()
    if not recipient_email:
        return

    if not quote.pdf_path:
        pdf_path = await generate_quote_document(db, quote, issuer=current_user)
    else:
        pdf_path = quote.pdf_path

    try:
        await consume_points(
            db,
            user_id=current_user.id,
            points=settings.POINTS_COST_SEND_QUOTE_EMAIL,
            action="send_quote_email",
            description=f"Sent quote {quote.quote_number} to customer",
            reference_type="quote",
            reference_id=str(quote.id),
        )
    except InsufficientPointsError:
        raise HTTPException(status_code=402, detail="Insufficient points to send quote email")

    await send_quote_email(
        quote=quote,
        sender=current_user,
        recipient_email=recipient_email,
        pdf_path=pdf_path,
    )
    await update_quote_status(db, quote.id, QuoteStatus.SENT)


def _serialize_pricing_overrides(overrides: Any) -> Optional[Dict[str, Any]]:
    """Convert optional override model to a compact dictionary payload."""
    if overrides is None:
        return None
    payload = overrides.model_dump(exclude_none=True)
    return payload or None


def _pricing_result_to_response(
    *,
    cad_file: CADFile,
    geometry: GeometryAnalysis,
    material: Material,
    surface_finish: SurfaceFinish,
    inspection_level: InspectionLevel,
    quantity: int,
    pricing_result: Any,
) -> PricingResponse:
    """Convert internal pricing result to API schema."""
    weight_kg = (geometry.volume * material.density) / 1000
    return PricingResponse(
        cad_file_id=cad_file.id,
        file_name=cad_file.original_filename,
        quantity=quantity,
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
        dfm_analysis=(pricing_result.details.get("dfm") or {}).get("analysis"),
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


@router.post("/pricing", response_model=PricingResponse)
async def get_instant_pricing(
    request: PricingRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get instant pricing for a CNC job.
    
    Returns detailed price breakdown with transparent calculations.
    """
    # Fetch all required entities
    cad_file = await db.get(CADFile, request.cad_file_id)
    if not cad_file:
        raise HTTPException(status_code=404, detail="CAD file not found")
    if cad_file.user_id != current_user.id:
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
    
    return _pricing_result_to_response(
        cad_file=cad_file,
        geometry=geometry,
        material=material,
        surface_finish=surface_finish,
        inspection_level=inspection_level,
        quantity=request.quantity,
        pricing_result=pricing_result,
    )


@router.post("/pricing/batch", response_model=BatchPricingResponse)
async def get_batch_pricing(
    request: BatchPricingRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get pricing for multiple CAD files with shared configuration in one request."""
    material = await db.get(Material, request.material_id)
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    surface_finish = await db.get(SurfaceFinish, request.surface_finish_id)
    if not surface_finish:
        raise HTTPException(status_code=404, detail="Surface finish not found")

    inspection_level = await db.get(InspectionLevel, request.inspection_level_id)
    if not inspection_level:
        raise HTTPException(status_code=404, detail="Inspection level not found")

    file_query = select(CADFile).where(CADFile.id.in_(request.cad_file_ids), CADFile.user_id == current_user.id)
    file_result = await db.execute(file_query)
    cad_files = list(file_result.scalars().all())
    cad_file_map = {file.id: file for file in cad_files}

    missing_files = [file_id for file_id in request.cad_file_ids if file_id not in cad_file_map]
    if missing_files:
        raise HTTPException(status_code=404, detail="One or more CAD files not found")

    unprocessed_files = [
        str(file.id)
        for file in cad_files
        if file.processing_status != ProcessingStatus.COMPLETED
    ]
    if unprocessed_files:
        raise HTTPException(
            status_code=400,
            detail="One or more CAD files have not been processed yet",
        )

    geometry_query = select(GeometryAnalysis).where(
        GeometryAnalysis.cad_file_id.in_(request.cad_file_ids)
    )
    geometry_result = await db.execute(geometry_query)
    geometries = list(geometry_result.scalars().all())
    geometry_map = {geometry.cad_file_id: geometry for geometry in geometries}

    missing_geometry = [file_id for file_id in request.cad_file_ids if file_id not in geometry_map]
    if missing_geometry:
        raise HTTPException(status_code=404, detail="Geometry analysis not found for one or more files")

    serialized_overrides = _serialize_pricing_overrides(request.pricing_overrides)
    responses: List[PricingResponse] = []

    for cad_file_id in request.cad_file_ids:
        cad_file = cad_file_map[cad_file_id]
        geometry = geometry_map[cad_file_id]
        pricing_result = await calculate_pricing(
            db=db,
            geometry=geometry,
            material=material,
            surface_finish=surface_finish,
            inspection_level=inspection_level,
            quantity=request.quantity,
            pricing_overrides=serialized_overrides,
        )
        responses.append(
            _pricing_result_to_response(
                cad_file=cad_file,
                geometry=geometry,
                material=material,
                surface_finish=surface_finish,
                inspection_level=inspection_level,
                quantity=request.quantity,
                pricing_result=pricing_result,
            )
        )

    return BatchPricingResponse(results=responses, priced_count=len(responses))


@router.post("/quotes/batch", response_model=BatchQuoteResponse, status_code=201)
async def create_batch_quotation(
    request: BatchQuoteCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create multiple quotes at once with shared configuration.

    All files use the same material, finish, inspection and quantity settings.
    """
    from decimal import Decimal as D
    created = []
    for cad_file_id in request.cad_file_ids:
        try:
            try:
                await consume_points(
                    db,
                    user_id=current_user.id,
                    points=settings.POINTS_COST_CREATE_QUOTE,
                    action="create_quote",
                    description="Created quote from batch quote flow",
                    reference_type="cad_file",
                    reference_id=str(cad_file_id),
                )
            except InsufficientPointsError:
                raise HTTPException(status_code=402, detail="Insufficient points to create quote")

            quote = await create_quote(
                db=db,
                user_id=current_user.id,
                cad_file_id=cad_file_id,
                material_id=request.material_id,
                surface_finish_id=request.surface_finish_id,
                inspection_level_id=request.inspection_level_id,
                quantity=request.quantity,
                customer_name=request.customer_name,
                customer_email=request.customer_email,
                customer_company=request.customer_company,
                rfq_number=request.rfq_number,
                part_name=request.part_name,
                part_number=request.part_number,
                revision=request.revision,
                rfq_date=request.rfq_date,
                quote_due_date=request.quote_due_date,
                annual_volume=request.annual_volume,
                batch_size=request.batch_size,
                target_price=request.target_price,
                application=request.application,
                raw_form=request.raw_form,
                raw_size=request.raw_size,
                net_weight_kg=request.net_weight_kg,
                raw_weight_kg=request.raw_weight_kg,
                buy_to_fly_ratio=request.buy_to_fly_ratio,
                requested_surface_finish=request.requested_surface_finish,
                tolerance_notes=request.tolerance_notes,
                complexity_level=request.complexity_level,
                process_routing=(
                    [item.model_dump() for item in request.process_routing]
                    if request.process_routing
                    else None
                ),
                required_certifications=request.required_certifications,
                price_validity=request.price_validity,
                gst=request.gst,
                delivery=request.delivery,
                payment_terms=request.payment_terms,
                incoterms=request.incoterms,
                tooling_ownership=request.tooling_ownership,
                packaging=request.packaging,
                terms_and_conditions=request.terms_and_conditions,
                dfm_exceptions=request.dfm_exceptions,
                pricing_overrides=_serialize_pricing_overrides(request.pricing_overrides),
                notes=request.notes,
            )
            quote = await get_quote(db, current_user.id, quote.id)
            await _auto_send_quote_email_if_requested(
                db=db,
                quote=quote,
                current_user=current_user,
                auto_send_email=request.auto_send_email,
            )
            quote = await get_quote(db, current_user.id, quote.id)
            created.append(_quote_to_response(quote))
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Quote email delivery failed: {str(e)}")

    total = sum(D(str(q.total_price)) for q in created)
    return BatchQuoteResponse(quotes=created, total_price=total, quote_count=len(created))


@router.post("/quotes/combined", response_model=QuoteResponse, status_code=201)
async def create_combined_quotation(
    request: CombinedQuoteCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a single quotation that aggregates multiple CAD files into one record."""
    material_cache: Dict[uuid.UUID, Material] = {}
    finish_cache: Dict[uuid.UUID, SurfaceFinish] = {}
    inspection_cache: Dict[uuid.UUID, InspectionLevel] = {}

    total_material_cost = Decimal("0")
    total_machining_cost = Decimal("0")
    total_finish_cost = Decimal("0")
    total_inspection_cost = Decimal("0")
    total_subtotal = Decimal("0")
    total_price = Decimal("0")
    max_lead_time = 0.0

    first_item = request.items[0]
    combined_lines: List[str] = []
    serialized_overrides = _serialize_pricing_overrides(request.pricing_overrides)

    combined_quote_points = settings.POINTS_COST_CREATE_QUOTE * len(request.items)
    try:
        await consume_points(
            db,
            user_id=current_user.id,
            points=combined_quote_points,
            action="create_combined_quote",
            description=f"Created combined quote with {len(request.items)} line items",
            reference_type="combined_quote",
        )
    except InsufficientPointsError:
        raise HTTPException(status_code=402, detail="Insufficient points to create combined quote")

    for item in request.items:
        cad_file = await db.get(CADFile, item.cad_file_id)
        if not cad_file:
            raise HTTPException(status_code=404, detail="CAD file not found")
        if cad_file.user_id != current_user.id:
            raise HTTPException(status_code=404, detail="CAD file not found")

        if cad_file.processing_status != ProcessingStatus.COMPLETED:
            raise HTTPException(status_code=400, detail="One or more CAD files have not been processed yet")

        geometry_query = select(GeometryAnalysis).where(
            GeometryAnalysis.cad_file_id == item.cad_file_id
        )
        geometry_result = await db.execute(geometry_query)
        geometry = geometry_result.scalar_one_or_none()
        if not geometry:
            raise HTTPException(status_code=404, detail="Geometry analysis not found")

        material = material_cache.get(item.material_id)
        if material is None:
            material = await db.get(Material, item.material_id)
            if not material:
                raise HTTPException(status_code=404, detail="Material not found")
            material_cache[item.material_id] = material

        surface_finish = finish_cache.get(item.surface_finish_id)
        if surface_finish is None:
            surface_finish = await db.get(SurfaceFinish, item.surface_finish_id)
            if not surface_finish:
                raise HTTPException(status_code=404, detail="Surface finish not found")
            finish_cache[item.surface_finish_id] = surface_finish

        inspection_level = inspection_cache.get(item.inspection_level_id)
        if inspection_level is None:
            inspection_level = await db.get(InspectionLevel, item.inspection_level_id)
            if not inspection_level:
                raise HTTPException(status_code=404, detail="Inspection level not found")
            inspection_cache[item.inspection_level_id] = inspection_level

        pricing_result = await calculate_pricing(
            db=db,
            geometry=geometry,
            material=material,
            surface_finish=surface_finish,
            inspection_level=inspection_level,
            quantity=item.quantity,
            pricing_overrides=serialized_overrides,
        )

        total_material_cost += Decimal(str(pricing_result.material_cost))
        total_machining_cost += Decimal(str(pricing_result.machining_cost))
        total_finish_cost += Decimal(str(pricing_result.finish_cost))
        total_inspection_cost += Decimal(str(pricing_result.inspection_cost))
        total_subtotal += Decimal(str(pricing_result.subtotal))
        total_price += Decimal(str(pricing_result.total_price))
        max_lead_time = max(max_lead_time, float(pricing_result.estimated_lead_time_days))

        safe_filename = cad_file.original_filename.replace("|", "/")
        combined_lines.append(f"{safe_filename}|{item.quantity}|{Decimal(str(pricing_result.total_price)):.2f}")

    margin_factor = float(total_price / total_subtotal) if total_subtotal > 0 else 1.0
    combined_notes = "[COMBINED_FILES]\n" + "\n".join(combined_lines) + "\n[/COMBINED_FILES]"
    final_notes = f"{combined_notes}\n\n{request.notes}" if request.notes else combined_notes

    quote = Quote(
        quote_number=generate_quote_number(),
        user_id=current_user.id,
        customer_name=request.customer_name,
        customer_email=request.customer_email,
        customer_company=request.customer_company,
        cad_file_id=first_item.cad_file_id,
        material_id=first_item.material_id,
        surface_finish_id=first_item.surface_finish_id,
        inspection_level_id=first_item.inspection_level_id,
        quantity=1,
        material_cost=total_material_cost,
        machining_cost=total_machining_cost,
        finish_cost=total_finish_cost,
        inspection_cost=total_inspection_cost,
        subtotal=total_subtotal,
        margin_factor=margin_factor,
        total_price=total_price,
        unit_price=total_price,
        estimated_lead_time_days=max_lead_time,
        status=QuoteStatus.GENERATED,
        valid_until=datetime.utcnow() + timedelta(days=settings.QUOTE_VALIDITY_DAYS),
        notes=final_notes,
    )

    db.add(quote)
    await db.commit()
    await db.refresh(quote)
    quote = await get_quote(db, current_user.id, quote.id)

    try:
        await _auto_send_quote_email_if_requested(
            db=db,
            quote=quote,
            current_user=current_user,
            auto_send_email=request.auto_send_email,
        )
        quote = await get_quote(db, current_user.id, quote.id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Quote email delivery failed: {str(e)}")

    return _quote_to_response(quote)

@router.post("/quotes", response_model=QuoteResponse, status_code=201)
async def create_quotation(
    request: QuoteCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create a formal quotation.
    
    This generates a quote with a unique ID and creates a PDF document.
    """
    try:
        await consume_points(
            db,
            user_id=current_user.id,
            points=settings.POINTS_COST_CREATE_QUOTE,
            action="create_quote",
            description="Created quote",
            reference_type="cad_file",
            reference_id=str(request.cad_file_id),
        )
    except InsufficientPointsError:
        raise HTTPException(status_code=402, detail="Insufficient points to create quote")

    try:
        quote = await create_quote(
            db=db,
            user_id=current_user.id,
            cad_file_id=request.cad_file_id,
            material_id=request.material_id,
            surface_finish_id=request.surface_finish_id,
            inspection_level_id=request.inspection_level_id,
            quantity=request.quantity,
            customer_name=request.customer_name or current_user.full_name,
            customer_email=request.customer_email,
            customer_company=request.customer_company or current_user.company_name,
            rfq_number=request.rfq_number,
            part_name=request.part_name,
            part_number=request.part_number,
            revision=request.revision,
            rfq_date=request.rfq_date,
            quote_due_date=request.quote_due_date,
            annual_volume=request.annual_volume,
            batch_size=request.batch_size,
            target_price=request.target_price,
            application=request.application,
            raw_form=request.raw_form,
            raw_size=request.raw_size,
            net_weight_kg=request.net_weight_kg,
            raw_weight_kg=request.raw_weight_kg,
            buy_to_fly_ratio=request.buy_to_fly_ratio,
            requested_surface_finish=request.requested_surface_finish,
            tolerance_notes=request.tolerance_notes,
            complexity_level=request.complexity_level,
            process_routing=(
                [item.model_dump() for item in request.process_routing]
                if request.process_routing
                else None
            ),
            required_certifications=request.required_certifications,
            price_validity=request.price_validity,
            gst=request.gst,
            delivery=request.delivery,
            payment_terms=request.payment_terms,
            incoterms=request.incoterms,
            tooling_ownership=request.tooling_ownership,
            packaging=request.packaging,
            terms_and_conditions=request.terms_and_conditions,
            dfm_exceptions=request.dfm_exceptions,
            pricing_overrides=_serialize_pricing_overrides(request.pricing_overrides),
            notes=request.notes,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    quote = await get_quote(db, current_user.id, quote.id)

    try:
        await _auto_send_quote_email_if_requested(
            db=db,
            quote=quote,
            current_user=current_user,
            auto_send_email=request.auto_send_email,
        )
        quote = await get_quote(db, current_user.id, quote.id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Quote email delivery failed: {str(e)}")
    
    return _quote_to_response(quote)


@router.get("/quotes", response_model=List[QuoteListResponse])
async def list_quotations(
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all quotations."""
    quotes = await list_quotes(db, current_user.id, skip=skip, limit=limit)
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
    current_user: User = Depends(get_current_user),
):
    """Get quotation by ID."""
    quote = await get_quote(db, current_user.id, quote_id)
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")
    
    return _quote_to_response(quote)


@router.get("/quotes/number/{quote_number}", response_model=QuoteResponse)
async def get_quotation_by_number(
    quote_number: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get quotation by quote number."""
    quote = await get_quote_by_number(db, current_user.id, quote_number)
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")
    
    return _quote_to_response(quote)


@router.post("/quotes/{quote_id}/pdf")
async def generate_quote_pdf(
    quote_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate PDF document for a quote."""
    quote = await get_quote(db, current_user.id, quote_id)
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")
    
    try:
        pdf_path = await generate_quote_document(db, quote, issuer=current_user)
        return {"pdf_path": pdf_path, "message": "PDF generated successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"PDF generation failed: {str(e)}"
        )


@router.get("/quotes/{quote_id}/pdf/download")
async def download_quote_pdf(
    quote_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Download the PDF document for a quote."""
    quote = await get_quote(db, current_user.id, quote_id)
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")

    # Always regenerate to ensure latest template updates are reflected.
    try:
        pdf_path = await generate_quote_document(db, quote, issuer=current_user)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"PDF generation failed: {str(e)}"
        )
    
    return FileResponse(
        path=pdf_path,
        filename=f"{quote.quote_number}.pdf",
        media_type="application/pdf",
    )


@router.post("/quotes/{quote_id}/email", response_model=QuoteEmailResponse)
async def email_quote_to_customer(
    quote_id: uuid.UUID,
    request: QuoteEmailRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send the quote PDF to the customer using SMTP."""
    quote = await get_quote(db, current_user.id, quote_id)
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")

    if not request.mailbox_access_consent:
        raise HTTPException(
            status_code=400,
            detail="Email permission required. Please confirm mailbox access permission before sending.",
        )

    recipient_email = (quote.customer_email or request.recipient_email or "").strip()
    if not recipient_email:
        raise HTTPException(status_code=400, detail="Customer email is required to send quote")

    if not quote.pdf_path:
        try:
            pdf_path = await generate_quote_document(db, quote, issuer=current_user)
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"PDF generation failed: {str(e)}",
            )
    else:
        pdf_path = quote.pdf_path

    try:
        try:
            await consume_points(
                db,
                user_id=current_user.id,
                points=settings.POINTS_COST_SEND_QUOTE_EMAIL,
                action="send_quote_email",
                description=f"Sent quote {quote.quote_number} to customer",
                reference_type="quote",
                reference_id=str(quote.id),
            )
        except InsufficientPointsError:
            raise HTTPException(status_code=402, detail="Insufficient points to send quote email")

        await send_quote_email(
            quote=quote,
            sender=current_user,
            recipient_email=recipient_email,
            pdf_path=pdf_path,
            subject=request.subject,
            message=request.message,
            use_logged_in_sender_identity=request.send_as_logged_in_user,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Email delivery failed: {str(e)}")

    await update_quote_status(db, quote.id, QuoteStatus.SENT)

    return QuoteEmailResponse(
        message="Quote emailed successfully",
        recipient_email=recipient_email,
        quote_id=quote.id,
    )


def _quote_to_response(quote: Quote) -> QuoteResponse:
    """Convert Quote model to response schema."""
    matched_vendor = None
    if quote.matched_vendor:
        score = 0.0
        details = quote.vendor_match_details or {}
        selected = details.get("selected") if isinstance(details, dict) else None
        if isinstance(selected, dict):
            score = float((selected.get("score") or {}).get("total", 0.0))
        matched_vendor = VendorMatchSummary(
            vendor_id=quote.matched_vendor.id,
            vendor_name=quote.matched_vendor.name,
            score=score,
            details=details,
        )

    return QuoteResponse(
        id=quote.id,
        quote_number=quote.quote_number,
        customer_name=quote.customer_name,
        customer_email=quote.customer_email,
        customer_company=quote.customer_company,
        rfq_number=quote.rfq_number,
        part_name=quote.part_name,
        part_number=quote.part_number,
        revision=quote.revision,
        rfq_date=quote.rfq_date,
        quote_due_date=quote.quote_due_date,
        annual_volume=quote.annual_volume,
        batch_size=quote.batch_size,
        target_price=quote.target_price,
        application=quote.application,
        raw_form=quote.raw_form,
        raw_size=quote.raw_size,
        net_weight_kg=quote.net_weight_kg,
        raw_weight_kg=quote.raw_weight_kg,
        buy_to_fly_ratio=quote.buy_to_fly_ratio,
        requested_surface_finish=quote.requested_surface_finish,
        tolerance_notes=quote.tolerance_notes,
        complexity_level=quote.complexity_level,
        process_routing=quote.process_routing,
        matched_vendor=matched_vendor,
        vendor_match_details=quote.vendor_match_details,
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
        price_validity=quote.price_validity,
        gst=quote.gst,
        delivery=quote.delivery,
        payment_terms=quote.payment_terms,
        incoterms=quote.incoterms,
        tooling_ownership=quote.tooling_ownership,
        packaging=quote.packaging,
        terms_and_conditions=quote.terms_and_conditions,
        dfm_exceptions=quote.dfm_exceptions,
        notes=quote.notes,
        created_at=quote.created_at,
        updated_at=quote.updated_at,
    )
