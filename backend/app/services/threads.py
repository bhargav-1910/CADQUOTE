"""Heuristic detection of tapped (threaded) holes from fitted hole diameters.

STEP exports almost never model the actual thread helix — a tapped hole and a
plain drilled hole are geometrically identical cylinders in the B-rep. The
tap-drill size is the tell: a machinist always drills a standard undersized
pilot hole before tapping, so a fitted diameter landing on a standard
tap-drill size is real evidence of a threaded hole, not a guess.
"""
from typing import Dict, List, Optional, Tuple

# ISO metric coarse-thread tap drill diameters (mm) — standard machinist reference.
TAP_DRILL_SIZES_MM: Dict[str, float] = {
    "M2": 1.6,
    "M2.5": 2.05,
    "M3": 2.5,
    "M4": 3.3,
    "M5": 4.2,
    "M6": 5.0,
    "M8": 6.8,
    "M10": 8.5,
    "M12": 10.2,
    "M14": 12.0,
    "M16": 14.0,
    "M20": 17.5,
    "M24": 21.0,
}

TOLERANCE_MM = 0.15


def classify_threaded_holes(
    hole_diameters_mm: Optional[List[float]],
) -> Tuple[int, List[Dict[str, object]]]:
    """Match fitted hole diameters against standard tap-drill sizes.

    Returns (threaded_count, matches) where each match is
    {"diameter_mm": float, "likely_thread": "M6"}.
    """
    if not hole_diameters_mm:
        return 0, []

    matches: List[Dict[str, object]] = []
    for diameter in hole_diameters_mm:
        for thread, drill in TAP_DRILL_SIZES_MM.items():
            if abs(diameter - drill) <= TOLERANCE_MM:
                matches.append({"diameter_mm": diameter, "likely_thread": thread})
                break

    return len(matches), matches
