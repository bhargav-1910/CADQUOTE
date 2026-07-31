"""Pricing catalog endpoints (materials, finishes, inspection levels, rates).

The catalog is **per user**. Each row is either a system default
(``user_id IS NULL``) or one shop's private row. Editing a system default
copies it to the caller first, so tuning your own rates never moves anyone
else's pricing. See `app.services.catalog` for the resolution rules.

Only two things stay admin-only: editing the shared system defaults
(``?scope=global``) and the vendor marketplace.
"""
import uuid
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security_log import log_security_event
from app.api.deps import get_current_user, is_admin, require_admin
from app.services.catalog import (
    apply_update,
    effective_catalog,
    get_for_user,
    user_override_count,
)
from app.models.models import (
    User,
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

Scope = Literal["mine", "global"]


def _audit_admin(request: Request, admin: User, action: str, **details) -> None:
    log_security_event(
        "admin.config", request=request, user_id=admin.id, email=admin.email,
        action=action, **details,
    )


def _require_global_scope(request: Request, user: User, action: str) -> None:
    """`?scope=global` edits the shared default every shop inherits."""
    if not is_admin(user):
        log_security_event(
            "authz.denied", request=request, user_id=user.id, email=user.email,
            outcome="denied", required_role="admin", action=action,
        )
        raise HTTPException(
            status_code=403,
            detail="Only an administrator can change the shared default. "
                   "Omit scope=global to customise it for your own workspace.",
        )


async def _owned_or_404(db, model, entity_id: uuid.UUID, user: User, label: str):
    entity = await get_for_user(db, model, entity_id, user.id)
    if entity is None:
        raise HTTPException(status_code=404, detail=f"{label} not found")
    return entity


async def _delete_own_row(db, model, entity_id: uuid.UUID, user: User, label: str) -> None:
    """Remove a user-owned catalog row.

    System defaults are never deleted through this path: for a user it is not
    theirs to delete, and a silent global delete would break every workspace
    inheriting it."""
    entity = await get_for_user(db, model, entity_id, user.id)
    if entity is None:
        raise HTTPException(status_code=404, detail=f"{label} not found")
    if entity.user_id is None:
        raise HTTPException(
            status_code=400,
            detail=f"{label} is a system default. Customise it instead of deleting it.",
        )
    await db.delete(entity)
    await db.commit()


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
    current_user: User = Depends(get_current_user),
):
    """List the materials this workspace uses: your own rows, plus the
    system defaults you have not customised."""
    return await effective_catalog(
        db, Material, current_user.id,
        active_only=active_only, order_by=(Material.category, Material.name,),
    )


