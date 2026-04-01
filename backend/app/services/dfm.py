"""Backend DFM analysis service (single source of truth)."""
from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional, TypedDict

from app.models.models import GeometryAnalysis

DFMSeverity = Literal["error", "warning", "info"]
DFMLabel = Literal["Excellent", "Good", "Moderate", "High Risk"]


class DFMIssue(TypedDict):
    severity: DFMSeverity
    code: str
    title: str
    description: str
    recommendation: str
    penalty: int
    confidence: float


class DFMAnalysis(TypedDict):
    score: int
    label: DFMLabel
    issues: List[DFMIssue]
    has_blocking_issue: bool
    total_penalty: int
    confidence_score: float


def _clamp(value: float, min_value: float, max_value: float) -> float:
    return max(min_value, min(max_value, value))


def _push_issue(
    issues: List[DFMIssue],
    *,
    severity: DFMSeverity,
    code: str,
    title: str,
    description: str,
    recommendation: str,
    penalty: int,
    confidence: float,
) -> None:
    issues.append(
        {
            "severity": severity,
            "code": code,
            "title": title,
            "description": description,
            "recommendation": recommendation,
            "penalty": penalty,
            "confidence": round(_clamp(confidence, 0.0, 1.0), 2),
        }
    )


def _confidence_from_threshold(
    value: float,
    threshold: float,
    span: float,
    *,
    direction: Literal["gt", "lt"],
) -> float:
    """Return confidence in [0.55, 0.95] based on threshold distance."""
    span = max(span, 1e-6)
    if direction == "gt":
        distance = max(value - threshold, 0.0)
    else:
        distance = max(threshold - value, 0.0)
    normalized = _clamp(distance / span, 0.0, 1.0)
    return 0.55 + normalized * 0.40


