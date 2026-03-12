"""Pydantic schemas for API validation and serialization."""
from datetime import datetime
from decimal import Decimal
from typing import Optional, List
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict


# ============================================================================
# Base Schemas
# ============================================================================

class BaseSchema(BaseModel):
    """Base schema with common configuration."""
    model_config = ConfigDict(from_attributes=True)


# ============================================================================
# Material Schemas
# ============================================================================

class MaterialBase(BaseModel):
    """Material base schema."""
    name: str = Field(..., max_length=100)
    description: Optional[str] = None
    category: str = Field(..., max_length=50)
    density: float = Field(..., gt=0, description="Density in g/cm³")
    cost_per_kg: Decimal = Field(..., gt=0, description="Cost per kg in USD")
    machining_difficulty_factor: float = Field(default=1.0, ge=0.5, le=3.0)
    availability_factor: float = Field(default=1.0, ge=0.5, le=2.0)


class MaterialCreate(MaterialBase):
    """Schema for creating a material."""
    pass


class MaterialUpdate(BaseModel):
    """Schema for updating a material."""
    name: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None
    density: Optional[float] = Field(None, gt=0)
    cost_per_kg: Optional[Decimal] = Field(None, gt=0)
    machining_difficulty_factor: Optional[float] = Field(None, ge=0.5, le=3.0)
    availability_factor: Optional[float] = Field(None, ge=0.5, le=2.0)
    is_active: Optional[bool] = None


class MaterialResponse(MaterialBase, BaseSchema):
    """Material response schema."""
    id: UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime


# ============================================================================
# Surface Finish Schemas
# ============================================================================

class SurfaceFinishBase(BaseModel):
    """Surface finish base schema."""
    name: str = Field(..., max_length=100)
    description: Optional[str] = None
    cost_multiplier: float = Field(default=1.0, ge=1.0)
    fixed_cost: Decimal = Field(default=0, ge=0)
    lead_time_addition_days: float = Field(default=0, ge=0)
    compatible_materials: Optional[List[str]] = None


class SurfaceFinishCreate(SurfaceFinishBase):
    """Schema for creating a surface finish."""
    pass


class SurfaceFinishUpdate(BaseModel):
    """Schema for updating a surface finish."""
    name: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None
    cost_multiplier: Optional[float] = Field(None, ge=1.0)
    fixed_cost: Optional[Decimal] = Field(None, ge=0)
    lead_time_addition_days: Optional[float] = Field(None, ge=0)
    is_active: Optional[bool] = None


class SurfaceFinishResponse(SurfaceFinishBase, BaseSchema):
    """Surface finish response schema."""
    id: UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime


# ============================================================================
# Inspection Level Schemas
# ============================================================================

class InspectionLevelBase(BaseModel):
    """Inspection level base schema."""
    name: str = Field(..., max_length=100)
    description: Optional[str] = None
    fixed_cost: Decimal = Field(default=0, ge=0)
    percentage_cost: float = Field(default=0, ge=0, le=100)
    lead_time_addition_days: float = Field(default=0, ge=0)
    includes_certificate: bool = False
    includes_cmm_report: bool = False


class InspectionLevelCreate(InspectionLevelBase):
    """Schema for creating an inspection level."""
    pass


class InspectionLevelUpdate(BaseModel):
    """Schema for updating an inspection level."""
    name: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None
    fixed_cost: Optional[Decimal] = Field(None, ge=0)
    percentage_cost: Optional[float] = Field(None, ge=0, le=100)
    lead_time_addition_days: Optional[float] = Field(None, ge=0)
    is_active: Optional[bool] = None


class InspectionLevelResponse(InspectionLevelBase, BaseSchema):
    """Inspection level response schema."""
    id: UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime


# ============================================================================
# Machine Rate Schemas
# ============================================================================

class MachineRateBase(BaseModel):
    """Machine rate base schema."""
    name: str = Field(..., max_length=100)
    description: Optional[str] = None
    hourly_rate: Decimal = Field(..., gt=0, description="Hourly rate in INR")
    efficiency_rate: float = Field(default=0.75, ge=0.1, le=1.0)
    setup_time_hours: float = Field(default=0.5, ge=0)
    is_default: bool = False


class MachineRateCreate(MachineRateBase):
    """Schema for creating a machine rate."""
    pass


class MachineRateUpdate(BaseModel):
    """Schema for updating a machine rate."""
    name: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None
    hourly_rate: Optional[Decimal] = Field(None, gt=0)
    efficiency_rate: Optional[float] = Field(None, ge=0.1, le=1.0)
    setup_time_hours: Optional[float] = Field(None, ge=0)
    is_default: Optional[bool] = None
    is_active: Optional[bool] = None


class MachineRateResponse(MachineRateBase, BaseSchema):
    """Machine rate response schema."""
    id: UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime


# ============================================================================
# CAD File Schemas
# ============================================================================

