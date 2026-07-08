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

from app.core.config import Settings
from app.services.document import inr_in_words
from app.services.pricing import PricingEngine
from app.services.upload import (
    normalize_file_format,
    validate_file_content,
    validate_file_extension,
)


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