def analyze_dfm_metrics(
    *,
    volume_cm3: float,
    complexity_score: float,
    removal_ratio: float,
    hole_count: int,
    min_wall_thickness_mm: Optional[float],
    bbox_x_cm: float,
    bbox_y_cm: float,
    bbox_z_cm: float,
    triangle_count: Optional[int],
) -> DFMAnalysis:
    """Analyze manufacturability from geometry metrics."""
    issues: List[DFMIssue] = []

    max_dim = max(bbox_x_cm, bbox_y_cm, bbox_z_cm)
    min_dim = max(min(bbox_x_cm, bbox_y_cm, bbox_z_cm), 0.001)
    aspect_ratio = max_dim / min_dim

    # Derived indicators used by multiple CAD-like detectors
    holes_per_100cm3 = (hole_count / volume_cm3) * 100 if volume_cm3 > 0 else 0
    min_dim_mm = min_dim * 10
    triangle_density = (
        (triangle_count / max(volume_cm3, 0.001)) if triangle_count is not None else 0.0
    )

    # 1) Wall thickness checks
    if min_wall_thickness_mm is None:
        _push_issue(
            issues,
            severity="warning",
            code="wall-thickness-unknown",
            title="Wall Thickness Uncertain",
            description="Minimum wall thickness could not be confidently measured from mesh data.",
            recommendation="Review critical walls manually in CAD and keep minimum wall above 1.5-2.0 mm.",
            penalty=10,
            confidence=0.6,
        )
    elif min_wall_thickness_mm < 1.0:
        _push_issue(
            issues,
            severity="error",
            code="wall-too-thin-critical",
            title="Critically Thin Walls",
            description=(
                f"Minimum wall thickness is {min_wall_thickness_mm:.2f} mm, likely below safe CNC limits."
            ),
            recommendation="Increase minimum wall thickness to at least 1.5 mm (2.0 mm preferred).",
            penalty=35,
            confidence=_confidence_from_threshold(min_wall_thickness_mm, 1.0, 0.8, direction="lt"),
        )
    elif min_wall_thickness_mm < 1.5:
        _push_issue(
            issues,
            severity="error",
            code="wall-too-thin",
            title="Thin Walls",
            description=(
                f"Minimum wall thickness is {min_wall_thickness_mm:.2f} mm and may deform during machining."
            ),
            recommendation="Increase minimum wall thickness to 1.5 mm or more.",
            penalty=25,
            confidence=_confidence_from_threshold(min_wall_thickness_mm, 1.5, 0.8, direction="lt"),
        )
    elif min_wall_thickness_mm < 2.0:
        _push_issue(
            issues,
            severity="warning",
            code="wall-thin-warning",
            title="Wall Thickness Near Limit",
            description=(
                f"Minimum wall thickness is {min_wall_thickness_mm:.2f} mm, close to common process limits."
            ),
            recommendation="Target 2.0 mm or more for better stability and repeatability.",
            penalty=12,
            confidence=_confidence_from_threshold(min_wall_thickness_mm, 2.0, 1.0, direction="lt"),
        )

    # 2) Complexity checks (scale-robust metric A^(3/2)/V)
    if complexity_score > 32:
        _push_issue(
            issues,
            severity="error",
            code="complexity-very-high",
            title="Very High Geometric Complexity",
            description=(
                f"Complexity score is {complexity_score:.2f}, indicating difficult tool access and longer cycle times."
            ),
            recommendation="Simplify non-critical features and merge tiny details where possible.",
            penalty=20,
            confidence=_confidence_from_threshold(complexity_score, 32.0, 16.0, direction="gt"),
        )
    elif complexity_score > 24:
        _push_issue(
            issues,
            severity="warning",
            code="complexity-high",
            title="High Geometric Complexity",
            description=(
                f"Complexity score is {complexity_score:.2f}, which can increase setup and machining effort."
            ),
            recommendation="Reduce unnecessary feature transitions and sharp local geometry.",
            penalty=12,
            confidence=_confidence_from_threshold(complexity_score, 24.0, 14.0, direction="gt"),
        )
    elif complexity_score > 18:
        _push_issue(
            issues,
            severity="info",
            code="complexity-elevated",
            title="Elevated Complexity",
            description=f"Complexity score is {complexity_score:.2f}.",
            recommendation="Expect moderate impact on cycle time.",
            penalty=4,
            confidence=_confidence_from_threshold(complexity_score, 18.0, 10.0, direction="gt"),
        )

    # 3) Material removal efficiency
    if removal_ratio < 0.2:
        _push_issue(
            issues,
            severity="error",
            code="removal-ratio-critical",
            title="Very High Material Removal",
            description=(
                f"Removal ratio is {removal_ratio * 100:.1f}%, indicating heavy stock removal and waste."
            ),
            recommendation="Consider near-net stock or redesign for better stock utilization.",
            penalty=20,
            confidence=_confidence_from_threshold(removal_ratio, 0.2, 0.2, direction="lt"),
        )
    elif removal_ratio < 0.35:
        _push_issue(
            issues,
            severity="warning",
            code="removal-ratio-high",
            title="High Material Waste",
            description=(
                f"Removal ratio is {removal_ratio * 100:.1f}%, which may increase cost significantly."
            ),
            recommendation="Reduce bounding stock envelope or simplify outer profile.",
            penalty=12,
            confidence=_confidence_from_threshold(removal_ratio, 0.35, 0.2, direction="lt"),
        )

    # 4) Hole density and feature crowding
    if holes_per_100cm3 > 40:
        _push_issue(
            issues,
            severity="error",
            code="holes-dense-critical",
            title="Extremely Dense Hole Features",
            description=(
                f"{hole_count} holes over {volume_cm3:.2f} cm3 indicates very high feature density."
            ),
            recommendation="Consolidate hole patterns and reduce non-functional holes.",
            penalty=18,
            confidence=_confidence_from_threshold(holes_per_100cm3, 40.0, 25.0, direction="gt"),
        )
    elif holes_per_100cm3 > 25:
        _push_issue(
            issues,
            severity="warning",
            code="holes-dense",
            title="Dense Hole Features",
            description=(
                f"{hole_count} holes over {volume_cm3:.2f} cm3 may increase drilling and inspection time."
            ),
            recommendation="Simplify drill patterns where possible.",
            penalty=10,
            confidence=_confidence_from_threshold(holes_per_100cm3, 25.0, 20.0, direction="gt"),
        )
    elif hole_count > 15:
        _push_issue(
            issues,
            severity="info",
            code="holes-many",
            title="Many Hole Features",
            description=f"Model contains {hole_count} holes.",
            recommendation="Expect additional drilling operations.",
            penalty=3,
            confidence=_confidence_from_threshold(float(hole_count), 15.0, 30.0, direction="gt"),
        )

    # 5) Aspect ratio and fixturing risk
    if aspect_ratio > 20:
        _push_issue(
            issues,
            severity="error",
            code="aspect-ratio-critical",
            title="Extreme Aspect Ratio",
            description=(
                f"Aspect ratio is {aspect_ratio:.1f}:1, likely requiring special fixturing and multiple setups."
            ),
            recommendation="Split part strategy or add temporary support features for machining.",
            penalty=20,
            confidence=_confidence_from_threshold(aspect_ratio, 20.0, 12.0, direction="gt"),
        )
    elif aspect_ratio > 12:
        _push_issue(
            issues,
            severity="warning",
            code="aspect-ratio-high",
            title="High Aspect Ratio",
            description=(
                f"Aspect ratio is {aspect_ratio:.1f}:1, which may reduce rigidity during cutting."
            ),
            recommendation="Review fixturing strategy and consider geometry stiffening in non-functional zones.",
            penalty=10,
            confidence=_confidence_from_threshold(aspect_ratio, 12.0, 8.0, direction="gt"),
        )
    elif aspect_ratio > 8:
        _push_issue(
            issues,
            severity="info",
            code="aspect-ratio-elevated",
            title="Elevated Aspect Ratio",
            description=f"Aspect ratio is {aspect_ratio:.1f}:1.",
            recommendation="Verify workholding and vibration risk.",
            penalty=3,
            confidence=_confidence_from_threshold(aspect_ratio, 8.0, 6.0, direction="gt"),
        )

    # 6) Relative thinness against smallest part dimension
    if min_wall_thickness_mm is not None:
        thinness_ratio = min_wall_thickness_mm / max(min_dim_mm, 0.1)
        if thinness_ratio < 0.08:
            _push_issue(
                issues,
                severity="warning",
                code="thinness-ratio-high",
                title="Low Relative Wall Stiffness",
                description=(
                    f"Wall to minimum dimension ratio is {thinness_ratio * 100:.1f}%, which can increase chatter risk."
                ),
                recommendation="Increase critical wall sections or reduce unsupported span.",
                penalty=8,
                confidence=_confidence_from_threshold(thinness_ratio, 0.08, 0.06, direction="lt"),
            )

    # 7) CAD-like proxy detector: deep feature/drillability risk
    if hole_count > 20 and (min_wall_thickness_mm is not None and min_wall_thickness_mm < 2.0):
        _push_issue(
            issues,
            severity="warning",
            code="deep-drillability-risk",
            title="Potential Deep Drilling Risk",
            description=(
                "High hole count with thin sections may indicate deep or fragile drilling zones."
            ),
            recommendation="Reduce hole depth-to-diameter ratio or increase local support thickness.",
            penalty=10,
            confidence=0.74,
        )

    # 8) CAD-like proxy detector: tool access / undercut likelihood
    if complexity_score > 28 and removal_ratio < 0.25 and holes_per_100cm3 > 20:
        _push_issue(
            issues,
            severity="warning",
            code="tool-access-risk",
            title="Potential Tool Access Constraints",
            description=(
                "Feature density and stock-removal profile suggest possible narrow tool access or undercut-like geometry."
            ),
            recommendation="Review internal corners/hidden features and consider split machining strategy.",
            penalty=12,
            confidence=0.68,
        )

    # 9) CAD-like proxy detector: micro-feature density
    if triangle_density > 4500:
        _push_issue(
            issues,
            severity="warning",
            code="micro-feature-density-high",
            title="High Micro-Feature Density",
            description=(
                f"Triangle density is {triangle_density:.0f} per cm3, indicating tiny features that may be expensive to machine."
            ),
            recommendation="Remove cosmetic micro-features or relax tiny edge detail where functionally possible.",
            penalty=9,
            confidence=_confidence_from_threshold(triangle_density, 4500.0, 3500.0, direction="gt"),
        )

    # 10) Very high mesh detail can indicate noisy tessellation
    if triangle_count is not None and triangle_count > 500000:
        _push_issue(
            issues,
            severity="info",
            code="mesh-very-dense",
            title="Very Dense Mesh",
            description=(
                f"Mesh has {triangle_count:,} triangles, which may inflate analysis time."
            ),
            recommendation="Use a cleaner export tolerance for faster and more stable analysis.",
            penalty=2,
            confidence=_confidence_from_threshold(float(triangle_count), 500000.0, 500000.0, direction="gt"),
        )

    total_penalty = sum(issue["penalty"] for issue in issues)
    score = int(round(_clamp(100 - total_penalty, 0, 100)))
    has_blocking_issue = any(issue["severity"] == "error" for issue in issues)
    confidence_score = round(
        sum(issue["confidence"] for issue in issues) / len(issues),
        2,
    ) if issues else 0.9

    label: DFMLabel = "Excellent"
    if score < 50:
        label = "High Risk"
    elif score < 70:
        label = "Moderate"
    elif score < 85:
        label = "Good"

    return {
        "score": score,
        "label": label,
        "issues": issues,
        "has_blocking_issue": has_blocking_issue,
        "total_penalty": total_penalty,
        "confidence_score": confidence_score,
    }


