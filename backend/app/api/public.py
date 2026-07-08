"""Public (unauthenticated) endpoints for customer-facing quote pages.

A quote becomes publicly reachable only after its owner generates a share
token; the token is an unguessable capability URL. Internal cost breakdowns
and margins are never exposed here.
"""
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.models import Quote, QuoteStatus
from app.schemas.schemas import (
    PublicQuoteLineItem,
    PublicQuoteRespondRequest,
    PublicQuoteResponse,
    PublicSellerInfo,
)
from app.services.document import ensure_quote_document, pdf_generator

router = APIRouter(tags=["Public Quotes"], prefix="/public")


async def _get_shared_quote(db: AsyncSession, share_token: str) -> Quote:
    query = (
        select(Quote)
        .where(Quote.share_token == share_token)
        .options(
            selectinload(Quote.user),
            selectinload(Quote.material),
            selectinload(Quote.surface_finish),
            selectinload(Quote.inspection_level),
            selectinload(Quote.cad_file),
        )
    )
    result = await db.execute(query)
    quote = result.scalar_one_or_none()
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")
    return quote


def _public_status(quote: Quote) -> str:
    """Customer-visible status; validity lapses only matter for open quotes."""
    if quote.status in (QuoteStatus.ACCEPTED, QuoteStatus.DECLINED, QuoteStatus.EXPIRED):
        return quote.status.value
    if quote.valid_until is not None and quote.valid_until < datetime.utcnow():
        return QuoteStatus.EXPIRED.value
    return quote.status.value


def _public_line_items(quote: Quote) -> list[PublicQuoteLineItem]:
    combined = pdf_generator._parse_combined_items(quote.notes)
    if combined:
        items = []
        for item in combined:
            quantity = max(int(item["quantity"]), 1)
            line_total = Decimal(str(item["line_total"]))
            items.append(
                PublicQuoteLineItem(
                    part_name=item["file_name"],
                    quantity=quantity,
                    unit_price=line_total / quantity,
                    line_total=line_total,
                )
            )
        return items

    part_name = quote.part_name or (
        quote.cad_file.original_filename if quote.cad_file else "Machined part"
    )
    return [
        PublicQuoteLineItem(
            part_name=part_name,
            quantity=quote.quantity or 1,
            unit_price=quote.unit_price,
            line_total=quote.total_price,
        )
    ]


def _to_public_response(quote: Quote) -> PublicQuoteResponse:
    return PublicQuoteResponse(
        quote_number=quote.quote_number,
        status=_public_status(quote),
        customer_name=quote.customer_name,
        customer_company=quote.customer_company,
        part_name=quote.part_name,
        material_name=quote.material.name if quote.material else None,
        surface_finish_name=quote.surface_finish.name if quote.surface_finish else None,
        inspection_level_name=quote.inspection_level.name if quote.inspection_level else None,
        tolerance_notes=quote.tolerance_notes,
        line_items=_public_line_items(quote),
        total_price=quote.total_price,
        estimated_lead_time_days=quote.estimated_lead_time_days,
        valid_until=quote.valid_until,
        created_at=quote.created_at,
        payment_terms=quote.payment_terms,
        delivery=quote.delivery,
        gst=quote.gst,
        price_validity=quote.price_validity,
        responded_at=quote.responded_at,
        customer_response_note=quote.customer_response_note,
        seller=PublicSellerInfo(
            company_name=quote.user.company_name if quote.user else "ForgeQuote",
            company_address=quote.user.company_address if quote.user else None,
            contact_name=quote.user.full_name if quote.user else None,
            email=quote.user.email if quote.user else None,
            phone=quote.user.phone_number if quote.user else None,
            brand_color=quote.user.brand_color if quote.user else None,
        ),
    )


@router.get("/quotes/{share_token}", response_model=PublicQuoteResponse)
async def get_public_quote(
    share_token: str,
    db: AsyncSession = Depends(get_db),
):
    quote = await _get_shared_quote(db, share_token)
    return _to_public_response(quote)


@router.post("/quotes/{share_token}/respond", response_model=PublicQuoteResponse)
async def respond_to_public_quote(
    share_token: str,
    request: PublicQuoteRespondRequest,
    db: AsyncSession = Depends(get_db),
):
    quote = await _get_shared_quote(db, share_token)

    status = _public_status(quote)
    if status == QuoteStatus.EXPIRED.value:
        raise HTTPException(status_code=409, detail="This quote has expired and can no longer be accepted")
    if status in (QuoteStatus.ACCEPTED.value, QuoteStatus.DECLINED.value):
        raise HTTPException(status_code=409, detail="This quote has already been responded to")

    quote.status = (
        QuoteStatus.ACCEPTED if request.action == "accept" else QuoteStatus.DECLINED
    )
    quote.customer_response_note = (request.note or "").strip() or None
    quote.responded_at = datetime.utcnow()
    await db.commit()
    await db.refresh(quote)

    return _to_public_response(quote)


@router.get("/quotes/{share_token}/pdf")
async def download_public_quote_pdf(
    share_token: str,
    db: AsyncSession = Depends(get_db),
):
    quote = await _get_shared_quote(db, share_token)

    try:
        pdf_path = await ensure_quote_document(db, quote, issuer=quote.user)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {str(e)}")

    return FileResponse(
        path=pdf_path,
        filename=f"{quote.quote_number}.pdf",
        media_type="application/pdf",
    )
