"""Fast smoke tests: pure logic that must never regress.

These run without a database, Redis, or WeasyPrint so they are cheap enough
for every CI run.
"""
import struct
import sys
import types

import pytest
from fastapi import HTTPException

# storage.py imports boto3 at module load; stub it if unavailable so these
# tests stay runnable in minimal environments.
try:  # pragma: no cover
    import boto3  # noqa: F401
except ImportError:  # pragma: no cover
    sys.modules.setdefault("boto3", types.ModuleType("boto3"))

from decimal import Decimal

from app.core.config import Settings
from app.services.document import inr_in_words
from app.services.pricing import PricingEngine, PricingInputs
from app.services.upload import (
    normalize_file_format,
    validate_file_content,
    validate_file_extension,
)


def make_pricing_inputs(**overrides) -> PricingInputs:
    """A plain milled aluminum bracket; individual tests override fields."""
    defaults = dict(
        volume_cm3=30.0,
        surface_area_cm2=150.0,
        bounding_box_volume_cm3=100.0,
        bbox_x_cm=10.0,
        bbox_y_cm=5.0,
        bbox_z_cm=2.0,
        complexity_score=16.0,
        removal_ratio=0.3,
        hole_count=4,
        hole_diameters_mm=[5.0, 5.0, 5.0, 5.0],
        min_wall_thickness_mm=3.0,
        triangle_count=5000,
        material_name="Aluminum 6061-T6",
        material_category="aluminum",
        material_density=2.70,
        material_cost_per_kg=Decimal("320"),
        machining_difficulty_factor=0.8,
        material_availability_factor=1.0,
        scrap_cost_per_kg=Decimal("30"),
        include_scrap_saving=False,
        finish_name="As Machined",
        finish_cost_multiplier=1.0,
        finish_fixed_cost=Decimal("0"),
        finish_rate_per_kg=Decimal("0"),
        finish_rate_per_sq_inch=Decimal("0"),
        finish_rate_per_sq_ft=Decimal("0"),
        finish_rate_per_piece=Decimal("0"),
        finish_lead_time_days=0.0,
        inspection_name="Standard Visual",
        inspection_fixed_cost=Decimal("0"),
        inspection_percentage_cost=0.0,
        inspection_lead_time_days=0.0,
        machine_name="3 Axis VMC",
        hourly_rate=Decimal("700"),
        setup_hour_rate=Decimal("700"),
        machine_efficiency=0.75,
        setup_time_hours=0.75,
        quantity=1,
        vendor_margin_pct=18.0,
        platform_commission_pct=8.0,
        vendor_overhead_pct=15.0,
        platform_overhead_pct=7.0,
        risk_factor_pct=5.0,
        vendor_load_pct=70.0,
        urgent_factor_pct=0.0,
        negotiation_buffer_pct=7.0,
        min_order_value=Decimal("0"),
    )
    defaults.update(overrides)
    return PricingInputs(**defaults)


# ---------------------------------------------------------------------------
# Amount in words (Indian numbering)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    ("amount", "expected"),
    [
        (0, "Rupees Zero Only"),
        (1, "Rupees One Only"),
        (1234.56, "Rupees One Thousand Two Hundred Thirty Four and Fifty Six Paise Only"),
        (100000, "Rupees One Lakh Only"),
        (10000000, "Rupees One Crore Only"),
        (12345678.09, "Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight and Nine Paise Only"),
    ],
)
def test_inr_in_words(amount, expected):
    assert inr_in_words(amount) == expected


# ---------------------------------------------------------------------------
# Upload validation
# ---------------------------------------------------------------------------

def _binary_stl(triangle_count: int) -> bytes:
    body = b"\x00" * 80 + struct.pack("<I", triangle_count)
    return body + b"\x00" * (triangle_count * 50)


def test_upload_rejects_unknown_extension():
    with pytest.raises(HTTPException) as excinfo:
        validate_file_extension("malware.exe")
    assert excinfo.value.status_code == 400


def test_upload_accepts_cad_extensions():
    assert validate_file_extension("part.STEP") == ".step"
    assert normalize_file_format(".stp") == "step"
    assert normalize_file_format(".stl") == "stl"


