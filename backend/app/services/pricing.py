"""Rule-based CNC pricing engine with India-focused benchmark ranges."""
import math
from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, replace

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.models import (
    Material,
    SurfaceFinish,
    InspectionLevel,
    GeometryAnalysis,
    MachineRate,
)
from app.core.config import settings
from app.services.dfm import analyze_dfm_metrics


def _to_decimal(value: Any) -> Decimal:
    return Decimal(str(value))


def _clamp(value: float, min_value: float, max_value: float) -> float:
    return max(min_value, min(max_value, value))


@dataclass
class PricingInputs:
    """Input data for pricing calculation."""

    # Geometry
    volume_cm3: float
    surface_area_cm2: float
    bounding_box_volume_cm3: float
    bbox_x_cm: float
    bbox_y_cm: float
    bbox_z_cm: float
    complexity_score: float
    removal_ratio: float
    hole_count: int
    hole_diameters_mm: Optional[List[float]]
    min_wall_thickness_mm: Optional[float]
    triangle_count: Optional[int]

    # Material
    material_name: str
    material_category: str
    material_density: float  # g/cm^3
    material_cost_per_kg: Decimal
    machining_difficulty_factor: float
    material_availability_factor: float
    scrap_cost_per_kg: Decimal
    include_scrap_saving: bool

    # Finish
    finish_name: str
    finish_cost_multiplier: float
    finish_fixed_cost: Decimal
    finish_rate_per_kg: Decimal
    finish_rate_per_sq_inch: Decimal
    finish_rate_per_sq_ft: Decimal
    finish_rate_per_piece: Decimal
    finish_lead_time_days: float

    # Inspection
    inspection_name: str
    inspection_fixed_cost: Decimal
    inspection_percentage_cost: float
    inspection_lead_time_days: float

    # Machine
    machine_name: str
    hourly_rate: Decimal
    setup_hour_rate: Decimal
    machine_efficiency: float
    setup_time_hours: float

    # Order
    quantity: int

    # Pricing layer
    vendor_margin_pct: float
    platform_commission_pct: float
    vendor_overhead_pct: float
    platform_overhead_pct: float
    risk_factor_pct: float
    vendor_load_pct: float
    urgent_factor_pct: float
    negotiation_buffer_pct: float
    min_order_value: Decimal

    # Tolerance requirement (general / precision / tight)
    tolerance_tier: str = "general"

    # Exact B-rep machining orientations (STEP + OCP only). When present,
    # the setup count comes from real hole-axis directions instead of the
    # complexity heuristic.
    machining_direction_count: Optional[int] = None


@dataclass
class PricingResult:
    """Result of pricing calculation."""

    material_cost: Decimal
    machining_cost: Decimal
    finish_cost: Decimal
    inspection_cost: Decimal

    subtotal: Decimal
    total_price: Decimal
    unit_price: Decimal

    estimated_lead_time_days: float
    details: Dict[str, Any]