@router.get("/materials/{entity_id}", response_model=MaterialResponse)
async def get_material(
    entity_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get material by ID."""
    return await _owned_or_404(db, Material, entity_id, current_user, "Material")


@router.post("/materials", response_model=MaterialResponse, status_code=201)
async def create_material(
    request: Request,
    data: MaterialCreate,
    scope: Scope = Query("mine", description="'mine' for this workspace, 'global' for the shared default (admin only)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a material. Owned by you unless scope=global."""
    if scope == "global":
        _require_global_scope(request, current_user, "material.create")
        entity = Material(**data.model_dump())
        _audit_admin(request, current_user, "material.create.global")
    else:
        entity = Material(user_id=current_user.id, **data.model_dump())

    db.add(entity)
    await db.commit()
    await db.refresh(entity)
    return entity


@router.patch("/materials/{entity_id}", response_model=MaterialResponse)
async def update_material(
    request: Request,
    entity_id: uuid.UUID,
    data: MaterialUpdate,
    scope: Scope = Query("mine"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a material.

    Editing a system default copies it into your workspace first, so your
    costs never move anyone else's quotes. scope=global edits the shared
    default in place and requires admin."""
    entity = await _owned_or_404(db, Material, entity_id, current_user, "Material")
    updates = data.model_dump(exclude_unset=True)

    if scope == "global":
        _require_global_scope(request, current_user, "material.update")
        if entity.user_id is not None:
            raise HTTPException(status_code=400, detail="That row is not a shared default")
        for field, value in updates.items():
            setattr(entity, field, value)
        await db.commit()
        await db.refresh(entity)
        _audit_admin(request, current_user, "material.update.global",
                     entity_id=str(entity_id), fields=sorted(updates))
        return entity

    entity, _created = await apply_update(db, Material, entity, updates, current_user.id)
    await db.commit()
    await db.refresh(entity)
    return entity


@router.delete("/materials/{entity_id}", status_code=204)
async def reset_material(
    entity_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete your customised material, restoring the system default."""
    await _delete_own_row(db, Material, entity_id, current_user, "Material")


# ============================================================================
# Surface Finishes
# ============================================================================

@router.get("/finishes", response_model=List[SurfaceFinishResponse])
async def list_surface_finishs(
    active_only: bool = True,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List the surface finishs this workspace uses: your own rows, plus the
    system defaults you have not customised."""
    return await effective_catalog(
        db, SurfaceFinish, current_user.id,
        active_only=active_only, order_by=(SurfaceFinish.name,),
    )


@router.get("/finishes/{entity_id}", response_model=SurfaceFinishResponse)
async def get_surface_finish(
    entity_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get surface finish by ID."""
    return await _owned_or_404(db, SurfaceFinish, entity_id, current_user, "Surface finish")


@router.post("/finishes", response_model=SurfaceFinishResponse, status_code=201)
async def create_surface_finish(
    request: Request,
    data: SurfaceFinishCreate,
    scope: Scope = Query("mine", description="'mine' for this workspace, 'global' for the shared default (admin only)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a surface finish. Owned by you unless scope=global."""
    if scope == "global":
        _require_global_scope(request, current_user, "surface_finish.create")
        entity = SurfaceFinish(**data.model_dump())
        _audit_admin(request, current_user, "surface_finish.create.global")
    else:
        entity = SurfaceFinish(user_id=current_user.id, **data.model_dump())

    db.add(entity)
    await db.commit()
    await db.refresh(entity)
    return entity


@router.patch("/finishes/{entity_id}", response_model=SurfaceFinishResponse)
async def update_surface_finish(
    request: Request,
    entity_id: uuid.UUID,
    data: SurfaceFinishUpdate,
    scope: Scope = Query("mine"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a surface finish.

    Editing a system default copies it into your workspace first, so your
    costs never move anyone else's quotes. scope=global edits the shared
    default in place and requires admin."""
    entity = await _owned_or_404(db, SurfaceFinish, entity_id, current_user, "Surface finish")
    updates = data.model_dump(exclude_unset=True)

    if scope == "global":
        _require_global_scope(request, current_user, "surface_finish.update")
        if entity.user_id is not None:
            raise HTTPException(status_code=400, detail="That row is not a shared default")
        for field, value in updates.items():
            setattr(entity, field, value)
        await db.commit()
        await db.refresh(entity)
        _audit_admin(request, current_user, "surface_finish.update.global",
                     entity_id=str(entity_id), fields=sorted(updates))
        return entity

    entity, _created = await apply_update(db, SurfaceFinish, entity, updates, current_user.id)
    await db.commit()
    await db.refresh(entity)
    return entity


@router.delete("/finishes/{entity_id}", status_code=204)
async def reset_surface_finish(
    entity_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete your customised surface finish, restoring the system default."""
    await _delete_own_row(db, SurfaceFinish, entity_id, current_user, "Surface finish")


# ============================================================================
# Inspection Levels
# ============================================================================

@router.get("/inspections", response_model=List[InspectionLevelResponse])
async def list_inspection_levels(
    active_only: bool = True,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List the inspection levels this workspace uses: your own rows, plus the
    system defaults you have not customised."""
    return await effective_catalog(
        db, InspectionLevel, current_user.id,
        active_only=active_only, order_by=(InspectionLevel.fixed_cost,),
    )


@router.get("/inspections/{entity_id}", response_model=InspectionLevelResponse)
async def get_inspection_level(
    entity_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get inspection level by ID."""
    return await _owned_or_404(db, InspectionLevel, entity_id, current_user, "Inspection level")


@router.post("/inspections", response_model=InspectionLevelResponse, status_code=201)
async def create_inspection_level(
    request: Request,
    data: InspectionLevelCreate,
    scope: Scope = Query("mine", description="'mine' for this workspace, 'global' for the shared default (admin only)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a inspection level. Owned by you unless scope=global."""
    if scope == "global":
        _require_global_scope(request, current_user, "inspection_level.create")
        entity = InspectionLevel(**data.model_dump())
        _audit_admin(request, current_user, "inspection_level.create.global")
    else:
        entity = InspectionLevel(user_id=current_user.id, **data.model_dump())

    db.add(entity)
    await db.commit()
    await db.refresh(entity)
    return entity


@router.patch("/inspections/{entity_id}", response_model=InspectionLevelResponse)
async def update_inspection_level(
    request: Request,
    entity_id: uuid.UUID,
    data: InspectionLevelUpdate,
    scope: Scope = Query("mine"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a inspection level.

    Editing a system default copies it into your workspace first, so your
    costs never move anyone else's quotes. scope=global edits the shared
    default in place and requires admin."""
    entity = await _owned_or_404(db, InspectionLevel, entity_id, current_user, "Inspection level")
    updates = data.model_dump(exclude_unset=True)

    if scope == "global":
        _require_global_scope(request, current_user, "inspection_level.update")
        if entity.user_id is not None:
            raise HTTPException(status_code=400, detail="That row is not a shared default")
        for field, value in updates.items():
            setattr(entity, field, value)
        await db.commit()
        await db.refresh(entity)
        _audit_admin(request, current_user, "inspection_level.update.global",
                     entity_id=str(entity_id), fields=sorted(updates))
        return entity

    entity, _created = await apply_update(db, InspectionLevel, entity, updates, current_user.id)
    await db.commit()
    await db.refresh(entity)
    return entity


@router.delete("/inspections/{entity_id}", status_code=204)
async def reset_inspection_level(
    entity_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete your customised inspection level, restoring the system default."""
    await _delete_own_row(db, InspectionLevel, entity_id, current_user, "Inspection level")


# ============================================================================
# Machine Rates
# ============================================================================

@router.get("/machine-rates", response_model=List[MachineRateResponse])
async def list_machine_rates(
    active_only: bool = True,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List the machine rates this workspace uses: your own rows, plus the
    system defaults you have not customised."""
    return await effective_catalog(
        db, MachineRate, current_user.id,
        active_only=active_only, order_by=(MachineRate.name,),
    )


@router.get("/machine-rates/{entity_id}", response_model=MachineRateResponse)
async def get_machine_rate(
    entity_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get machine rate by ID."""
    return await _owned_or_404(db, MachineRate, entity_id, current_user, "Machine rate")


@router.post("/machine-rates", response_model=MachineRateResponse, status_code=201)
async def create_machine_rate(
    request: Request,
    data: MachineRateCreate,
    scope: Scope = Query("mine", description="'mine' for this workspace, 'global' for the shared default (admin only)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a machine rate. Owned by you unless scope=global."""
    if scope == "global":
        _require_global_scope(request, current_user, "machine_rate.create")
        entity = MachineRate(**data.model_dump())
        _audit_admin(request, current_user, "machine_rate.create.global")
    else:
        entity = MachineRate(user_id=current_user.id, **data.model_dump())

    db.add(entity)
    await db.commit()
    await db.refresh(entity)
    return entity


@router.patch("/machine-rates/{entity_id}", response_model=MachineRateResponse)
async def update_machine_rate(
    request: Request,
    entity_id: uuid.UUID,
    data: MachineRateUpdate,
    scope: Scope = Query("mine"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a machine rate.

    Editing a system default copies it into your workspace first, so your
    costs never move anyone else's quotes. scope=global edits the shared
    default in place and requires admin."""
    entity = await _owned_or_404(db, MachineRate, entity_id, current_user, "Machine rate")
    updates = data.model_dump(exclude_unset=True)

    if scope == "global":
        _require_global_scope(request, current_user, "machine_rate.update")
        if entity.user_id is not None:
            raise HTTPException(status_code=400, detail="That row is not a shared default")
        for field, value in updates.items():
            setattr(entity, field, value)
        await db.commit()
        await db.refresh(entity)
        _audit_admin(request, current_user, "machine_rate.update.global",
                     entity_id=str(entity_id), fields=sorted(updates))
        return entity

    entity, _created = await apply_update(db, MachineRate, entity, updates, current_user.id)
    await db.commit()
    await db.refresh(entity)
    return entity


@router.delete("/machine-rates/{entity_id}", status_code=204)
async def reset_machine_rate(
    entity_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete your customised machine rate, restoring the system default."""
    await _delete_own_row(db, MachineRate, entity_id, current_user, "Machine rate")


@router.get("/overrides")
async def get_override_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """How many catalog rows this workspace has customised."""
    return await user_override_count(db, current_user.id)


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
    request: Request,
    data: VendorCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    vendor = Vendor(**data.model_dump())
    db.add(vendor)
    await db.commit()
    _audit_admin(request, admin, "vendor.create", vendor_id=str(vendor.id))
    return await _get_vendor_with_relations(db, vendor.id)


@router.patch("/vendors/{vendor_id}", response_model=VendorResponse)
async def update_vendor(
    request: Request,
    vendor_id: uuid.UUID,
    data: VendorUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    vendor = await db.get(Vendor, vendor_id)
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(vendor, field, value)
    await db.commit()
    _audit_admin(request, admin, "vendor.update", vendor_id=str(vendor_id), fields=sorted(updates))
    return await _get_vendor_with_relations(db, vendor.id)


@router.post("/vendors/{vendor_id}/machines", status_code=201)
async def add_vendor_machine_capability(
    request: Request,
    vendor_id: uuid.UUID,
    data: VendorMachineCapabilityCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    vendor = await db.get(Vendor, vendor_id)
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    capability = VendorMachineCapability(vendor_id=vendor_id, **data.model_dump())
    db.add(capability)
    await db.commit()
    _audit_admin(request, admin, "vendor.machine.add", vendor_id=str(vendor_id))
    return {"message": "Machine capability added"}


@router.post("/vendors/{vendor_id}/materials", status_code=201)
async def add_vendor_material_expertise(
    request: Request,
    vendor_id: uuid.UUID,
    data: VendorMaterialExpertiseCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
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
    _audit_admin(request, admin, "vendor.material.add", vendor_id=str(vendor_id))
    return {"message": "Material expertise added"}


@router.post("/vendors/{vendor_id}/certifications", status_code=201)
async def add_vendor_certification(
    request: Request,
    vendor_id: uuid.UUID,
    data: VendorCertificationCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
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
    _audit_admin(request, admin, "vendor.certification.add", vendor_id=str(vendor_id))
    return {"message": "Certification added"}
