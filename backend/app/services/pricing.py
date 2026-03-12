"""Rule-based CNC pricing engine."""
from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, Any, Optional
from dataclasses import dataclass
import logging

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.models import (
    Material, SurfaceFinish, InspectionLevel, 
    GeometryAnalysis, MachineRate
)
from app.core.config import settings

logger = logging.getLogger(__name__)


@dataclass
class PricingInputs:
    """Input data for pricing calculation."""
    # Geometry
    volume_cm3: float
    surface_area_cm2: float
    bounding_box_volume_cm3: float
    complexity_score: float
    removal_ratio: float
    hole_count: int
    
    # Material
    material_density: float  # g/cm³
    material_cost_per_kg: Decimal
    machining_difficulty_factor: float
    material_availability_factor: float
    
    # Finish
    finish_cost_multiplier: float
    finish_fixed_cost: Decimal
    finish_lead_time_days: float
    
    # Inspection
    inspection_fixed_cost: Decimal
    inspection_percentage_cost: float
    inspection_lead_time_days: float
    
    # Machine
    hourly_rate: Decimal
    machine_efficiency: float
    setup_time_hours: float
    
    # Order
    quantity: int
    margin_factor: float


@dataclass
class PricingResult:
    """Result of pricing calculation."""
    # Costs per unit
    material_cost: Decimal
    machining_cost: Decimal
    finish_cost: Decimal
    inspection_cost: Decimal
    
    # Totals
    subtotal: Decimal
    total_price: Decimal
    unit_price: Decimal
    
    # Lead time
    estimated_lead_time_days: float
    
    # Details for transparency
    details: Dict[str, Any]