class PricingEngine:
    """Deterministic pricing engine built from explainable formulas."""

    # India benchmark ranges (INR)
    MACHINE_RATES = {
        # 2026 India blended VMC rates run up to ~1200/hr; lathe up to ~800.
        "3-axis": (500.0, 1200.0),
        "5-axis": (2000.0, 3000.0),
        "lathe": (400.0, 800.0),
    }

    # Effective full-cycle averages (roughing + finishing + air moves), not
    # peak roughing MRR. Aluminum/steel raised to match handbook rates
    # (~22 cm3/min/kW mild steel, ~3x that for aluminum, derated for cycle mix).
    MRR_CM3_PER_MIN = {
        "aluminum": (10.0, 20.0),
        "steel": (4.0, 8.0),
        "stainless": (3.0, 6.0),
        "brass": (6.0, 10.0),
        "plastic": (12.0, 22.0),
        "titanium": (2.0, 4.0),
    }

    # Deep-volume discount on the variable price beyond fixed-cost spreading;
    # market bids fall another ~5-12% at 100-500+ pieces.
    VOLUME_DISCOUNT_TIERS = [
        (500, 0.12),
        (250, 0.08),
        (100, 0.05),
    ]

    MATERIAL_RATE_BENCHMARKS = {
        "aluminum 6061": (300.0, 350.0),
        "aluminum 7075": (450.0, 600.0),
        "brass c360": (600.0, 750.0),
        "nylon 6/6": (250.0, 400.0),
        "peek": (7000.0, 9000.0),
        "pom": (300.0, 450.0),
        "delrin": (300.0, 450.0),
        "mild steel 1018": (70.0, 100.0),
        "ss304": (220.0, 300.0),
        "stainless steel 304": (220.0, 300.0),
        "stainless steel 316": (300.0, 450.0),
        "titanium grade 5": (3000.0, 4500.0),
        "en8": (90.0, 140.0),
    }

    SECONDARY_OP_COST = {
        "anodizing": (15.0, 40.0),
        "powder coating": (25.0, 70.0),
        "heat treatment": (20.0, 80.0),
    }

    QUALITY_COST = {
        "basic": (10.0, 20.0),
        "vernier": (20.0, 50.0),
        "cmm": (100.0, 300.0),
    }

    # Tolerance tiers: tighter tolerances slow machining (finishing passes,
    # slower feeds) and add inspection effort.
    TOLERANCE_TIERS = {
        "general": {
            "label": "General (±0.10 mm)",
            "machining_time_multiplier": 1.0,
            "inspection_multiplier": 1.0,
            "lead_time_add_days": 0.0,
        },
        "precision": {
            "label": "Precision (±0.05 mm)",
            "machining_time_multiplier": 1.35,
            "inspection_multiplier": 1.5,
            "lead_time_add_days": 0.5,
        },
        "tight": {
            "label": "Tight (±0.01 mm)",
            "machining_time_multiplier": 2.0,
            "inspection_multiplier": 2.5,
            "lead_time_add_days": 1.5,
        },
    }

    # Per-rule DFM cost effects, replacing the old single blunt surcharge.
    # cycle_time_pct slows cutting, tooling_add buys special tooling (per
    # batch), extra_setups adds a fixturing setup, inspection_pct adds QC
    # effort, risk_pct stays a residual surcharge for hard-to-model risks.
    DFM_COST_RULES = {
        "wall-too-thin-critical": {"cycle_time_pct": 18.0, "inspection_pct": 10.0, "reason": "Reduced feed rates and extra finishing passes around fragile walls"},
        "wall-too-thin": {"cycle_time_pct": 12.0, "inspection_pct": 6.0, "reason": "Slower feeds to avoid deforming thin walls"},
        "wall-thin-warning": {"cycle_time_pct": 5.0, "reason": "Conservative cutting parameters near thin sections"},
        "wall-thickness-unknown": {"risk_pct": 3.0, "reason": "Manual wall review buffer"},
        "complexity-very-high": {"cycle_time_pct": 10.0, "extra_setups": 1, "reason": "Difficult tool access and an extra fixturing setup"},
        "complexity-high": {"cycle_time_pct": 6.0, "reason": "More feature transitions and toolpath overhead"},
        "complexity-elevated": {"cycle_time_pct": 2.0, "reason": "Moderate cycle-time impact"},
        "removal-ratio-critical": {"risk_pct": 4.0, "reason": "Heavy stock removal wear and chip management"},
        "removal-ratio-high": {"risk_pct": 2.0, "reason": "High stock removal overhead"},
        "holes-dense-critical": {"cycle_time_pct": 8.0, "tooling_add": 60.0, "reason": "Dense drill patterns need extra tools and pecking cycles"},
        "holes-dense": {"cycle_time_pct": 4.0, "tooling_add": 30.0, "reason": "Extra drilling and inspection time"},
        "holes-many": {"cycle_time_pct": 1.5, "reason": "Additional drilling operations"},
        "aspect-ratio-critical": {"extra_setups": 1, "cycle_time_pct": 6.0, "reason": "Special fixturing and vibration-limited cutting"},
        "aspect-ratio-high": {"cycle_time_pct": 4.0, "reason": "Reduced rigidity limits cutting speed"},
        "aspect-ratio-elevated": {"cycle_time_pct": 1.5, "reason": "Workholding care for a slender part"},
        "thinness-ratio-high": {"cycle_time_pct": 4.0, "reason": "Chatter-limited cutting parameters"},
        "deep-drillability-risk": {"tooling_add": 80.0, "cycle_time_pct": 5.0, "reason": "Deep-hole drilling cycles and specialized drills"},
        "tool-access-risk": {"cycle_time_pct": 6.0, "extra_setups": 1, "reason": "Narrow tool access may force smaller tools and extra setups"},
        "micro-feature-density-high": {"cycle_time_pct": 5.0, "reason": "Tiny features need small tools at low feed"},
        "mesh-very-dense": {"risk_pct": 0.5, "reason": "Analysis overhead only"},
    }

    def calculate_price(self, inputs: PricingInputs) -> PricingResult:
        details: Dict[str, Any] = {}

        dfm_analysis = analyze_dfm_metrics(
            volume_cm3=inputs.volume_cm3,
            complexity_score=inputs.complexity_score,
            removal_ratio=inputs.removal_ratio,
            hole_count=inputs.hole_count,
            min_wall_thickness_mm=inputs.min_wall_thickness_mm,
            bbox_x_cm=inputs.bbox_x_cm,
            bbox_y_cm=inputs.bbox_y_cm,
            bbox_z_cm=inputs.bbox_z_cm,
            triangle_count=inputs.triangle_count,
        )

        process_type = self._infer_process(inputs.machine_name, inputs.removal_ratio)
        machine_type = self._infer_machine_type(inputs.machine_name)
        material_key = self._infer_material_key(inputs.material_name, inputs.material_category)

        # Complexity score is scale-robust A^(3/2)/V, where simple prismatic parts
        # are typically near ~15 and complex parts trend higher.
        complexity_norm = _clamp((inputs.complexity_score - 14.0) / 18.0, 0.0, 1.0)

        # A. Material cost — stock model depends on process:
        # turned parts buy round bar (pi/4 * d^2 * L), milled parts buy a
        # sawn billet sized from the bounding box plus machining allowance.
        raw_weight_kg = (inputs.volume_cm3 * inputs.material_density) / 1000.0

        if process_type == "turning":
            stock_diameter_cm, stock_length_cm = self._turning_stock_dims(
                inputs.bbox_x_cm, inputs.bbox_y_cm, inputs.bbox_z_cm
            )
            bar_volume_cm3 = math.pi / 4.0 * stock_diameter_cm**2 * stock_length_cm
            # Parting/facing allowance on bar stock.
            stock_volume_cm3 = max(bar_volume_cm3, inputs.volume_cm3) * 1.05
            buy_weight_kg = (stock_volume_cm3 * inputs.material_density) / 1000.0
            wastage_pct = (buy_weight_kg / raw_weight_kg - 1.0) if raw_weight_kg > 0 else 0.0
            stock_dimensions = {
                "form": "round_bar",
                "diameter_mm": round(stock_diameter_cm * 10.0, 2),
                "length_mm": round(stock_length_cm * 10.0, 2),
            }
        else:
            # Milled parts buy the full billet: bounding box plus a saw/facing
            # allowance per side. Charging only part volume + wastage under-
            # billed material on pocketed parts while machining time still
            # charged for removing the whole envelope.
            allowance_cm = 0.3  # 3 mm per side
            stock_x_cm = inputs.bbox_x_cm + 2 * allowance_cm
            stock_y_cm = inputs.bbox_y_cm + 2 * allowance_cm
            stock_z_cm = inputs.bbox_z_cm + 2 * allowance_cm
            billet_volume_cm3 = stock_x_cm * stock_y_cm * stock_z_cm
            stock_volume_cm3 = max(billet_volume_cm3, inputs.volume_cm3)
            buy_weight_kg = (stock_volume_cm3 * inputs.material_density) / 1000.0
            wastage_pct = (buy_weight_kg / raw_weight_kg - 1.0) if raw_weight_kg > 0 else 0.0
            stock_dimensions = {
                "form": "rectangular_block",
                "x": round(stock_x_cm * 10.0, 2),
                "y": round(stock_y_cm * 10.0, 2),
                "z": round(stock_z_cm * 10.0, 2),
            }

        effective_material_rate = self._normalized_material_rate(
            inputs.material_cost_per_kg,
            inputs.material_name,
            inputs.material_category,
        )
        material_cost_gross = _to_decimal(buy_weight_kg) * effective_material_rate
        scrap_weight_kg = max(buy_weight_kg - raw_weight_kg, 0.0)
        scrap_cost_per_kg = max(inputs.scrap_cost_per_kg, _to_decimal(0))
        scrap_saving_cost = _to_decimal(scrap_weight_kg) * scrap_cost_per_kg
        material_cost = material_cost_gross
        if inputs.include_scrap_saving:
            material_cost = max(material_cost_gross - scrap_saving_cost, _to_decimal(0))

        details["material"] = {
            "raw_weight_kg": round(raw_weight_kg, 4),
            "wastage_pct": round(wastage_pct * 100, 2),
            "buy_weight_kg": round(buy_weight_kg, 4),
            "material_rate_per_kg": float(effective_material_rate),
            "material_cost_gross_per_part": float(material_cost_gross),
            "scrap_weight_kg": round(scrap_weight_kg, 4),
            "scrap_cost_per_kg": float(scrap_cost_per_kg),
            "scrap_saving_cost": float(scrap_saving_cost),
            "scrap_saving_included_in_cost": inputs.include_scrap_saving,
            "material_cost_per_part": float(material_cost),
        }

        details["raw_material"] = {
            "raw_material_stock_dimensions_mm": stock_dimensions,
            "stock_form": stock_dimensions["form"],
            "raw_material_mass_kg": round(raw_weight_kg, 4),
            "raw_material_rate_per_kg": float(effective_material_rate),
            "scrap_weight_kg": round(scrap_weight_kg, 4),
            "scrap_cost_per_kg": float(scrap_cost_per_kg),
            "scrap_saving_cost": float(scrap_saving_cost),
            "scrap_saving_included_in_cost": inputs.include_scrap_saving,
        }

        # B. Machining cost: cycle time = (removal volume / MRR) + feature time + tool change time
        removal_cm3 = max(inputs.bounding_box_volume_cm3 - inputs.volume_cm3, 0.0)
        mrr_min, mrr_max = self.MRR_CM3_PER_MIN.get(material_key, (4.0, 8.0))
        base_mrr = mrr_min + (mrr_max - mrr_min) * (1.0 - complexity_norm)
        adjusted_mrr = max(
            0.5,
            base_mrr * _clamp(inputs.machine_efficiency, 0.1, 1.0) / max(inputs.machining_difficulty_factor, 0.1),
        )

        removal_time_min = removal_cm3 / adjusted_mrr if adjusted_mrr > 0 else 0.0

        hole_seconds, hole_time_breakdown = self._hole_feature_seconds(
            inputs.hole_count, inputs.hole_diameters_mm, complexity_norm
        )
        thread_estimate = max(0, int(round(inputs.hole_count * 0.2)))
        thread_seconds = thread_estimate * (20.0 + (60.0 - 20.0) * complexity_norm)

        pocket_depth_factor = 1.0 + 0.6 * complexity_norm
        pocket_time_min = (
            inputs.surface_area_cm2
            * _clamp(inputs.removal_ratio, 0.2, 1.8)
            * 0.01
            * pocket_depth_factor
        )

        feature_time_min = (hole_seconds + thread_seconds) / 60.0 + pocket_time_min

        tool_change_count = max(1, int(round(1 + complexity_norm * 2 + (inputs.hole_count / 8.0))))
        tool_change_time_per_event_min = 0.8 + 0.7 * complexity_norm
        tool_change_time_min = tool_change_count * tool_change_time_per_event_min

        base_cycle_time_min = removal_time_min + feature_time_min + tool_change_time_min

        # Tolerance tier slows cutting; DFM issues (thin walls, tool access)
        # slow it further via per-rule adjustments instead of a flat surcharge.
        tolerance = self.TOLERANCE_TIERS.get(
            (inputs.tolerance_tier or "general").lower(), self.TOLERANCE_TIERS["general"]
        )
        dfm_adjustments = self._dfm_cost_adjustments(dfm_analysis["issues"])

        tolerance_time_multiplier = float(tolerance["machining_time_multiplier"])
        dfm_cycle_multiplier = 1.0 + _clamp(dfm_adjustments["cycle_time_pct"], 0.0, 40.0) / 100.0
        cycle_time_min = base_cycle_time_min * tolerance_time_multiplier * dfm_cycle_multiplier

        machine_rate_per_hour = self._normalized_machine_rate(inputs.hourly_rate, machine_type)
        machining_cost = _to_decimal(cycle_time_min) * machine_rate_per_hour / _to_decimal(60)

        details["machining"] = {
            "process_type": process_type,
            "machine_type": machine_type,
            "removal_volume_cm3": round(removal_cm3, 4),
            "mrr_cm3_min": round(adjusted_mrr, 4),
            "removal_time_min": round(removal_time_min, 4),
            "feature_time_min": round(feature_time_min, 4),
            "tool_change_count": tool_change_count,
            "tool_change_time_min": round(tool_change_time_min, 4),
            "hole_seconds": round(hole_seconds, 2),
            "hole_time_breakdown": hole_time_breakdown,
            "thread_seconds": round(thread_seconds, 2),
            "pocket_time_min": round(pocket_time_min, 4),
            "base_cycle_time_min": round(base_cycle_time_min, 4),
            "tolerance_time_multiplier": round(tolerance_time_multiplier, 4),
            "dfm_cycle_multiplier": round(dfm_cycle_multiplier, 4),
            "cycle_time_min": round(cycle_time_min, 4),
            "machine_rate_per_hour": float(machine_rate_per_hour),
            "machining_cost_per_part": float(machining_cost),
        }

        # C. Setup cost
        setup_time_hours = _clamp(inputs.setup_time_hours, 0.1, 2.0)
        # Prefer measured orientations (distinct hole-axis directions from the
        # exact B-rep) over the complexity heuristic when they are available.
        if inputs.machining_direction_count and inputs.machining_direction_count > 0:
            base_setups = int(_clamp(float(inputs.machining_direction_count), 1.0, 6.0))
            setup_basis = "brep_machining_directions"
        else:
            base_setups = max(1, int(round(1 + complexity_norm * 1.5)))
            setup_basis = "complexity_estimate"
        number_of_setups = base_setups + int(dfm_adjustments["extra_setups"])
        setup_time_total_hours = setup_time_hours * number_of_setups
        setup_hour_rate_per_hour = max(inputs.setup_hour_rate, _to_decimal(0))
        if setup_hour_rate_per_hour <= 0:
            setup_hour_rate_per_hour = machine_rate_per_hour

        setup_cost_total = _to_decimal(setup_time_total_hours) * setup_hour_rate_per_hour
        setup_cost_per_part = setup_cost_total / _to_decimal(max(inputs.quantity, 1))

        details["setup"] = {
            "setup_time_hours": round(setup_time_hours, 4),
            "setup_time_total_hours": round(setup_time_total_hours, 4),
            "number_of_setups": number_of_setups,
            "setup_basis": setup_basis,
            "setup_hour_rate": float(setup_hour_rate_per_hour),
            "batch_size": inputs.quantity,
            "setup_cost_total": float(setup_cost_total),
            "setup_cost_per_part": float(setup_cost_per_part),
        }

        # C2. CAM/programming time allocation
        cam_time_hours = (
            0.25
            + complexity_norm * 1.25
            + min(inputs.hole_count, 40) * 0.01
            + _clamp(inputs.surface_area_cm2 / 800.0, 0.0, 0.75)
        )
        cam_rate_per_hour = machine_rate_per_hour * _to_decimal(0.35)
        cam_cost_total = _to_decimal(cam_time_hours) * cam_rate_per_hour
        cam_cost_per_part = cam_cost_total / _to_decimal(max(inputs.quantity, 1))

        details["cam_programming"] = {
            "cam_time_hours": round(cam_time_hours, 4),
            "cam_rate_per_hour": float(cam_rate_per_hour),
            "cam_cost_total": float(cam_cost_total),
            "cam_cost_per_part": float(cam_cost_per_part),
            "batch_size": inputs.quantity,
        }

        # D. Tooling cost allocation
        tooling_base = self._tooling_total_cost(material_key)
        tooling_feature_add = inputs.hole_count * 2.0 + complexity_norm * 40.0
        # Large bores need boring bars / interpolation tooling.
        large_hole_count = len([d for d in (inputs.hole_diameters_mm or []) if d > 12.0])
        tooling_feature_add += large_hole_count * 15.0
        tooling_feature_add += dfm_adjustments["tooling_add"]
        tooling_total = _to_decimal(tooling_base + tooling_feature_add)
        tooling_per_part = tooling_total / _to_decimal(max(inputs.quantity, 1))

        details["tooling"] = {
            "tooling_total": float(tooling_total),
            "tooling_cost_per_part": float(tooling_per_part),
        }

        # E. Secondary operation cost
        secondary_per_part = self._secondary_cost(inputs.finish_name)
        finish_area_sq_in = max(inputs.surface_area_cm2 / 6.4516, 0.0)
        finish_area_sq_ft = max(inputs.surface_area_cm2 / 929.0304, 0.0)
        finish_rate_cost_per_part = (
            _to_decimal(max(raw_weight_kg, 0.0)) * max(inputs.finish_rate_per_kg, _to_decimal(0))
            + _to_decimal(finish_area_sq_in) * max(inputs.finish_rate_per_sq_inch, _to_decimal(0))
            + _to_decimal(finish_area_sq_ft) * max(inputs.finish_rate_per_sq_ft, _to_decimal(0))
            + max(inputs.finish_rate_per_piece, _to_decimal(0))
        )

        # Keep compatibility with existing field name `finish_cost`
        finish_cost = (
            secondary_per_part
            + finish_rate_cost_per_part
            + inputs.finish_fixed_cost / _to_decimal(max(inputs.quantity, 1))
        )
        if inputs.finish_cost_multiplier > 1.0:
            finish_cost *= _to_decimal(inputs.finish_cost_multiplier)

        details["secondary_operations"] = {
            "finish_name": inputs.finish_name,
            "secondary_cost_per_part": float(secondary_per_part),
            "finish_rate_cost_per_part": float(finish_rate_cost_per_part),
            "rate_per_kg": float(inputs.finish_rate_per_kg),
            "rate_per_sq_inch": float(inputs.finish_rate_per_sq_inch),
            "rate_per_sq_ft": float(inputs.finish_rate_per_sq_ft),
            "rate_per_piece": float(inputs.finish_rate_per_piece),
            "finish_fixed_cost_allocated": float(inputs.finish_fixed_cost / _to_decimal(max(inputs.quantity, 1))),
            "finish_multiplier": inputs.finish_cost_multiplier,
            "finish_cost_per_part": float(finish_cost),
        }

        # F. Quality cost
        quality_base = self._quality_cost(inputs.inspection_name)
        quality_with_config = quality_base + inputs.inspection_fixed_cost / _to_decimal(max(inputs.quantity, 1))
        if inputs.inspection_percentage_cost > 0:
            base_for_pct = material_cost + machining_cost + setup_cost_per_part
            quality_with_config += base_for_pct * _to_decimal(inputs.inspection_percentage_cost / 100.0)

        tolerance_inspection_multiplier = float(tolerance["inspection_multiplier"])
        dfm_inspection_multiplier = 1.0 + _clamp(dfm_adjustments["inspection_pct"], 0.0, 25.0) / 100.0
        inspection_cost = (
            quality_with_config
            * _to_decimal(tolerance_inspection_multiplier)
            * _to_decimal(dfm_inspection_multiplier)
        )

        details["quality"] = {
            "inspection_level": inputs.inspection_name,
            "base_quality_cost_per_part": float(quality_base),
            "inspection_fixed_cost_allocated": float(inputs.inspection_fixed_cost / _to_decimal(max(inputs.quantity, 1))),
            "inspection_percentage_cost": inputs.inspection_percentage_cost,
            "tolerance_inspection_multiplier": round(tolerance_inspection_multiplier, 4),
            "dfm_inspection_multiplier": round(dfm_inspection_multiplier, 4),
            "inspection_cost_per_part": float(inspection_cost),
        }

        details["tolerance"] = {
            "tier": (inputs.tolerance_tier or "general").lower(),
            "label": tolerance["label"],
            "machining_time_multiplier": round(tolerance_time_multiplier, 4),
            "inspection_multiplier": round(tolerance_inspection_multiplier, 4),
            "lead_time_add_days": float(tolerance["lead_time_add_days"]),
        }

        # Core manufacturing subtotal per part
        direct_cost_per_part = (
            material_cost
            + machining_cost
            + setup_cost_per_part
            + cam_cost_per_part
            + tooling_per_part
            + finish_cost
            + inspection_cost
        )

        details["manufacturing_charges"] = {
            "cycle_time_formula": "(material_removal_volume / mrr) + feature_time + tool_change_time",
            "material_removal_volume_cm3": round(removal_cm3, 4),
            "mrr_cm3_min": round(adjusted_mrr, 4),
            "removal_time_min": round(removal_time_min, 4),
            "feature_time_min": round(feature_time_min, 4),
            "tool_change_time_min": round(tool_change_time_min, 4),
            "cycle_time_min": round(cycle_time_min, 4),
            "machine_hour_rate": float(machine_rate_per_hour),
            "setup_cost_per_part_formula": "(setup_time_hours * machine_rate_per_hour) / batch_size",
            "setup_cost_total_formula": "setup_time_total_hours * machine_rate_per_hour",
            "setup_time_total_hours": round(setup_time_total_hours, 4),
            "number_of_setups": number_of_setups,
            "setup_hour_rate": float(setup_hour_rate_per_hour),
            "setup_cost_per_part": float(setup_cost_per_part),
            "cam_cost_formula": "cam_time_hours * cam_rate_per_hour / batch_size",
            "cam_cost_per_part": float(cam_cost_per_part),
        }

        # G. Overheads
        vendor_oh = _clamp(inputs.vendor_overhead_pct, 10.0, 20.0) / 100.0
        platform_oh = _clamp(inputs.platform_overhead_pct, 5.0, 10.0) / 100.0
        overhead_multiplier = 1.0 + vendor_oh + platform_oh
        after_overhead_cost = direct_cost_per_part * _to_decimal(overhead_multiplier)

        # H. Scrap and risk
        risk_multiplier = 1.0 + (_clamp(inputs.risk_factor_pct, 5.0, 20.0) / 100.0)
        risk_adjusted_cost = after_overhead_cost * _to_decimal(risk_multiplier)

        # Most DFM consequences are already priced in as cycle time, tooling,
        # setups and inspection above; only hard-to-model residual risk stays
        # as a percentage surcharge.
        dfm_penalty_pct = _clamp(dfm_adjustments["risk_pct"], 0.0, 10.0)
        if dfm_analysis["has_blocking_issue"]:
            dfm_penalty_pct = max(dfm_penalty_pct, 3.0)
        dfm_multiplier = 1.0 + (dfm_penalty_pct / 100.0)
        dfm_adjusted_cost = risk_adjusted_cost * _to_decimal(dfm_multiplier)

        # Per-issue cost attribution so customers can see what fixing each
        # DFM issue would roughly save (per part).
        base_cycle_cost = base_cycle_time_min * tolerance_time_multiplier * float(machine_rate_per_hour) / 60.0
        setup_cost_per_setup = setup_time_hours * float(setup_hour_rate_per_hour) / max(inputs.quantity, 1)
        issue_cost_impacts: List[Dict[str, Any]] = []
        for impact in dfm_adjustments["per_issue"]:
            estimated_cost = (
                base_cycle_cost * impact["cycle_time_pct"] / 100.0
                + impact["tooling_add"] / max(inputs.quantity, 1)
                + impact["extra_setups"] * setup_cost_per_setup
                + float(quality_with_config) * impact["inspection_pct"] / 100.0
                + float(risk_adjusted_cost) * impact["risk_pct"] / 100.0
            )
            issue_cost_impacts.append(
                {
                    "code": impact["code"],
                    "title": impact["title"],
                    "severity": impact["severity"],
                    "reason": impact["reason"],
                    "estimated_cost_per_part": round(estimated_cost, 2),
                }
            )

        details["overheads_and_risk"] = {
            "vendor_overhead_pct": round(vendor_oh * 100, 2),
            "platform_overhead_pct": round(platform_oh * 100, 2),
            "risk_factor_pct": round((risk_multiplier - 1.0) * 100, 2),
            "cost_after_overheads_per_part": float(after_overhead_cost),
            "risk_adjusted_cost_per_part": float(risk_adjusted_cost),
        }
        details["dfm"] = {
            "analysis": dfm_analysis,
            "penalty_pct": round(dfm_penalty_pct, 2),
            "penalty_multiplier": round(dfm_multiplier, 4),
            "cycle_time_pct": round(_clamp(dfm_adjustments["cycle_time_pct"], 0.0, 40.0), 2),
            "tooling_add": round(dfm_adjustments["tooling_add"], 2),
            "extra_setups": int(dfm_adjustments["extra_setups"]),
            "inspection_pct": round(_clamp(dfm_adjustments["inspection_pct"], 0.0, 25.0), 2),
            "issue_cost_impacts": issue_cost_impacts,
            "cost_after_dfm_per_part": float(dfm_adjusted_cost),
        }

        # Marketplace pricing layer
        vendor_margin = max(0.0, inputs.vendor_margin_pct) / 100.0
        platform_commission = max(0.0, inputs.platform_commission_pct) / 100.0

        vendor_price = dfm_adjusted_cost * _to_decimal(1.0 + vendor_margin)
        customer_price = vendor_price * _to_decimal(1.0 + platform_commission)

        dynamic_multiplier = self._dynamic_load_multiplier(inputs.vendor_load_pct)
        normalized_urgent_pct = self._normalized_urgent_pct(inputs.urgent_factor_pct)
        surge_multiplier = 1.0 + normalized_urgent_pct / 100.0
        negotiation_multiplier = 1.0 + _clamp(inputs.negotiation_buffer_pct, 5.0, 10.0) / 100.0

        priced_unit_before_moq = (
            customer_price
            * _to_decimal(dynamic_multiplier)
            * _to_decimal(surge_multiplier)
            * _to_decimal(negotiation_multiplier)
        )

        # Deep-volume discount on the unit price at large batch sizes.
        volume_discount_pct = next(
            (discount for threshold, discount in self.VOLUME_DISCOUNT_TIERS if inputs.quantity >= threshold),
            0.0,
        )
        if volume_discount_pct > 0:
            priced_unit_before_moq *= _to_decimal(1.0 - volume_discount_pct)

        # MOQ logic on total order value
        total_before_moq = priced_unit_before_moq * _to_decimal(inputs.quantity)
        min_order = inputs.min_order_value
        total_price = total_before_moq
        if total_price < min_order:
            total_price = min_order

        unit_price = total_price / _to_decimal(max(inputs.quantity, 1))

        effective_margin_factor = float(unit_price / direct_cost_per_part) if direct_cost_per_part > 0 else 1.0

        details["marketplace"] = {
            "vendor_margin_pct": round(vendor_margin * 100, 2),
            "platform_commission_pct": round(platform_commission * 100, 2),
            "vendor_load_pct": round(inputs.vendor_load_pct, 2),
            "dynamic_multiplier": round(dynamic_multiplier, 4),
            "surge_multiplier": round(surge_multiplier, 4),
            "urgent_factor_pct": round(normalized_urgent_pct, 2),
            "negotiation_buffer_pct": round(_clamp(inputs.negotiation_buffer_pct, 5.0, 10.0), 2),
            "volume_discount_pct": round(volume_discount_pct * 100, 2),
            "min_order_value": float(min_order),
            "priced_unit_before_moq": float(priced_unit_before_moq),
            "total_before_moq": float(total_before_moq),
            "moq_shortfall": float(max(total_price - total_before_moq, Decimal("0"))),
            "moq_applied": total_price > total_before_moq,
        }

        details["margin"] = {
            "subtotal_per_unit": float(direct_cost_per_part),
            "margin_factor": round(effective_margin_factor, 4),
            "unit_price_before_discount": float(unit_price),
        }

        details["quantity"] = {
            "quantity": inputs.quantity,
            "discount_percentage": 0.0,
            "unit_price": float(unit_price),
            "total_price": float(total_price),
        }

        # Lead time
        machining_hours_total = (cycle_time_min * inputs.quantity) / 60.0 + setup_time_hours
        machining_days = machining_hours_total / max(6.5 * _clamp(inputs.machine_efficiency, 0.1, 1.0), 1.0)
        lead_time_days = (
            max(1.0, inputs.material_availability_factor)
            + machining_days
            + inputs.finish_lead_time_days
            + inputs.inspection_lead_time_days
            + float(tolerance["lead_time_add_days"])
        )

        dfm_lead_time_add = 0.0
        if dfm_analysis["has_blocking_issue"]:
            dfm_lead_time_add += 1.0
        if dfm_analysis["score"] < 70:
            dfm_lead_time_add += 0.5
        lead_time_days += dfm_lead_time_add

        # Urgent jobs reduce lead time at the expense of surcharge
        if normalized_urgent_pct > 0:
            lead_time_days *= 0.85

        estimated_lead_time = max(1.0, round(lead_time_days * 2) / 2)

        details["lead_time"] = {
            "machining_hours_total": round(machining_hours_total, 3),
            "finish_lead_time_days": inputs.finish_lead_time_days,
            "inspection_lead_time_days": inputs.inspection_lead_time_days,
            "dfm_lead_time_add_days": dfm_lead_time_add,
            "material_availability_factor": inputs.material_availability_factor,
            "estimated_lead_time_days": estimated_lead_time,
        }

        def round_price(value: Decimal) -> Decimal:
            return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

        return PricingResult(
            material_cost=round_price(material_cost),
            machining_cost=round_price(machining_cost + setup_cost_per_part + cam_cost_per_part + tooling_per_part),
            finish_cost=round_price(finish_cost),
            inspection_cost=round_price(inspection_cost),
            subtotal=round_price(direct_cost_per_part),
            total_price=round_price(total_price),
            unit_price=round_price(unit_price),
            estimated_lead_time_days=estimated_lead_time,
            details=details,
        )

    def _turning_stock_dims(self, bbox_x_cm: float, bbox_y_cm: float, bbox_z_cm: float) -> tuple:
        """
        Round bar stock for a turned part: the turning axis is the dimension
        whose two perpendicular dimensions are most similar (round
        cross-section). Returns (diameter_cm, length_cm).
        """
        dims = [max(bbox_x_cm, 0.01), max(bbox_y_cm, 0.01), max(bbox_z_cm, 0.01)]
        best_axis = 0
        best_mismatch = float("inf")
        for axis in range(3):
            cross = [dims[i] for i in range(3) if i != axis]
            mismatch = abs(cross[0] - cross[1]) / max(cross[0], cross[1])
            if mismatch < best_mismatch:
                best_mismatch = mismatch
                best_axis = axis

        length_cm = dims[best_axis]
        diameter_cm = max(d for i, d in enumerate(dims) if i != best_axis)
        return diameter_cm, length_cm

    def _hole_feature_seconds(
        self,
        hole_count: int,
        hole_diameters_mm: Optional[List[float]],
        complexity_norm: float,
    ) -> tuple:
        """
        Drilling/boring time per hole, sized by fitted diameter when known.
        Small drills are delicate (pecking), large bores need interpolation
        or boring bars; mid-range twist drills are fastest.
        """
        default_seconds = 5.0 + (15.0 - 5.0) * complexity_norm
        if not hole_diameters_mm:
            return hole_count * default_seconds, {
                "small": 0,
                "medium": hole_count,
                "large": 0,
                "sized_from_cad": False,
            }

        small = medium = large = 0
        total_seconds = 0.0
        for diameter in hole_diameters_mm:
            if diameter < 3.0:
                small += 1
                total_seconds += 12.0 + 10.0 * complexity_norm
            elif diameter <= 12.0:
                medium += 1
                total_seconds += 5.0 + 10.0 * complexity_norm
            else:
                large += 1
                total_seconds += 25.0 + 35.0 * complexity_norm

        # Holes counted but without a fitted diameter get the default time.
        unsized = max(hole_count - len(hole_diameters_mm), 0)
        medium += unsized
        total_seconds += unsized * default_seconds

        return total_seconds, {
            "small": small,
            "medium": medium,
            "large": large,
            "sized_from_cad": True,
        }

    def _dfm_cost_adjustments(self, issues: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Convert DFM issues into concrete cost adjustments per rule."""
        totals = {
            "cycle_time_pct": 0.0,
            "tooling_add": 0.0,
            "extra_setups": 0,
            "inspection_pct": 0.0,
            "risk_pct": 0.0,
        }
        per_issue: List[Dict[str, Any]] = []

        for issue in issues:
            rule = self.DFM_COST_RULES.get(issue["code"])
            if rule is None:
                # Unmapped rules fall back to a small residual surcharge.
                rule = {"risk_pct": min(issue.get("penalty", 5) * 0.15, 3.0), "reason": issue.get("recommendation", "")}

            entry = {
                "code": issue["code"],
                "title": issue.get("title", issue["code"]),
                "severity": issue.get("severity", "info"),
                "reason": rule.get("reason", ""),
                "cycle_time_pct": float(rule.get("cycle_time_pct", 0.0)),
                "tooling_add": float(rule.get("tooling_add", 0.0)),
                "extra_setups": int(rule.get("extra_setups", 0)),
                "inspection_pct": float(rule.get("inspection_pct", 0.0)),
                "risk_pct": float(rule.get("risk_pct", 0.0)),
            }
            per_issue.append(entry)

            totals["cycle_time_pct"] += entry["cycle_time_pct"]
            totals["tooling_add"] += entry["tooling_add"]
            totals["extra_setups"] += entry["extra_setups"]
            totals["inspection_pct"] += entry["inspection_pct"]
            totals["risk_pct"] += entry["risk_pct"]

        totals["extra_setups"] = min(totals["extra_setups"], 2)
        totals["per_issue"] = per_issue
        return totals

    def _infer_machine_type(self, machine_name: str) -> str:
        name = (machine_name or "").lower()
        if "5-axis" in name or "5 axis" in name:
            return "5-axis"
        if "lathe" in name or "turn" in name:
            return "lathe"
        return "3-axis"

    def _infer_process(self, machine_name: str, removal_ratio: float) -> str:
        name = (machine_name or "").lower()
        if "lathe" in name or "turn" in name:
            return "turning"
        if removal_ratio < 0.25:
            return "turning"
        return "milling"

    def _infer_material_key(self, material_name: str, material_category: str) -> str:
        combined = f"{material_name} {material_category}".lower()
        if "aluminum" in combined or "aluminium" in combined:
            return "aluminum"
        if "stainless" in combined:
            return "stainless"
        if "steel" in combined or "en8" in combined:
            return "steel"
        if "brass" in combined:
            return "brass"
        if "plastic" in combined or "peek" in combined or "nylon" in combined or "pom" in combined:
            return "plastic"
        if "titanium" in combined:
            return "titanium"
        return "steel"

    def _normalized_machine_rate(self, configured_rate: Decimal, machine_type: str) -> Decimal:
        min_rate, max_rate = self.MACHINE_RATES[machine_type]
        rate = float(configured_rate)

        # Existing seed data may still carry legacy inflated rates.
        if rate > 3000:
            rate = rate / 10.0

        rate = _clamp(rate, min_rate, max_rate)
        return _to_decimal(rate)

    def _normalized_material_rate(
        self,
        configured_rate: Decimal,
        material_name: str,
        material_category: str,
    ) -> Decimal:
        key = f"{material_name} {material_category}".lower()
        for benchmark_key, (min_rate, max_rate) in self.MATERIAL_RATE_BENCHMARKS.items():
            if benchmark_key in key:
                rate = _clamp(float(configured_rate), min_rate, max_rate)
                return _to_decimal(rate)
        return configured_rate

    def _tooling_total_cost(self, material_key: str) -> float:
        if material_key == "aluminum":
            return 120.0
        if material_key in {"steel", "brass"}:
            return 200.0
        if material_key == "stainless":
            return 350.0
        if material_key == "titanium":
            return 500.0
        if material_key == "plastic":
            return 100.0
        return 200.0

    def _secondary_cost(self, finish_name: str) -> Decimal:
        finish = (finish_name or "").lower()

        for key, (min_cost, max_cost) in self.SECONDARY_OP_COST.items():
            if key in finish:
                return _to_decimal((min_cost + max_cost) / 2.0)

        # Fallback for non-standard finishes from config
        if "bead" in finish:
            return _to_decimal(20.0)
        if "passivat" in finish:
            return _to_decimal(25.0)
        if "polish" in finish:
            return _to_decimal(30.0)
        return _to_decimal(0.0)

    def _quality_cost(self, inspection_name: str) -> Decimal:
        inspection = (inspection_name or "").lower()
        if "cmm" in inspection:
            min_cost, max_cost = self.QUALITY_COST["cmm"]
        elif "dimensional" in inspection or "vernier" in inspection or "gauge" in inspection:
            min_cost, max_cost = self.QUALITY_COST["vernier"]
        else:
            min_cost, max_cost = self.QUALITY_COST["basic"]
        return _to_decimal((min_cost + max_cost) / 2.0)

    def _dynamic_load_multiplier(self, vendor_load_pct: float) -> float:
        load = _clamp(vendor_load_pct, 0.0, 100.0)
        if load < 40.0:
            # Up to 10% cheaper when load is very low
            return 1.0 - (40.0 - load) / 40.0 * 0.10
        if load > 80.0:
            # 10% to 20% uplift once load crosses 80%
            return 1.10 + (load - 80.0) / 20.0 * 0.10
        return 1.0

    def _normalized_urgent_pct(self, urgent_factor_pct: float) -> float:
        urgent = _clamp(urgent_factor_pct, 0.0, 100.0)
        if urgent <= 0.0:
            return 0.0
        # Default urgent lane at +25%, super urgent capped at +40%.
        if urgent < 25.0:
            return 25.0
        return _clamp(urgent, 25.0, 40.0)


# Global pricing engine instance
pricing_engine = PricingEngine()


async def calculate_pricing(
    db: AsyncSession,
    geometry: GeometryAnalysis,
    material: Material,
    surface_finish: SurfaceFinish,
    inspection_level: InspectionLevel,
    quantity: int = 1,
    margin_factor: Optional[float] = None,
    pricing_overrides: Optional[Dict[str, Any]] = None,
    tolerance_tier: str = "general",
    include_quantity_breaks: bool = True,
) -> PricingResult:
    """Calculate pricing for a CNC job and return a detailed breakdown."""
    default_query = (
        select(MachineRate)
        .where(MachineRate.is_default == True, MachineRate.is_active == True)
        .order_by(MachineRate.updated_at.desc())
    )
    default_result = await db.execute(default_query)
    machine_rate = default_result.scalars().first()

    if machine_rate is None:
        fallback_query = (
            select(MachineRate)
            .where(MachineRate.is_active == True)
            .order_by(MachineRate.is_default.desc(), MachineRate.updated_at.desc())
        )
        fallback_result = await db.execute(fallback_query)
        machine_rate = fallback_result.scalars().first()

    if machine_rate:
        machine_name = machine_rate.name
        hourly_rate = machine_rate.hourly_rate
        setup_hour_rate = machine_rate.setup_hour_rate
        machine_efficiency = machine_rate.efficiency_rate
        setup_time = machine_rate.setup_time_hours
    else:
        machine_name = "Standard 3-Axis CNC Mill"
        hourly_rate = _to_decimal(settings.DEFAULT_HOURLY_MACHINE_RATE)
        setup_hour_rate = hourly_rate
        machine_efficiency = settings.DEFAULT_MACHINE_EFFICIENCY
        setup_time = 0.5

    # Existing fields (backward compatible)
    material_cost_per_kg = material.cost_per_kg
    material_density = material.density
    material_machining_difficulty_factor = material.machining_difficulty_factor
    material_scrap_cost_per_kg = getattr(material, "scrap_cost_per_kg", _to_decimal(30))
    finish_cost_multiplier = surface_finish.cost_multiplier
    finish_fixed_cost = surface_finish.fixed_cost
    finish_rate_per_kg = getattr(surface_finish, "rate_per_kg", _to_decimal(0))
    finish_rate_per_sq_inch = getattr(surface_finish, "rate_per_sq_inch", _to_decimal(0))
    finish_rate_per_sq_ft = getattr(surface_finish, "rate_per_sq_ft", _to_decimal(0))
    finish_rate_per_piece = getattr(surface_finish, "rate_per_piece", _to_decimal(0))
    inspection_fixed_cost = inspection_level.fixed_cost
    inspection_percentage_cost = inspection_level.percentage_cost

    # New marketplace parameters
    vendor_margin_pct = 18.0
    platform_commission_pct = 8.0
    vendor_overhead_pct = 15.0
    platform_overhead_pct = 7.0
    vendor_load_pct = 70.0
    urgent_factor_pct = 0.0
    negotiation_buffer_pct = 7.0
    scrap_cost_per_kg = _to_decimal(material_scrap_cost_per_kg)
    include_scrap_saving = True

    complexity_risk = _clamp(((geometry.complexity_score - 14.0) / 20.0) * 8.0, 0.0, 8.0)
    inferred_risk_pct = _clamp(
        5.0 + complexity_risk + (5.0 if inspection_level.includes_cmm_report else 0.0),
        5.0,
        20.0,
    )

    # Default MOQ is disabled so totals scale naturally with quantity.
    # If needed, MOQ can still be applied through pricing_overrides.min_order_value.
    min_order_value = _to_decimal(0)

    applied_overrides: Dict[str, Any] = {}
    if pricing_overrides:
        # Existing override fields
        if pricing_overrides.get("material_cost_per_kg") is not None:
            material_cost_per_kg = _to_decimal(pricing_overrides["material_cost_per_kg"])
            applied_overrides["material_cost_per_kg"] = float(material_cost_per_kg)

        if pricing_overrides.get("material_density") is not None:
            material_density = float(pricing_overrides["material_density"])
            applied_overrides["material_density"] = material_density

        if pricing_overrides.get("material_machining_difficulty_factor") is not None:
            material_machining_difficulty_factor = float(pricing_overrides["material_machining_difficulty_factor"])
            applied_overrides["material_machining_difficulty_factor"] = material_machining_difficulty_factor

        if pricing_overrides.get("scrap_cost_per_kg") is not None:
            scrap_cost_per_kg = _to_decimal(pricing_overrides["scrap_cost_per_kg"])
            applied_overrides["scrap_cost_per_kg"] = float(scrap_cost_per_kg)

        if pricing_overrides.get("include_scrap_saving") is not None:
            include_scrap_saving = bool(pricing_overrides["include_scrap_saving"])
            applied_overrides["include_scrap_saving"] = include_scrap_saving

        if pricing_overrides.get("surface_finish_fixed_cost") is not None:
            finish_fixed_cost = _to_decimal(pricing_overrides["surface_finish_fixed_cost"])
            applied_overrides["surface_finish_fixed_cost"] = float(finish_fixed_cost)

        if pricing_overrides.get("surface_finish_cost_multiplier") is not None:
            finish_cost_multiplier = float(pricing_overrides["surface_finish_cost_multiplier"])
            applied_overrides["surface_finish_cost_multiplier"] = finish_cost_multiplier

        if pricing_overrides.get("surface_finish_rate_per_kg") is not None:
            finish_rate_per_kg = _to_decimal(pricing_overrides["surface_finish_rate_per_kg"])
            applied_overrides["surface_finish_rate_per_kg"] = float(finish_rate_per_kg)

        if pricing_overrides.get("surface_finish_rate_per_sq_inch") is not None:
            finish_rate_per_sq_inch = _to_decimal(pricing_overrides["surface_finish_rate_per_sq_inch"])
            applied_overrides["surface_finish_rate_per_sq_inch"] = float(finish_rate_per_sq_inch)

        if pricing_overrides.get("surface_finish_rate_per_sq_ft") is not None:
            finish_rate_per_sq_ft = _to_decimal(pricing_overrides["surface_finish_rate_per_sq_ft"])
            applied_overrides["surface_finish_rate_per_sq_ft"] = float(finish_rate_per_sq_ft)

        if pricing_overrides.get("surface_finish_rate_per_piece") is not None:
            finish_rate_per_piece = _to_decimal(pricing_overrides["surface_finish_rate_per_piece"])
            applied_overrides["surface_finish_rate_per_piece"] = float(finish_rate_per_piece)

        if pricing_overrides.get("inspection_fixed_cost") is not None:
            inspection_fixed_cost = _to_decimal(pricing_overrides["inspection_fixed_cost"])
            applied_overrides["inspection_fixed_cost"] = float(inspection_fixed_cost)

        if pricing_overrides.get("inspection_percentage_cost") is not None:
            inspection_percentage_cost = float(pricing_overrides["inspection_percentage_cost"])
            applied_overrides["inspection_percentage_cost"] = inspection_percentage_cost

        if pricing_overrides.get("machine_hourly_rate") is not None:
            hourly_rate = _to_decimal(pricing_overrides["machine_hourly_rate"])
            applied_overrides["machine_hourly_rate"] = float(hourly_rate)

        if pricing_overrides.get("machine_setup_hourly_rate") is not None:
            setup_hour_rate = _to_decimal(pricing_overrides["machine_setup_hourly_rate"])
            applied_overrides["machine_setup_hourly_rate"] = float(setup_hour_rate)

        if pricing_overrides.get("machine_efficiency_rate") is not None:
            machine_efficiency = float(pricing_overrides["machine_efficiency_rate"])
            applied_overrides["machine_efficiency_rate"] = machine_efficiency

        if pricing_overrides.get("machine_setup_time_hours") is not None:
            setup_time = float(pricing_overrides["machine_setup_time_hours"])
            applied_overrides["machine_setup_time_hours"] = setup_time

        # `margin_factor` was old API field; keep it as vendor margin multiplier if supplied.
        if pricing_overrides.get("margin_factor") is not None:
            vendor_margin_pct = max(0.0, (float(pricing_overrides["margin_factor"]) - 1.0) * 100.0)
            applied_overrides["margin_factor"] = float(pricing_overrides["margin_factor"])

        # New override fields
        if pricing_overrides.get("vendor_margin_pct") is not None:
            vendor_margin_pct = float(pricing_overrides["vendor_margin_pct"])
            applied_overrides["vendor_margin_pct"] = vendor_margin_pct

        if pricing_overrides.get("platform_commission_pct") is not None:
            platform_commission_pct = float(pricing_overrides["platform_commission_pct"])
            applied_overrides["platform_commission_pct"] = platform_commission_pct

        if pricing_overrides.get("vendor_overhead_pct") is not None:
            vendor_overhead_pct = float(pricing_overrides["vendor_overhead_pct"])
            applied_overrides["vendor_overhead_pct"] = vendor_overhead_pct

        if pricing_overrides.get("platform_overhead_pct") is not None:
            platform_overhead_pct = float(pricing_overrides["platform_overhead_pct"])
            applied_overrides["platform_overhead_pct"] = platform_overhead_pct

        if pricing_overrides.get("risk_factor_pct") is not None:
            inferred_risk_pct = float(pricing_overrides["risk_factor_pct"])
            applied_overrides["risk_factor_pct"] = inferred_risk_pct

        if pricing_overrides.get("vendor_load_pct") is not None:
            vendor_load_pct = float(pricing_overrides["vendor_load_pct"])
            applied_overrides["vendor_load_pct"] = vendor_load_pct

        if pricing_overrides.get("urgent_factor_pct") is not None:
            urgent_factor_pct = float(pricing_overrides["urgent_factor_pct"])
            applied_overrides["urgent_factor_pct"] = urgent_factor_pct

        if pricing_overrides.get("negotiation_buffer_pct") is not None:
            negotiation_buffer_pct = float(pricing_overrides["negotiation_buffer_pct"])
            applied_overrides["negotiation_buffer_pct"] = negotiation_buffer_pct

        if pricing_overrides.get("min_order_value") is not None:
            min_order_value = _to_decimal(pricing_overrides["min_order_value"])
            applied_overrides["min_order_value"] = float(min_order_value)

        if pricing_overrides.get("machine_name"):
            machine_name = str(pricing_overrides["machine_name"])
            applied_overrides["machine_name"] = machine_name

        if pricing_overrides.get("tolerance_tier"):
            tolerance_tier = str(pricing_overrides["tolerance_tier"]).lower()
            applied_overrides["tolerance_tier"] = tolerance_tier

    # Optional explicit margin_factor function arg, preserved for compatibility.
    if margin_factor is not None:
        vendor_margin_pct = max(0.0, (float(margin_factor) - 1.0) * 100.0)
        applied_overrides["margin_factor"] = float(margin_factor)

    inputs = PricingInputs(
        volume_cm3=geometry.volume,
        surface_area_cm2=geometry.surface_area,
        bounding_box_volume_cm3=geometry.bounding_box_volume,
        bbox_x_cm=geometry.bbox_x,
        bbox_y_cm=geometry.bbox_y,
        bbox_z_cm=geometry.bbox_z,
        complexity_score=geometry.complexity_score,
        removal_ratio=geometry.removal_ratio,
        hole_count=geometry.hole_count,
        hole_diameters_mm=getattr(geometry, "hole_diameters_mm", None),
        machining_direction_count=getattr(geometry, "machining_direction_count", None),
        min_wall_thickness_mm=geometry.min_wall_thickness,
        triangle_count=geometry.triangle_count,
        material_name=material.name,
        material_category=material.category,
        material_density=material_density,
        material_cost_per_kg=material_cost_per_kg,
        machining_difficulty_factor=material_machining_difficulty_factor,
        material_availability_factor=material.availability_factor,
        scrap_cost_per_kg=scrap_cost_per_kg,
        include_scrap_saving=include_scrap_saving,
        finish_name=surface_finish.name,
        finish_cost_multiplier=finish_cost_multiplier,
        finish_fixed_cost=finish_fixed_cost,
        finish_rate_per_kg=finish_rate_per_kg,
        finish_rate_per_sq_inch=finish_rate_per_sq_inch,
        finish_rate_per_sq_ft=finish_rate_per_sq_ft,
        finish_rate_per_piece=finish_rate_per_piece,
        finish_lead_time_days=surface_finish.lead_time_addition_days,
        inspection_name=inspection_level.name,
        inspection_fixed_cost=inspection_fixed_cost,
        inspection_percentage_cost=inspection_percentage_cost,
        inspection_lead_time_days=inspection_level.lead_time_addition_days,
        machine_name=machine_name,
        hourly_rate=hourly_rate,
        setup_hour_rate=setup_hour_rate,
        machine_efficiency=machine_efficiency,
        setup_time_hours=setup_time,
        quantity=quantity,
        vendor_margin_pct=vendor_margin_pct,
        platform_commission_pct=platform_commission_pct,
        vendor_overhead_pct=vendor_overhead_pct,
        platform_overhead_pct=platform_overhead_pct,
        risk_factor_pct=inferred_risk_pct,
        vendor_load_pct=vendor_load_pct,
        urgent_factor_pct=urgent_factor_pct,
        negotiation_buffer_pct=negotiation_buffer_pct,
        min_order_value=min_order_value,
        tolerance_tier=(tolerance_tier or "general").lower(),
    )

    result = pricing_engine.calculate_price(inputs)
    if applied_overrides:
        result.details["pricing_overrides"] = applied_overrides

    if include_quantity_breaks:
        # Fixed costs (setup, CAM, tooling) amortize with quantity; expose
        # the standard break points so customers can compare unit economics.
        break_quantities = sorted({1, 10, 50, 100, quantity})
        quantity_breaks: List[Dict[str, Any]] = []
        for break_qty in break_quantities:
            break_result = (
                result
                if break_qty == quantity
                else pricing_engine.calculate_price(replace(inputs, quantity=break_qty))
            )
            quantity_breaks.append(
                {
                    "quantity": break_qty,
                    "unit_price": float(break_result.unit_price),
                    "total_price": float(break_result.total_price),
                    "lead_time_days": float(break_result.estimated_lead_time_days),
                    "is_selected": break_qty == quantity,
                }
            )
        base_unit = quantity_breaks[0]["unit_price"] if quantity_breaks else 0.0
        for entry in quantity_breaks:
            entry["savings_pct_vs_single"] = (
                round((1.0 - entry["unit_price"] / base_unit) * 100.0, 1) if base_unit > 0 else 0.0
            )
        result.details["quantity_breaks"] = quantity_breaks

    return result