def analyze_dfm_from_geometry(geometry: GeometryAnalysis) -> DFMAnalysis:
    """Convenience wrapper for persisted geometry model."""
    return analyze_dfm_metrics(
        volume_cm3=geometry.volume,
        complexity_score=geometry.complexity_score,
        removal_ratio=geometry.removal_ratio,
        hole_count=geometry.hole_count,
        min_wall_thickness_mm=geometry.min_wall_thickness,
        bbox_x_cm=geometry.bbox_x,
        bbox_y_cm=geometry.bbox_y,
        bbox_z_cm=geometry.bbox_z,
        triangle_count=geometry.triangle_count,
    )


def summarize_dfm(analysis: DFMAnalysis, max_issues: int = 3) -> Dict[str, Any]:
    """Compact summary used by pricing/PDF outputs."""
    top_issues = analysis["issues"][:max_issues]
    return {
        "score": analysis["score"],
        "label": analysis["label"],
        "has_blocking_issue": analysis["has_blocking_issue"],
        "issue_count": len(analysis["issues"]),
        "confidence_score": analysis["confidence_score"],
        "top_issues": [
            {
                "severity": issue["severity"],
                "title": issue["title"],
                "recommendation": issue["recommendation"],
                "confidence": issue["confidence"],
            }
            for issue in top_issues
        ],
    }