class PricingEngine:
    """
    Rule-based CNC pricing engine.
    
    All pricing logic is transparent and explainable.
    No machine learning - pure engineering formulas.
    """
    
    # Complexity multipliers based on score
    COMPLEXITY_MULTIPLIERS = [
        (0.5, 0.8),   # Very simple (low surface/volume ratio)
        (1.0, 1.0),   # Standard
        (2.0, 1.3),   # Complex
        (5.0, 1.6),   # Very complex
        (10.0, 2.0),  # Extremely complex
        (float('inf'), 2.5),  # Maximum
    ]
    
    # Quantity discounts
    QUANTITY_DISCOUNTS = [
        (1, 0.0),      # 1 unit: no discount
        (5, 0.05),     # 5+ units: 5% discount
        (10, 0.10),    # 10+ units: 10% discount
        (25, 0.15),    # 25+ units: 15% discount
        (50, 0.20),    # 50+ units: 20% discount
        (100, 0.25),   # 100+ units: 25% discount
        (500, 0.30),   # 500+ units: 30% discount
    ]
    
    # Hole complexity factor (per hole)
    HOLE_COMPLEXITY_FACTOR = 0.02  # 2% per hole
    MAX_HOLE_FACTOR = 0.30  # Cap at 30% additional
    
    def calculate_price(self, inputs: PricingInputs) -> PricingResult:
        """
        Calculate complete pricing for a CNC job.
        
        Returns detailed breakdown with all calculations explained.
        """
        details = {}
        
        # ====================================================================
        # 1. Material Cost
        # ====================================================================
        # Weight = Volume × Density
        weight_kg = (inputs.volume_cm3 * inputs.material_density) / 1000
        material_cost = Decimal(str(weight_kg)) * inputs.material_cost_per_kg
        
        details["material"] = {
            "volume_cm3": inputs.volume_cm3,
            "density_g_cm3": inputs.material_density,
            "weight_kg": round(weight_kg, 4),
            "cost_per_kg": float(inputs.material_cost_per_kg),
            "raw_material_cost": float(material_cost),
        }
        
        # ====================================================================
        # 2. Machining Cost
        # ====================================================================
        # Calculate material to be removed
        material_removal_cm3 = inputs.bounding_box_volume_cm3 - inputs.volume_cm3
        
        # Get complexity multiplier
        complexity_multiplier = self._get_complexity_multiplier(inputs.complexity_score)
        
        # Hole complexity factor
        hole_factor = min(
            inputs.hole_count * self.HOLE_COMPLEXITY_FACTOR,
            self.MAX_HOLE_FACTOR
        )
        hole_multiplier = 1.0 + hole_factor
        
        # Combined difficulty factor
        total_difficulty = (
            inputs.machining_difficulty_factor * 
            complexity_multiplier * 
            hole_multiplier
        )
        
        # Estimated machining time (hours)
        # Base time = (removal volume × removal factor) / efficiency
        removal_factor = settings.DEFAULT_REMOVAL_FACTOR
        base_machining_time = (
            (material_removal_cm3 * removal_factor) / 
            (inputs.machine_efficiency * 100)  # Normalize to reasonable hours
        )
        
        # Apply difficulty factor
        adjusted_machining_time = base_machining_time * total_difficulty
        
        # Add setup time
        total_machining_time = adjusted_machining_time + inputs.setup_time_hours
        
        # Machining cost
        machining_cost = Decimal(str(total_machining_time)) * inputs.hourly_rate
        
        details["machining"] = {
            "bounding_box_volume_cm3": inputs.bounding_box_volume_cm3,
            "material_removal_cm3": round(material_removal_cm3, 4),
            "complexity_score": inputs.complexity_score,
            "complexity_multiplier": complexity_multiplier,
            "hole_count": inputs.hole_count,
            "hole_multiplier": hole_multiplier,
            "machining_difficulty_factor": inputs.machining_difficulty_factor,
            "total_difficulty_factor": round(total_difficulty, 4),
            "base_machining_time_hours": round(base_machining_time, 4),
            "setup_time_hours": inputs.setup_time_hours,
            "total_machining_time_hours": round(total_machining_time, 4),
            "hourly_rate": float(inputs.hourly_rate),
            "machining_cost": float(machining_cost),
        }
        
        # ====================================================================
        # 3. Finish Cost
        # ====================================================================
        # Finish cost = (multiplier × machining cost) + fixed cost
        finish_cost = (
            Decimal(str(inputs.finish_cost_multiplier - 1.0)) * machining_cost +
            inputs.finish_fixed_cost
        )
        
        details["finish"] = {
            "finish_multiplier": inputs.finish_cost_multiplier,
            "finish_fixed_cost": float(inputs.finish_fixed_cost),
            "finish_cost": float(finish_cost),
            "lead_time_addition_days": inputs.finish_lead_time_days,
        }
        
        # ====================================================================
        # 4. Inspection Cost
        # ====================================================================
        unit_subtotal = material_cost + machining_cost + finish_cost
        
        inspection_cost = inputs.inspection_fixed_cost
        if inputs.inspection_percentage_cost > 0:
            percentage_cost = unit_subtotal * Decimal(str(inputs.inspection_percentage_cost / 100))
            inspection_cost += percentage_cost
        
        details["inspection"] = {
            "fixed_cost": float(inputs.inspection_fixed_cost),
            "percentage_cost": inputs.inspection_percentage_cost,
            "inspection_cost": float(inspection_cost),
            "lead_time_addition_days": inputs.inspection_lead_time_days,
        }
        
        # ====================================================================
        # 5. Subtotal and Margin
        # ====================================================================
        subtotal_per_unit = material_cost + machining_cost + finish_cost + inspection_cost
        
        # Apply margin
        unit_price_before_discount = subtotal_per_unit * Decimal(str(inputs.margin_factor))
        
        details["margin"] = {
            "subtotal_per_unit": float(subtotal_per_unit),
            "margin_factor": inputs.margin_factor,
            "unit_price_before_discount": float(unit_price_before_discount),
        }
        
        # ====================================================================
        # 6. Quantity Discount
        # ====================================================================
        quantity_discount = self._get_quantity_discount(inputs.quantity)
        
        unit_price = unit_price_before_discount * Decimal(str(1 - quantity_discount))
        total_price = unit_price * inputs.quantity
        
        details["quantity"] = {
            "quantity": inputs.quantity,
            "discount_percentage": quantity_discount * 100,
            "unit_price": float(unit_price),
            "total_price": float(total_price),
        }
        
        # ====================================================================
        # 7. Lead Time Calculation
        # ====================================================================
        # Base lead time from machining
        base_lead_time = 1.0  # Minimum 1 day
        
        # Machining time contribution (convert hours to days, 8 hour workday)
        machining_lead_time = (total_machining_time * inputs.quantity) / 8.0
        
        # Add material availability factor
        material_lead_time = base_lead_time * inputs.material_availability_factor
        
        # Add finish and inspection lead times
        total_lead_time = (
            material_lead_time +
            machining_lead_time +
            inputs.finish_lead_time_days +
            inputs.inspection_lead_time_days
        )
        
        # Round up to nearest 0.5 day
        estimated_lead_time = max(1.0, round(total_lead_time * 2) / 2)
        
        details["lead_time"] = {
            "base_lead_time_days": base_lead_time,
            "machining_lead_time_days": round(machining_lead_time, 2),
            "material_availability_factor": inputs.material_availability_factor,
            "finish_lead_time_days": inputs.finish_lead_time_days,
            "inspection_lead_time_days": inputs.inspection_lead_time_days,
            "total_lead_time_days": estimated_lead_time,
        }
        
        # ====================================================================
        # Round final prices
        # ====================================================================
        def round_price(value: Decimal) -> Decimal:
            return value.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        
        return PricingResult(
            material_cost=round_price(material_cost),
            machining_cost=round_price(machining_cost),
            finish_cost=round_price(finish_cost),
            inspection_cost=round_price(inspection_cost),
            subtotal=round_price(subtotal_per_unit),
            total_price=round_price(total_price),
            unit_price=round_price(unit_price),
            estimated_lead_time_days=estimated_lead_time,
            details=details,
        )
    
    def _get_complexity_multiplier(self, complexity_score: float) -> float:
        """Get complexity multiplier based on score."""
        for threshold, multiplier in self.COMPLEXITY_MULTIPLIERS:
            if complexity_score <= threshold:
                return multiplier
        return self.COMPLEXITY_MULTIPLIERS[-1][1]
    
    def _get_quantity_discount(self, quantity: int) -> float:
        """Get quantity discount percentage."""
        discount = 0.0
        for threshold, disc in self.QUANTITY_DISCOUNTS:
            if quantity >= threshold:
                discount = disc
        return discount


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
) -> PricingResult:
    """
    Calculate pricing for a CNC job.
    
    Fetches machine rate from database and assembles all inputs.
    """
    # Get default machine rate
    query = select(MachineRate).where(
        MachineRate.is_default == True,
        MachineRate.is_active == True
    )
    result = await db.execute(query)
    machine_rate = result.scalar_one_or_none()
    
    # Use defaults if no machine rate configured
    if machine_rate:
        hourly_rate = machine_rate.hourly_rate
        machine_efficiency = machine_rate.efficiency_rate
        setup_time = machine_rate.setup_time_hours
    else:
        hourly_rate = Decimal(str(settings.DEFAULT_HOURLY_MACHINE_RATE))
        machine_efficiency = settings.DEFAULT_MACHINE_EFFICIENCY
        setup_time = 0.5
    
    # Use default margin if not specified
    if margin_factor is None:
        margin_factor = settings.DEFAULT_MARGIN_FACTOR
    
    # Assemble inputs
    inputs = PricingInputs(
        # Geometry
        volume_cm3=geometry.volume,
        surface_area_cm2=geometry.surface_area,
        bounding_box_volume_cm3=geometry.bounding_box_volume,
        complexity_score=geometry.complexity_score,
        removal_ratio=geometry.removal_ratio,
        hole_count=geometry.hole_count,
        
        # Material
        material_density=material.density,
        material_cost_per_kg=material.cost_per_kg,
        machining_difficulty_factor=material.machining_difficulty_factor,
        material_availability_factor=material.availability_factor,
        
        # Finish
        finish_cost_multiplier=surface_finish.cost_multiplier,
        finish_fixed_cost=surface_finish.fixed_cost,
        finish_lead_time_days=surface_finish.lead_time_addition_days,
        
        # Inspection
        inspection_fixed_cost=inspection_level.fixed_cost,
        inspection_percentage_cost=inspection_level.percentage_cost,
        inspection_lead_time_days=inspection_level.lead_time_addition_days,
        
        # Machine
        hourly_rate=hourly_rate,
        machine_efficiency=machine_efficiency,
        setup_time_hours=setup_time,
        
        # Order
        quantity=quantity,
        margin_factor=margin_factor,
    )
    
    return pricing_engine.calculate_price(inputs)
