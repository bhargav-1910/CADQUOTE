"""Legal, compliance and consent endpoints.

The policy documents are rendered by the frontend; this module is the single
source of truth for the values interpolated into them (company identity,
contact addresses, retention window, policy version) so the published text
can never drift from the running configuration.
"""
from __future__ import annotations

import hashlib
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import ratelimit
from app.core.config import settings
from app.core.database import get_db
from app.core.security_log import client_ip, log_security_event
from app.models.models import ConsentRecord, User
from app.schemas.schemas import (
    ConsentRequest,
    ConsentResponse,
    LegalDocumentSummary,
    LegalInfoResponse,
)

router = APIRouter(prefix="/legal", tags=["Legal & Compliance"])

_DOCUMENTS = (
    ("privacy", "Privacy Policy", "/legal/privacy"),
    ("terms", "Terms & Conditions", "/legal/terms"),
    ("cookies", "Cookie Policy", "/legal/cookies"),
    ("disclaimer", "Disclaimer", "/legal/disclaimer"),
    ("security", "Security Policy", "/legal/security"),
    ("disclosure", "Responsible Disclosure Policy", "/legal/disclosure"),
)


def _hash_ip(request: Request) -> Optional[str]:
    """Store a salted digest, never the address itself.

    Consent records are a compliance artifact, not a tracking log — the digest
    is enough to demonstrate the decision came from a distinct client.
    """
    ip = client_ip(request)
    if not ip:
        return None
    salted = f"{settings.JWT_SECRET_KEY}:{ip}".encode("utf-8")
    return hashlib.sha256(salted).hexdigest()


@router.get("/info", response_model=LegalInfoResponse)
async def get_legal_info() -> LegalInfoResponse:
    """Configuration-driven values rendered into every policy page."""
    return LegalInfoResponse(
        app_name=settings.APP_NAME,
        company_name=settings.LEGAL_COMPANY_NAME,
        contact_email=settings.LEGAL_CONTACT_EMAIL,
        privacy_email=settings.LEGAL_PRIVACY_EMAIL,
        security_email=settings.LEGAL_SECURITY_EMAIL,
        company_address=settings.LEGAL_COMPANY_ADDRESS,
        jurisdiction=settings.LEGAL_JURISDICTION,
        policy_version=settings.LEGAL_POLICY_VERSION,
        data_retention_days=settings.LEGAL_DATA_RETENTION_DAYS,
        documents=[
            LegalDocumentSummary(slug=slug, title=title, url=url)
            for slug, title, url in _DOCUMENTS
        ],
    )


async def _current_user_optional(request: Request, db: AsyncSession) -> Optional[User]:
    """Resolve the caller if a valid bearer token is present, else None.

    Consent must be recordable before sign-in, so authentication is optional
    here — but when present it is verified exactly like everywhere else.
    """
    header = request.headers.get("authorization", "")
    if not header.lower().startswith("bearer "):
        return None
    from app.api.deps import get_current_user
    try:
        return await get_current_user(request=request, token=header[7:].strip(), db=db)
    except Exception:
        return None


@router.post("/consent", response_model=ConsentResponse)
async def record_consent(
    request: Request,
    payload: ConsentRequest,
    db: AsyncSession = Depends(get_db),
) -> ConsentResponse:
    """Persist a cookie/privacy consent decision for audit."""
    await ratelimit.enforce(request, "legal.consent", limit=30, window_seconds=3600)

    user = await _current_user_optional(request, db)
    record = ConsentRecord(
        user_id=user.id if user else None,
        # Client-generated opaque id; truncated so a caller cannot use this
        # column as arbitrary storage.
        subject_key=payload.subject_key.strip()[:64],
        policy_version=payload.policy_version.strip()[:40] or settings.LEGAL_POLICY_VERSION,
        necessary=True,  # strictly necessary cookies cannot be declined
        preferences=payload.preferences,
        analytics=payload.analytics,
        marketing=payload.marketing,
        source=payload.source.strip()[:40] or "banner",
        ip_hash=_hash_ip(request),
        user_agent=(request.headers.get("user-agent") or "")[:255] or None,
    )
    db.add(record)
    await db.commit()

    log_security_event(
        "consent.recorded",
        request=request,
        user_id=user.id if user else None,
        policy_version=record.policy_version,
        analytics=record.analytics,
        marketing=record.marketing,
        preferences=record.preferences,
    )
    return ConsentResponse(
        recorded_at=record.created_at or datetime.utcnow(),
        policy_version=record.policy_version,
        necessary=True,
        preferences=record.preferences,
        analytics=record.analytics,
        marketing=record.marketing,
    )
