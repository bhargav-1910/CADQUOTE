"""Configuration data endpoints (materials, finishes, inspection levels)."""
import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.api.deps import get_current_user
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
from app.schemas.schemas import (
    MaterialResponse, MaterialCreate, MaterialUpdate,
    SurfaceFinishResponse, SurfaceFinishCreate, SurfaceFinishUpdate,
    InspectionLevelResponse, InspectionLevelCreate, InspectionLevelUpdate,
    MachineRateResponse, MachineRateCreate, MachineRateUpdate,
    VendorResponse,
    VendorCreate,
    VendorUpdate,
    VendorMachineCapabilityCreate,
    VendorMaterialExpertiseCreate,
    VendorCertificationCreate,
)

router = APIRouter(
    prefix="/config",
    tags=["Configuration"],
    dependencies=[Depends(get_current_user)],
)


async def _get_vendor_with_relations(db: AsyncSession, vendor_id: uuid.UUID) -> Vendor:
    query = (
        select(Vendor)
        .options(
            selectinload(Vendor.machine_capabilities),
            selectinload(Vendor.material_expertise),
            selectinload(Vendor.certifications),
        )
        .where(Vendor.id == vendor_id)
    )
    result = await db.execute(query)
    vendor = result.scalar_one_or_none()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    return vendor


# ============================================================================
# Materials
# ============================================================================

@router.get("/materials", response_model=List[MaterialResponse])
async def list_materials(
    active_only: bool = True,
    db: AsyncSession = Depends(get_db),
):
    """List all available materials."""
    query = select(Material)
    if active_only:
        query = query.where(Material.is_active == True)
    query = query.order_by(Material.category, Material.name)
    
    result = await db.execute(query)
    return list(result.scalars().all())


