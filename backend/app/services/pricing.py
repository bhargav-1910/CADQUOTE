"""Rule-based CNC pricing engine with India-focused benchmark ranges."""
from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, Any, Optional
from dataclasses import dataclass

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
    min_wall_thickness_mm: Optional[float]
    triangle_count: Optional[int]

    # Material
    material_name: str
    material_category: str
    material_density: float  # g/cm^3
    material_cost_per_kg: Decimal
    machining_difficulty_factor: float
    material_availability_factor: float

    # Finish
    finish_name: str
    finish_cost_multiplier: float
    finish_fixed_cost: Decimal
    finish_lead_time_days: float

    # Inspection
    inspection_name: str
    inspection_fixed_cost: Decimal
    inspection_percentage_cost: float
    inspection_lead_time_days: float

    # Machine
    machine_name: str
    hourly_rate: Decimal
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
        "3-axis": (500.0, 800.0),
        "5-axis": (2000.0, 3000.0),
        "lathe": (400.0, 600.0),
    }

    MRR_CM3_PER_MIN = {
        "aluminum": (8.0, 15.0),
        "steel": (3.0, 6.0),
        "stainless": (3.0, 6.0),
        "brass": (6.0, 10.0),
        "plastic": (12.0, 22.0),
        "titanium": (2.0, 4.0),
    }

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

        # A. Material cost
        raw_weight_kg = (inputs.volume_cm3 * inputs.material_density) / 1000.0
        wastage_range = (0.10, 0.25) if process_type == "milling" else (0.05, 0.15)
        wastage_pct = wastage_range[0] + (wastage_range[1] - wastage_range[0]) * complexity_norm
        buy_weight_kg = raw_weight_kg * (1.0 + wastage_pct)
        effective_material_rate = self._normalized_material_rate(
            inputs.material_cost_per_kg,
            inputs.material_name,
            inputs.material_category,
        )
        material_cost = _to_decimal(buy_weight_kg) * effective_material_rate

        details["material"] = {
            "raw_weight_kg": round(raw_weight_kg, 4),
            "wastage_pct": round(wastage_pct * 100, 2),
            "buy_weight_kg": round(buy_weight_kg, 4),
            "material_rate_per_kg": float(effective_material_rate),
            "material_cost_per_part": float(material_cost),
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

        hole_seconds = inputs.hole_count * (5.0 + (15.0 - 5.0) * complexity_norm)
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

        cycle_time_min = removal_time_min + feature_time_min + tool_change_time_min

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
            "thread_seconds": round(thread_seconds, 2),
            "pocket_time_min": round(pocket_time_min, 4),
            "cycle_time_min": round(cycle_time_min, 4),
            "machine_rate_per_hour": float(machine_rate_per_hour),
            "machining_cost_per_part": float(machining_cost),
        }

        # C. Setup cost
        setup_time_hours = _clamp(inputs.setup_time_hours, 0.1, 2.0)
        setup_cost_total = _to_decimal(setup_time_hours) * machine_rate_per_hour
        setup_cost_per_part = setup_cost_total / _to_decimal(max(inputs.quantity, 1))

        details["setup"] = {
            "setup_time_hours": round(setup_time_hours, 4),
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
        tooling_total = _to_decimal(tooling_base + tooling_feature_add)
        tooling_per_part = tooling_total / _to_decimal(max(inputs.quantity, 1))

        details["tooling"] = {
            "tooling_total": float(tooling_total),
            "tooling_cost_per_part": float(tooling_per_part),
        }

        # E. Secondary operation cost
        secondary_per_part = self._secondary_cost(inputs.finish_name)

        # Keep compatibility with existing field name `finish_cost`
        finish_cost = secondary_per_part + inputs.finish_fixed_cost / _to_decimal(max(inputs.quantity, 1))
        if inputs.finish_cost_multiplier > 1.0:
            finish_cost *= _to_decimal(inputs.finish_cost_multiplier)

        details["secondary_operations"] = {
            "finish_name": inputs.finish_name,
            "secondary_cost_per_part": float(secondary_per_part),
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

        inspection_cost = quality_with_config

        details["quality"] = {
            "inspection_level": inputs.inspection_name,
            "base_quality_cost_per_part": float(quality_base),
            "inspection_fixed_cost_allocated": float(inputs.inspection_fixed_cost / _to_decimal(max(inputs.quantity, 1))),
            "inspection_percentage_cost": inputs.inspection_percentage_cost,
            "inspection_cost_per_part": float(inspection_cost),
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
            "setup_cost_per_part_formula": "(setup_time_hours * machine_rate_per_hour) / batch_size",
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

        dfm_penalty_pct = _clamp(dfm_analysis["total_penalty"] * 0.25, 0.0, 20.0)
        if dfm_analysis["has_blocking_issue"]:
            dfm_penalty_pct = max(dfm_penalty_pct, 8.0)
        dfm_multiplier = 1.0 + (dfm_penalty_pct / 100.0)
        dfm_adjusted_cost = risk_adjusted_cost * _to_decimal(dfm_multiplier)

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
) -> PricingResult:
    """Calculate pricing for a CNC job and return a detailed breakdown."""
    query = select(MachineRate).where(MachineRate.is_default == True, MachineRate.is_active == True)
    result = await db.execute(query)
    machine_rate = result.scalar_one_or_none()

    if machine_rate:
        machine_name = machine_rate.name
        hourly_rate = machine_rate.hourly_rate
        machine_efficiency = machine_rate.efficiency_rate
        setup_time = machine_rate.setup_time_hours
    else:
        machine_name = "Standard 3-Axis CNC Mill"
        hourly_rate = _to_decimal(settings.DEFAULT_HOURLY_MACHINE_RATE)
        machine_efficiency = settings.DEFAULT_MACHINE_EFFICIENCY
        setup_time = 0.5

    # Existing fields (backward compatible)
    material_cost_per_kg = material.cost_per_kg
    material_machining_difficulty_factor = material.machining_difficulty_factor
    finish_cost_multiplier = surface_finish.cost_multiplier
    finish_fixed_cost = surface_finish.fixed_cost
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

        if pricing_overrides.get("material_machining_difficulty_factor") is not None:
            material_machining_difficulty_factor = float(pricing_overrides["material_machining_difficulty_factor"])
            applied_overrides["material_machining_difficulty_factor"] = material_machining_difficulty_factor

        if pricing_overrides.get("surface_finish_fixed_cost") is not None:
            finish_fixed_cost = _to_decimal(pricing_overrides["surface_finish_fixed_cost"])
            applied_overrides["surface_finish_fixed_cost"] = float(finish_fixed_cost)

        if pricing_overrides.get("surface_finish_cost_multiplier") is not None:
            finish_cost_multiplier = float(pricing_overrides["surface_finish_cost_multiplier"])
            applied_overrides["surface_finish_cost_multiplier"] = finish_cost_multiplier

        if pricing_overrides.get("inspection_fixed_cost") is not None:
            inspection_fixed_cost = _to_decimal(pricing_overrides["inspection_fixed_cost"])
            applied_overrides["inspection_fixed_cost"] = float(inspection_fixed_cost)

        if pricing_overrides.get("inspection_percentage_cost") is not None:
            inspection_percentage_cost = float(pricing_overrides["inspection_percentage_cost"])
            applied_overrides["inspection_percentage_cost"] = inspection_percentage_cost

        if pricing_overrides.get("machine_hourly_rate") is not None:
            hourly_rate = _to_decimal(pricing_overrides["machine_hourly_rate"])
            applied_overrides["machine_hourly_rate"] = float(hourly_rate)

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
        min_wall_thickness_mm=geometry.min_wall_thickness,
        triangle_count=geometry.triangle_count,
        material_name=material.name,
        material_category=material.category,
        material_density=material.density,
        material_cost_per_kg=material_cost_per_kg,
        machining_difficulty_factor=material_machining_difficulty_factor,
        material_availability_factor=material.availability_factor,
        finish_name=surface_finish.name,
        finish_cost_multiplier=finish_cost_multiplier,
        finish_fixed_cost=finish_fixed_cost,
        finish_lead_time_days=surface_finish.lead_time_addition_days,
        inspection_name=inspection_level.name,
        inspection_fixed_cost=inspection_fixed_cost,
        inspection_percentage_cost=inspection_percentage_cost,
        inspection_lead_time_days=inspection_level.lead_time_addition_days,
        machine_name=machine_name,
        hourly_rate=hourly_rate,
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
    )

    result = pricing_engine.calculate_price(inputs)
    if applied_overrides:
        result.details["pricing_overrides"] = applied_overrides

    return result