class CADFileUploadResponse(BaseSchema):
    """Response after CAD file upload."""
    id: UUID
    original_filename: str
    file_format: str
    file_size: int
    file_hash: str
    processing_status: str
    message: str


class CADFileResponse(BaseSchema):
    """CAD file response schema."""
    id: UUID
    original_filename: str
    file_format: str
    file_size: int
    file_hash: str
    processing_status: str
    processing_error: Optional[str]
    created_at: datetime
    processed_at: Optional[datetime]


# ============================================================================
# Geometry Analysis Schemas
# ============================================================================

class BoundingBox(BaseModel):
    """Bounding box dimensions."""
    x: float = Field(..., description="X dimension in cm")
    y: float = Field(..., description="Y dimension in cm")
    z: float = Field(..., description="Z dimension in cm")
    volume: float = Field(..., description="Bounding box volume in cm³")


class GeometryAnalysisResponse(BaseSchema):
    """Geometry analysis response schema."""
    id: UUID
    cad_file_id: UUID
    volume: float = Field(..., description="Part volume in cm³")
    surface_area: float = Field(..., description="Surface area in cm²")
    bounding_box: BoundingBox
    min_wall_thickness: Optional[float] = Field(None, description="Minimum wall thickness in mm")
    hole_count: int = Field(default=0)
    complexity_score: float
    removal_ratio: float
    triangle_count: Optional[int] = None
    vertex_count: Optional[int] = None
    analysis_time_seconds: Optional[float] = None
    created_at: datetime


# ============================================================================
# Pricing Schemas
# ============================================================================

class PricingRequest(BaseModel):
    """Request for instant pricing."""
    cad_file_id: UUID
    material_id: UUID
    surface_finish_id: UUID
    inspection_level_id: UUID
    quantity: int = Field(default=1, ge=1, le=10000)


class PriceBreakdown(BaseModel):
    """Detailed price breakdown."""
    material_cost: Decimal = Field(..., description="Raw material cost")
    machining_cost: Decimal = Field(..., description="CNC machining cost")
    finish_cost: Decimal = Field(..., description="Surface finish cost")
    inspection_cost: Decimal = Field(..., description="Inspection cost")
    subtotal: Decimal = Field(..., description="Subtotal before margin")
    margin_factor: float = Field(..., description="Applied margin factor")
    total_price: Decimal = Field(..., description="Total price for quantity")
    unit_price: Decimal = Field(..., description="Price per unit")


class PricingResponse(BaseModel):
    """Response with pricing and lead time."""
    cad_file_id: UUID
    file_name: str
    quantity: int
    
    # Selected options
    material: MaterialResponse
    surface_finish: SurfaceFinishResponse
    inspection_level: InspectionLevelResponse
    
    # Geometry summary
    volume_cm3: float
    weight_kg: float
    bounding_box: BoundingBox
    complexity_score: float
    
    # Pricing
    price_breakdown: PriceBreakdown
    
    # Lead time
    estimated_lead_time_days: float
    
    # Explanation
    pricing_explanation: dict


# ============================================================================
# Quote Schemas
# ============================================================================

class QuoteCreateRequest(BaseModel):
    """Request to create a formal quote."""
    cad_file_id: UUID
    material_id: UUID
    surface_finish_id: UUID
    inspection_level_id: UUID
    quantity: int = Field(default=1, ge=1, le=10000)
    
    # Customer info
    customer_name: Optional[str] = Field(None, max_length=200)
    customer_email: Optional[str] = Field(None, max_length=200)
    customer_company: Optional[str] = Field(None, max_length=200)
    
    notes: Optional[str] = None


class QuoteResponse(BaseSchema):
    """Quote response schema."""
    id: UUID
    quote_number: str
    
    # Customer
    customer_name: Optional[str]
    customer_email: Optional[str]
    customer_company: Optional[str]
    
    # References
    cad_file: CADFileResponse
    material: MaterialResponse
    surface_finish: SurfaceFinishResponse
    inspection_level: InspectionLevelResponse
    
    quantity: int
    
    # Pricing
    material_cost: Decimal
    machining_cost: Decimal
    finish_cost: Decimal
    inspection_cost: Decimal
    subtotal: Decimal
    margin_factor: float
    total_price: Decimal
    unit_price: Decimal
    
    # Lead time
    estimated_lead_time_days: float
    
    # Status
    status: str
    valid_until: datetime
    pdf_path: Optional[str]
    
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime


class QuoteListResponse(BaseSchema):
    """Simplified quote list item."""
    id: UUID
    quote_number: str
    customer_name: Optional[str]
    total_price: Decimal
    status: str
    valid_until: datetime
    created_at: datetime


# ============================================================================
# Error Schemas
# ============================================================================

class ErrorResponse(BaseModel):
    """Error response schema."""
    error: str
    detail: Optional[str] = None
    code: Optional[str] = None