@router.get("/materials/{material_id}", response_model=MaterialResponse)
async def get_material(
    material_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get material by ID."""
    material = await db.get(Material, material_id)
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    return material


@router.post("/materials", response_model=MaterialResponse, status_code=201)
async def create_material(
    data: MaterialCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new material."""
    material = Material(**data.model_dump())
    db.add(material)
    await db.commit()
    await db.refresh(material)
    return material


@router.patch("/materials/{material_id}", response_model=MaterialResponse)
async def update_material(
    material_id: uuid.UUID,
    data: MaterialUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update a material."""
    material = await db.get(Material, material_id)
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(material, field, value)
    
    await db.commit()
    await db.refresh(material)
    return material


# ============================================================================
# Surface Finishes
# ============================================================================

@router.get("/finishes", response_model=List[SurfaceFinishResponse])
async def list_surface_finishes(
    active_only: bool = True,
    db: AsyncSession = Depends(get_db),
):
    """List all available surface finishes."""
    query = select(SurfaceFinish)
    if active_only:
        query = query.where(SurfaceFinish.is_active == True)
    query = query.order_by(SurfaceFinish.name)
    
    result = await db.execute(query)
    return list(result.scalars().all())


@router.get("/finishes/{finish_id}", response_model=SurfaceFinishResponse)
async def get_surface_finish(
    finish_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get surface finish by ID."""
    finish = await db.get(SurfaceFinish, finish_id)
    if not finish:
        raise HTTPException(status_code=404, detail="Surface finish not found")
    return finish


@router.post("/finishes", response_model=SurfaceFinishResponse, status_code=201)
async def create_surface_finish(
    data: SurfaceFinishCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new surface finish."""
    finish = SurfaceFinish(**data.model_dump())
    db.add(finish)
    await db.commit()
    await db.refresh(finish)
    return finish


@router.patch("/finishes/{finish_id}", response_model=SurfaceFinishResponse)
async def update_surface_finish(
    finish_id: uuid.UUID,
    data: SurfaceFinishUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update a surface finish."""
    finish = await db.get(SurfaceFinish, finish_id)
    if not finish:
        raise HTTPException(status_code=404, detail="Surface finish not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(finish, field, value)
    await db.commit()
    await db.refresh(finish)
    return finish


# ============================================================================
# Inspection Levels
# ============================================================================

@router.get("/inspections", response_model=List[InspectionLevelResponse])
async def list_inspection_levels(
    active_only: bool = True,
    db: AsyncSession = Depends(get_db),
):
    """List all available inspection levels."""
    query = select(InspectionLevel)
    if active_only:
        query = query.where(InspectionLevel.is_active == True)
    query = query.order_by(InspectionLevel.fixed_cost)
    
    result = await db.execute(query)
    return list(result.scalars().all())


@router.get("/inspections/{inspection_id}", response_model=InspectionLevelResponse)
async def get_inspection_level(
    inspection_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get inspection level by ID."""
    inspection = await db.get(InspectionLevel, inspection_id)
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection level not found")
    return inspection


@router.post("/inspections", response_model=InspectionLevelResponse, status_code=201)
async def create_inspection_level(
    data: InspectionLevelCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new inspection level."""
    inspection = InspectionLevel(**data.model_dump())
    db.add(inspection)
    await db.commit()
    await db.refresh(inspection)
    return inspection


@router.patch("/inspections/{inspection_id}", response_model=InspectionLevelResponse)
async def update_inspection_level(
    inspection_id: uuid.UUID,
    data: InspectionLevelUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update an inspection level."""
    inspection = await db.get(InspectionLevel, inspection_id)
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection level not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(inspection, field, value)
    await db.commit()
    await db.refresh(inspection)
    return inspection


# ============================================================================
# Machine Rates
# ============================================================================

@router.get("/machine-rates", response_model=List[MachineRateResponse])
async def list_machine_rates(
    active_only: bool = True,
    db: AsyncSession = Depends(get_db),
):
    """List all machine rates."""
    query = select(MachineRate)
    if active_only:
        query = query.where(MachineRate.is_active == True)
    query = query.order_by(MachineRate.name)
    result = await db.execute(query)
    return list(result.scalars().all())


@router.patch("/machine-rates/{rate_id}", response_model=MachineRateResponse)
async def update_machine_rate(
    rate_id: uuid.UUID,
    data: MachineRateUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update a machine rate."""
    rate = await db.get(MachineRate, rate_id)
    if not rate:
        raise HTTPException(status_code=404, detail="Machine rate not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(rate, field, value)
    await db.commit()
    await db.refresh(rate)
    return rate


# ============================================================================
# Vendors
# ============================================================================

@router.get("/vendors", response_model=List[VendorResponse])
async def list_vendors(
    active_only: bool = True,
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(Vendor)
        .options(
            selectinload(Vendor.machine_capabilities),
            selectinload(Vendor.material_expertise),
            selectinload(Vendor.certifications),
        )
        .order_by(Vendor.name)
    )
    if active_only:
        query = query.where(Vendor.is_active == True)
    result = await db.execute(query)
    return list(result.scalars().all())


@router.post("/vendors", response_model=VendorResponse, status_code=201)
async def create_vendor(
    data: VendorCreate,
    db: AsyncSession = Depends(get_db),
):
    vendor = Vendor(**data.model_dump())
    db.add(vendor)
    await db.commit()
    return await _get_vendor_with_relations(db, vendor.id)


@router.patch("/vendors/{vendor_id}", response_model=VendorResponse)
async def update_vendor(
    vendor_id: uuid.UUID,
    data: VendorUpdate,
    db: AsyncSession = Depends(get_db),
):
    vendor = await db.get(Vendor, vendor_id)
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(vendor, field, value)
    await db.commit()
    return await _get_vendor_with_relations(db, vendor.id)


@router.post("/vendors/{vendor_id}/machines", status_code=201)
async def add_vendor_machine_capability(
    vendor_id: uuid.UUID,
    data: VendorMachineCapabilityCreate,
    db: AsyncSession = Depends(get_db),
):
    vendor = await db.get(Vendor, vendor_id)
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    capability = VendorMachineCapability(vendor_id=vendor_id, **data.model_dump())
    db.add(capability)
    await db.commit()
    return {"message": "Machine capability added"}


@router.post("/vendors/{vendor_id}/materials", status_code=201)
async def add_vendor_material_expertise(
    vendor_id: uuid.UUID,
    data: VendorMaterialExpertiseCreate,
    db: AsyncSession = Depends(get_db),
):
    vendor = await db.get(Vendor, vendor_id)
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    expertise = VendorMaterialExpertise(
        vendor_id=vendor_id,
        material_category=data.material_category.lower(),
    )
    db.add(expertise)
    await db.commit()
    return {"message": "Material expertise added"}


@router.post("/vendors/{vendor_id}/certifications", status_code=201)
async def add_vendor_certification(
    vendor_id: uuid.UUID,
    data: VendorCertificationCreate,
    db: AsyncSession = Depends(get_db),
):
    vendor = await db.get(Vendor, vendor_id)
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    cert = VendorCertification(
        vendor_id=vendor_id,
        certification_code=data.certification_code.upper(),
    )
    db.add(cert)
    await db.commit()
    return {"message": "Certification added"}
