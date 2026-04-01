"""Database seeding script with initial configuration data."""
import asyncio
from decimal import Decimal
import logging

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import async_session_maker, init_db
from app.models.models import (
    Material,
    SurfaceFinish,
    InspectionLevel,
    MachineRate,
    Vendor,
    VendorMachineCapability,
    VendorMaterialExpertise,
    VendorCertification,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ============================================================================
# Seed Data
# ============================================================================

MATERIALS = [
    {
        "name": "Aluminum 6061-T6",
        "description": "General purpose aluminum alloy with good machinability and corrosion resistance",
        "category": "aluminum",
        "density": 2.70,
        "cost_per_kg": Decimal("320.00"),
        "machining_difficulty_factor": 0.8,
        "availability_factor": 1.0,
    },
    {
        "name": "Aluminum 7075-T6",
        "description": "High-strength aluminum alloy for aerospace applications",
        "category": "aluminum",
        "density": 2.81,
        "cost_per_kg": Decimal("520.00"),
        "machining_difficulty_factor": 0.8,
        "availability_factor": 1.1,
    },
    {
        "name": "Mild Steel 1018",
        "description": "Low carbon steel with good machinability",
        "category": "steel",
        "density": 7.87,
        "cost_per_kg": Decimal("80.00"),
        "machining_difficulty_factor": 1.0,
        "availability_factor": 1.0,
    },
    {
        "name": "Stainless Steel 304",
        "description": "Austenitic stainless steel with excellent corrosion resistance",
        "category": "steel",
        "density": 8.00,
        "cost_per_kg": Decimal("260.00"),
        "machining_difficulty_factor": 1.5,
        "availability_factor": 1.0,
    },
    {
        "name": "Stainless Steel 316",
        "description": "Marine grade stainless steel with superior corrosion resistance",
        "category": "steel",
        "density": 8.00,
        "cost_per_kg": Decimal("380.00"),
        "machining_difficulty_factor": 1.6,
        "availability_factor": 1.1,
    },
    {
        "name": "Brass C360",
        "description": "Free-machining brass with excellent machinability",
        "category": "brass",
        "density": 8.50,
        "cost_per_kg": Decimal("680.00"),
        "machining_difficulty_factor": 0.7,
        "availability_factor": 1.0,
    },
    {
        "name": "POM / Delrin",
        "description": "Acetal homopolymer with low friction and good dimensional stability",
        "category": "plastic",
        "density": 1.41,
        "cost_per_kg": Decimal("380.00"),
        "machining_difficulty_factor": 0.6,
        "availability_factor": 1.0,
    },
    {
        "name": "PEEK",
        "description": "High-performance thermoplastic for demanding applications",
        "category": "plastic",
        "density": 1.32,
        "cost_per_kg": Decimal("8000.00"),
        "machining_difficulty_factor": 0.6,
        "availability_factor": 1.3,
    },
    {
        "name": "Nylon 6/6",
        "description": "Engineering plastic with good wear resistance",
        "category": "plastic",
        "density": 1.14,
        "cost_per_kg": Decimal("320.00"),
        "machining_difficulty_factor": 0.6,
        "availability_factor": 1.0,
    },
    {
        "name": "Titanium Grade 5",
        "description": "Ti-6Al-4V alloy for aerospace and medical applications",
        "category": "titanium",
        "density": 4.43,
        "cost_per_kg": Decimal("3500.00"),
        "machining_difficulty_factor": 2.0,
        "availability_factor": 1.5,
    },
]

SURFACE_FINISHES = [
    {
        "name": "As Machined",
        "description": "Standard machined finish (Ra 3.2 μm typical)",
        "cost_multiplier": 1.0,
        "fixed_cost": Decimal("0"),
        "lead_time_addition_days": 0,
        "compatible_materials": None,
    },
    {
        "name": "Bead Blasted",
        "description": "Uniform matte finish using glass bead media",
        "cost_multiplier": 1.1,
        "fixed_cost": Decimal("1000.00"),
        "lead_time_addition_days": 1,
        "compatible_materials": ["aluminum", "steel", "titanium"],
    },
    {
        "name": "Anodized Type II (Clear)",
        "description": "Clear anodic coating for aluminum parts",
        "cost_multiplier": 1.2,
        "fixed_cost": Decimal("2000.00"),
        "lead_time_addition_days": 2,
        "compatible_materials": ["aluminum"],
    },
    {
        "name": "Anodized Type II (Color)",
        "description": "Colored anodic coating for aluminum parts",
        "cost_multiplier": 1.25,
        "fixed_cost": Decimal("2500.00"),
        "lead_time_addition_days": 3,
        "compatible_materials": ["aluminum"],
    },
    {
        "name": "Anodized Type III (Hard)",
        "description": "Hardcoat anodizing for wear resistance",
        "cost_multiplier": 1.4,
        "fixed_cost": Decimal("4200.00"),
        "lead_time_addition_days": 3,
        "compatible_materials": ["aluminum"],
    },
    {
        "name": "Powder Coated",
        "description": "Durable powder coat finish in various colors",
        "cost_multiplier": 1.3,
        "fixed_cost": Decimal("2000.00"),
        "lead_time_addition_days": 2,
        "compatible_materials": ["aluminum", "steel"],
    },
    {
        "name": "Electroless Nickel",
        "description": "Uniform nickel plating for corrosion resistance",
        "cost_multiplier": 1.35,
        "fixed_cost": Decimal("3000.00"),
        "lead_time_addition_days": 3,
        "compatible_materials": ["aluminum", "steel", "brass"],
    },
    {
        "name": "Passivated",
        "description": "Chemical passivation for stainless steel",
        "cost_multiplier": 1.1,
        "fixed_cost": Decimal("1200.00"),
        "lead_time_addition_days": 1,
        "compatible_materials": ["steel"],
    },
    {
        "name": "Polished (Mirror)",
        "description": "High polish mirror finish",
        "cost_multiplier": 1.5,
        "fixed_cost": Decimal("2800.00"),
        "lead_time_addition_days": 2,
        "compatible_materials": ["aluminum", "steel", "brass"],
    },
]

INSPECTION_LEVELS = [
    {
        "name": "Standard Visual",
        "description": "Visual inspection for cosmetic defects and basic dimensional check",
        "fixed_cost": Decimal("0"),
        "percentage_cost": 0,
        "lead_time_addition_days": 0,
        "includes_certificate": False,
        "includes_cmm_report": False,
    },
    {
        "name": "Dimensional Inspection",
        "description": "Caliper and micrometer inspection of critical dimensions",
        "fixed_cost": Decimal("1000.00"),
        "percentage_cost": 0,
        "lead_time_addition_days": 0.5,
        "includes_certificate": True,
        "includes_cmm_report": False,
    },
    {
        "name": "CMM Inspection",
        "description": "Coordinate measuring machine inspection with full report",
        "fixed_cost": Decimal("3000.00"),
        "percentage_cost": 2.0,
        "lead_time_addition_days": 1.0,
        "includes_certificate": True,
        "includes_cmm_report": True,
    },
    {
        "name": "First Article Inspection (FAI)",
        "description": "Full AS9102 first article inspection report",
        "fixed_cost": Decimal("6000.00"),
        "percentage_cost": 5.0,
        "lead_time_addition_days": 2.0,
        "includes_certificate": True,
        "includes_cmm_report": True,
    },
]

MACHINE_RATES = [
    {
        "name": "Standard 3-Axis CNC Mill",
        "description": "Standard 3-axis vertical machining center",
        "hourly_rate": Decimal("700.00"),
        "efficiency_rate": 0.75,
        "setup_time_hours": 0.5,
        "is_default": True,
    },
    {
        "name": "5-Axis CNC Mill",
        "description": "5-axis machining center for complex parts",
        "hourly_rate": Decimal("2500.00"),
        "efficiency_rate": 0.70,
        "setup_time_hours": 1.0,
        "is_default": False,
    },
    {
        "name": "CNC Lathe",
        "description": "CNC turning center",
        "hourly_rate": Decimal("500.00"),
        "efficiency_rate": 0.80,
        "setup_time_hours": 0.5,
        "is_default": False,
    },
]

VENDORS = [
    {
        "name": "PrecisionWorks India",
        "quality_rating": 4.6,
        "on_time_rating": 4.4,
        "current_load_pct": 62.0,
        "machines": [
            {"machine_type": "3-axis", "envelope_x_mm": 600, "envelope_y_mm": 400, "envelope_z_mm": 350, "machine_rate_override": Decimal("720.00")},
            {"machine_type": "5-axis", "envelope_x_mm": 500, "envelope_y_mm": 400, "envelope_z_mm": 300, "machine_rate_override": Decimal("2400.00")},
        ],
        "materials": ["aluminum", "steel", "stainless", "brass"],
        "certifications": ["ISO9001", "AS9100"],
    },
    {
        "name": "RapidTurn Components",
        "quality_rating": 4.2,
        "on_time_rating": 4.1,
        "current_load_pct": 48.0,
        "machines": [
            {"machine_type": "lathe", "envelope_x_mm": 300, "envelope_y_mm": 300, "envelope_z_mm": 800, "machine_rate_override": Decimal("520.00")},
            {"machine_type": "3-axis", "envelope_x_mm": 450, "envelope_y_mm": 350, "envelope_z_mm": 280, "machine_rate_override": Decimal("680.00")},
        ],
        "materials": ["steel", "stainless", "brass"],
        "certifications": ["ISO9001"],
    },
]


async def seed_materials(session: AsyncSession):
    """Seed materials if not exist."""
    for material_data in MATERIALS:
        query = select(Material).where(Material.name == material_data["name"])
        result = await session.execute(query)
        existing = result.scalar_one_or_none()
        
        if not existing:
            material = Material(**material_data)
            session.add(material)
            logger.info(f"Added material: {material_data['name']}")
        else:
            for key, value in material_data.items():
                setattr(existing, key, value)
            logger.info(f"Updated material: {material_data['name']}")
    
    await session.commit()


async def seed_surface_finishes(session: AsyncSession):
    """Seed surface finishes if not exist."""
    for finish_data in SURFACE_FINISHES:
        query = select(SurfaceFinish).where(SurfaceFinish.name == finish_data["name"])
        result = await session.execute(query)
        existing = result.scalar_one_or_none()
        
        if not existing:
            finish = SurfaceFinish(**finish_data)
            session.add(finish)
            logger.info(f"Added finish: {finish_data['name']}")
        else:
            for key, value in finish_data.items():
                setattr(existing, key, value)
            logger.info(f"Updated finish: {finish_data['name']}")
    
    await session.commit()


async def seed_inspection_levels(session: AsyncSession):
    """Seed inspection levels if not exist."""
    for inspection_data in INSPECTION_LEVELS:
        query = select(InspectionLevel).where(InspectionLevel.name == inspection_data["name"])
        result = await session.execute(query)
        existing = result.scalar_one_or_none()
        
        if not existing:
            inspection = InspectionLevel(**inspection_data)
            session.add(inspection)
            logger.info(f"Added inspection level: {inspection_data['name']}")
        else:
            for key, value in inspection_data.items():
                setattr(existing, key, value)
            logger.info(f"Updated inspection level: {inspection_data['name']}")
    
    await session.commit()


async def seed_machine_rates(session: AsyncSession):
    """Seed machine rates if not exist."""
    for rate_data in MACHINE_RATES:
        query = select(MachineRate).where(MachineRate.name == rate_data["name"])
        result = await session.execute(query)
        existing = result.scalar_one_or_none()
        
        if not existing:
            rate = MachineRate(**rate_data)
            session.add(rate)
            logger.info(f"Added machine rate: {rate_data['name']}")
        else:
            for key, value in rate_data.items():
                setattr(existing, key, value)
            logger.info(f"Updated machine rate: {rate_data['name']}")
    
    await session.commit()


async def seed_vendors(session: AsyncSession):
    """Seed vendor matching catalog."""
    for vendor_data in VENDORS:
        query = select(Vendor).where(Vendor.name == vendor_data["name"])
        result = await session.execute(query)
        vendor = result.scalar_one_or_none()

        if not vendor:
            vendor = Vendor(
                name=vendor_data["name"],
                quality_rating=vendor_data["quality_rating"],
                on_time_rating=vendor_data["on_time_rating"],
                current_load_pct=vendor_data["current_load_pct"],
            )
            session.add(vendor)
            await session.flush()
            logger.info(f"Added vendor: {vendor_data['name']}")
        else:
            vendor.quality_rating = vendor_data["quality_rating"]
            vendor.on_time_rating = vendor_data["on_time_rating"]
            vendor.current_load_pct = vendor_data["current_load_pct"]
            logger.info(f"Updated vendor: {vendor_data['name']}")

        for machine in vendor_data["machines"]:
            existing_machine_query = select(VendorMachineCapability).where(
                VendorMachineCapability.vendor_id == vendor.id,
                VendorMachineCapability.machine_type == machine["machine_type"],
            )
            existing_machine_result = await session.execute(existing_machine_query)
            existing_machine = existing_machine_result.scalar_one_or_none()
            if not existing_machine:
                session.add(VendorMachineCapability(vendor_id=vendor.id, **machine))

        for material_category in vendor_data["materials"]:
            existing_material_query = select(VendorMaterialExpertise).where(
                VendorMaterialExpertise.vendor_id == vendor.id,
                VendorMaterialExpertise.material_category == material_category,
            )
            existing_material_result = await session.execute(existing_material_query)
            if not existing_material_result.scalar_one_or_none():
                session.add(
                    VendorMaterialExpertise(
                        vendor_id=vendor.id,
                        material_category=material_category,
                    )
                )

        for cert in vendor_data["certifications"]:
            existing_cert_query = select(VendorCertification).where(
                VendorCertification.vendor_id == vendor.id,
                VendorCertification.certification_code == cert,
            )
            existing_cert_result = await session.execute(existing_cert_query)
            if not existing_cert_result.scalar_one_or_none():
                session.add(
                    VendorCertification(
                        vendor_id=vendor.id,
                        certification_code=cert,
                    )
                )

    await session.commit()


async def seed_all():
    """Seed all configuration data."""
    logger.info("Starting database seeding...")
    
    # Initialize database tables
    await init_db()
    
    async with async_session_maker() as session:
        await seed_materials(session)
        await seed_surface_finishes(session)
        await seed_inspection_levels(session)
        await seed_machine_rates(session)
        await seed_vendors(session)
    
    logger.info("Database seeding completed!")


if __name__ == "__main__":
    asyncio.run(seed_all())