def test_step_content_signature_enforced():
    valid = b"ISO-10303-21;\nHEADER;..."
    validate_file_content(valid, "step")  # must not raise

    with pytest.raises(HTTPException):
        validate_file_content(b"MZ\x90\x00 this is not CAD", "step")


def test_stl_content_signature_enforced():
    validate_file_content(b"solid part\nfacet normal 0 0 1\n", "stl")
    validate_file_content(_binary_stl(12), "stl")

    with pytest.raises(HTTPException):
        validate_file_content(b"\x00" * 84, "stl")  # zero triangles
    with pytest.raises(HTTPException):
        validate_file_content(_binary_stl(10)[:-25], "stl")  # truncated payload


# ---------------------------------------------------------------------------
# Pricing helpers
# ---------------------------------------------------------------------------

def test_turning_stock_uses_round_bar_axis():
    engine = PricingEngine()
    # A shaft along X: cross-section (y, z) is nearly round.
    diameter_cm, length_cm = engine._turning_stock_dims(12.0, 3.0, 3.1)
    assert length_cm == 12.0
    assert diameter_cm == pytest.approx(3.1)


def test_milled_stock_priced_as_full_billet():
    """Material must be billed for the billet you buy, not the finished part.

    A 30 cm3 part in a 100 cm3 envelope must carry ~billet-weight material
    cost (bbox + 3 mm/side allowance), not part-volume + a token wastage.
    """
    engine = PricingEngine()
    result = engine.calculate_price(make_pricing_inputs())
    material = result.details["material"]

    billet_volume = (10.0 + 0.6) * (5.0 + 0.6) * (2.0 + 0.6)  # cm3
    expected_buy_kg = billet_volume * 2.70 / 1000.0
    assert material["buy_weight_kg"] == pytest.approx(expected_buy_kg, rel=0.01)
    # The old bug billed only ~1.1-1.25x part weight (~0.09-0.10 kg here).
    assert material["buy_weight_kg"] > 2.5 * material["raw_weight_kg"]

    stock = result.details["raw_material"]["raw_material_stock_dimensions_mm"]
    assert stock["form"] == "rectangular_block"
    assert stock["x"] == pytest.approx(106.0)


def test_volume_discount_applies_at_large_quantities():
    engine = PricingEngine()
    small = engine.calculate_price(make_pricing_inputs(quantity=50))
    large = engine.calculate_price(make_pricing_inputs(quantity=500))

    assert small.details["marketplace"]["volume_discount_pct"] == 0.0
    assert large.details["marketplace"]["volume_discount_pct"] == 12.0
    # Unit price at 500 must undercut unit price at 50.
    assert large.unit_price < small.unit_price


def test_brep_directions_drive_setup_count():
    """Measured machining orientations must replace the complexity heuristic."""
    engine = PricingEngine()

    measured = engine.calculate_price(make_pricing_inputs(machining_direction_count=3))
    setup = measured.details["setup"]
    assert setup["setup_basis"] == "brep_machining_directions"
    assert setup["number_of_setups"] == 3 + measured.details["dfm"]["extra_setups"]

    heuristic = engine.calculate_price(make_pricing_inputs())
    assert heuristic.details["setup"]["setup_basis"] == "complexity_estimate"


def test_tolerance_tiers_defined():
    engine = PricingEngine()
    assert set(engine.TOLERANCE_TIERS) >= {"general", "precision", "tight"}
    general = engine.TOLERANCE_TIERS["general"]
    tight = engine.TOLERANCE_TIERS["tight"]
    # Tighter tolerances must never be cheaper to machine.
    assert tight["machining_time_multiplier"] >= general["machining_time_multiplier"]


# ---------------------------------------------------------------------------
# Configuration safety
# ---------------------------------------------------------------------------

def test_production_refuses_default_jwt_secret():
    with pytest.raises(RuntimeError):
        Settings(
            ENVIRONMENT="production",
            JWT_SECRET_KEY="change-me-in-production",
            _env_file=None,
        )


def test_development_allows_default_jwt_secret():
    settings = Settings(
        ENVIRONMENT="development",
        JWT_SECRET_KEY="change-me-in-production",
        _env_file=None,
    )
    assert settings.ENVIRONMENT == "development"
