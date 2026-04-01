"""Vendor matching engine for CNC quotation routing."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence, Tuple, Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.models import (
    GeometryAnalysis,
    Material,
    Vendor,
    VendorCertification,
    VendorMachineCapability,
    VendorMaterialExpertise,
)


@dataclass
class VendorMatchRequest:
    machine_type: str
    max_envelope_mm: Tuple[float, float, float]
    material_category: str
    required_certifications: Sequence[str]


@dataclass
class VendorMatchResult:
    vendor: Optional[Vendor]
    score: float
    machine_capability: Optional[VendorMachineCapability]
    details: Dict[str, Any]


def _normalize_machine_type(machine_name: str) -> str:
    lower = (machine_name or "").lower()
    if "5-axis" in lower or "5 axis" in lower:
        return "5-axis"
    if "lathe" in lower or "turn" in lower:
        return "lathe"
    return "3-axis"


def _build_request(
    geometry: GeometryAnalysis,
    material: Material,
    pricing_overrides: Optional[Dict[str, Any]],
    required_certifications: Optional[Sequence[str]],
) -> VendorMatchRequest:
    machine_name = "Standard 3-Axis CNC Mill"
    if pricing_overrides and pricing_overrides.get("machine_name"):
        machine_name = str(pricing_overrides["machine_name"])

    return VendorMatchRequest(
        machine_type=_normalize_machine_type(machine_name),
        max_envelope_mm=(geometry.bbox_x * 10.0, geometry.bbox_y * 10.0, geometry.bbox_z * 10.0),
        material_category=(material.category or "").lower(),
        required_certifications=[c.strip().upper() for c in (required_certifications or []) if c and c.strip()],
    )


def _score_vendor(
    vendor: Vendor,
    machine: VendorMachineCapability,
    request: VendorMatchRequest,
) -> Dict[str, float]:
    envelope_margin = min(
        machine.envelope_x_mm / max(request.max_envelope_mm[0], 1.0),
        machine.envelope_y_mm / max(request.max_envelope_mm[1], 1.0),
        machine.envelope_z_mm / max(request.max_envelope_mm[2], 1.0),
    )
    envelope_score = max(0.0, min((envelope_margin - 1.0) * 100.0, 100.0))

    capacity_score = max(0.0, 100.0 - float(vendor.current_load_pct))
    quality_score = min(max(float(vendor.quality_rating), 0.0), 5.0) * 20.0
    delivery_score = min(max(float(vendor.on_time_rating), 0.0), 5.0) * 20.0

    weighted_score = (
        0.35 * capacity_score
        + 0.25 * quality_score
        + 0.20 * delivery_score
        + 0.20 * envelope_score
    )

    return {
        "capacity": round(capacity_score, 2),
        "quality": round(quality_score, 2),
        "delivery": round(delivery_score, 2),
        "envelope": round(envelope_score, 2),
        "total": round(weighted_score, 2),
    }


async def match_vendor_for_quote(
    db: AsyncSession,
    geometry: GeometryAnalysis,
    material: Material,
    pricing_overrides: Optional[Dict[str, Any]] = None,
    required_certifications: Optional[Sequence[str]] = None,
) -> VendorMatchResult:
    """Match best vendor using machine type, envelope, material expertise and certifications."""
    request = _build_request(geometry, material, pricing_overrides, required_certifications)

    query = (
        select(Vendor)
        .options(
            selectinload(Vendor.machine_capabilities),
            selectinload(Vendor.material_expertise),
            selectinload(Vendor.certifications),
        )
        .where(Vendor.is_active == True)
    )
    result = await db.execute(query)
    vendors = list(result.scalars().all())

    best_vendor: Optional[Vendor] = None
    best_machine: Optional[VendorMachineCapability] = None
    best_score = -1.0
    all_candidates: List[Dict[str, Any]] = []

    for vendor in vendors:
        active_materials = {
            m.material_category.lower()
            for m in vendor.material_expertise
            if m.is_active
        }
        if request.material_category and request.material_category not in active_materials:
            continue

        active_certs = {
            cert.certification_code.upper()
            for cert in vendor.certifications
            if cert.is_active
        }
        missing_certs = [c for c in request.required_certifications if c not in active_certs]
        if missing_certs:
            continue

        eligible_machines = [
            machine
            for machine in vendor.machine_capabilities
            if machine.is_active
            and machine.machine_type.lower() == request.machine_type.lower()
            and machine.envelope_x_mm >= request.max_envelope_mm[0]
            and machine.envelope_y_mm >= request.max_envelope_mm[1]
            and machine.envelope_z_mm >= request.max_envelope_mm[2]
        ]

        if not eligible_machines:
            continue

        machine = sorted(
            eligible_machines,
            key=lambda m: (
                m.envelope_x_mm * m.envelope_y_mm * m.envelope_z_mm,
                m.machine_rate_override or 0,
            ),
        )[0]

        score_breakdown = _score_vendor(vendor, machine, request)
        all_candidates.append(
            {
                "vendor_id": str(vendor.id),
                "vendor_name": vendor.name,
                "machine_type": machine.machine_type,
                "score": score_breakdown,
            }
        )

        if score_breakdown["total"] > best_score:
            best_vendor = vendor
            best_machine = machine
            best_score = score_breakdown["total"]

    if not best_vendor or not best_machine:
        return VendorMatchResult(
            vendor=None,
            score=0.0,
            machine_capability=None,
            details={
                "matched": False,
                "request": {
                    "machine_type": request.machine_type,
                    "max_envelope_mm": list(request.max_envelope_mm),
                    "material_category": request.material_category,
                    "required_certifications": list(request.required_certifications),
                },
                "candidates": all_candidates,
                "reason": "No vendors satisfy all hard filters",
            },
        )

    winning_score = _score_vendor(best_vendor, best_machine, request)
    return VendorMatchResult(
        vendor=best_vendor,
        score=winning_score["total"],
        machine_capability=best_machine,
        details={
            "matched": True,
            "request": {
                "machine_type": request.machine_type,
                "max_envelope_mm": list(request.max_envelope_mm),
                "material_category": request.material_category,
                "required_certifications": list(request.required_certifications),
            },
            "selected": {
                "vendor_id": str(best_vendor.id),
                "vendor_name": best_vendor.name,
                "machine_type": best_machine.machine_type,
                "score": winning_score,
            },
            "candidates": all_candidates,
        },
    )


def vendor_match_to_pricing_overrides(match_result: VendorMatchResult) -> Dict[str, Any]:
    """Translate a match into quote-scoped pricing overrides."""
    if not match_result.vendor:
        return {}

    overrides: Dict[str, Any] = {
        "vendor_load_pct": float(match_result.vendor.current_load_pct),
    }
    if match_result.machine_capability and match_result.machine_capability.machine_rate_override is not None:
        overrides["machine_hourly_rate"] = float(match_result.machine_capability.machine_rate_override)
        overrides["machine_name"] = match_result.machine_capability.machine_type

    return overrides
