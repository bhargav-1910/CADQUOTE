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

class PricingOverrides(BaseModel):
    """Optional quote-scoped pricing overrides (does not change global config)."""
    material_cost_per_kg: Optional[Decimal] = Field(None, gt=0)
    material_machining_difficulty_factor: Optional[float] = Field(None, ge=0.5, le=3.0)
    surface_finish_fixed_cost: Optional[Decimal] = Field(None, ge=0)
    surface_finish_cost_multiplier: Optional[float] = Field(None, ge=1.0)
    inspection_fixed_cost: Optional[Decimal] = Field(None, ge=0)
    inspection_percentage_cost: Optional[float] = Field(None, ge=0, le=100)
    machine_hourly_rate: Optional[Decimal] = Field(None, gt=0)
    machine_efficiency_rate: Optional[float] = Field(None, ge=0.1, le=1.0)
    machine_setup_time_hours: Optional[float] = Field(None, ge=0)
    margin_factor: Optional[float] = Field(None, ge=1.0, le=5.0)

class PricingRequest(BaseModel):
    """Request for instant pricing."""
    cad_file_id: UUID
    material_id: UUID
    surface_finish_id: UUID
    inspection_level_id: UUID
    quantity: int = Field(default=1, ge=1, le=10000)
    pricing_overrides: Optional[PricingOverrides] = None


class BatchPricingRequest(BaseModel):
    """Request for pricing multiple CAD files with shared configuration."""
    cad_file_ids: List[UUID] = Field(..., min_length=1)
    material_id: UUID
    surface_finish_id: UUID
    inspection_level_id: UUID
    quantity: int = Field(default=1, ge=1, le=10000)
    pricing_overrides: Optional[PricingOverrides] = None


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


class BatchPricingResponse(BaseModel):
    """Response for batch pricing requests."""
    results: List[PricingResponse]
    priced_count: int


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
    
    pricing_overrides: Optional[PricingOverrides] = None
    notes: Optional[str] = None
    auto_send_email: bool = True


class BatchQuoteCreateRequest(BaseModel):
    """Request to create multiple quotes at once with shared configuration."""
    cad_file_ids: List[UUID] = Field(..., min_length=1)
    material_id: UUID
    surface_finish_id: UUID
    inspection_level_id: UUID
    quantity: int = Field(default=1, ge=1, le=10000)

    customer_name: Optional[str] = Field(None, max_length=200)
    customer_email: Optional[str] = Field(None, max_length=200)
    customer_company: Optional[str] = Field(None, max_length=200)
    pricing_overrides: Optional[PricingOverrides] = None
    notes: Optional[str] = None
    auto_send_email: bool = True


class CombinedQuoteLineItemRequest(BaseModel):
    """One line item in a combined multi-file quotation."""
    cad_file_id: UUID
    material_id: UUID
    surface_finish_id: UUID
    inspection_level_id: UUID
    quantity: int = Field(default=1, ge=1, le=10000)


class CombinedQuoteCreateRequest(BaseModel):
    """Request to create a single quotation that aggregates multiple files."""
    items: List[CombinedQuoteLineItemRequest] = Field(..., min_length=1)

    customer_name: Optional[str] = Field(None, max_length=200)
    customer_email: Optional[str] = Field(None, max_length=200)
    customer_company: Optional[str] = Field(None, max_length=200)
    pricing_overrides: Optional[PricingOverrides] = None
    notes: Optional[str] = None
    auto_send_email: bool = True


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


class BatchQuoteResponse(BaseModel):
    """Response for batch quote creation."""
    quotes: List[QuoteResponse]
    total_price: Decimal
    quote_count: int


class QuoteEmailRequest(BaseModel):
    """Request payload for emailing a quote to a customer."""
    recipient_email: Optional[str] = Field(None, max_length=200)
    subject: Optional[str] = Field(None, max_length=200)
    message: Optional[str] = None


class QuoteEmailResponse(BaseModel):
    """Response payload for quote email dispatch."""
    message: str
    recipient_email: str
    quote_id: UUID


# ============================================================================
# Billing Schemas
# ============================================================================

class PointsPackageResponse(BaseModel):
    id: str
    name: str
    points: int
    price_minor: int
    currency: str
    is_active: bool = True
    display_order: int = 0


class PointsPackageCreateRequest(BaseModel):
    package_code: str = Field(..., min_length=2, max_length=100)
    name: str = Field(..., min_length=2, max_length=120)
    points: int = Field(..., gt=0)
    price_minor: int = Field(..., gt=0)
    currency: str = Field(default="inr", min_length=3, max_length=10)
    is_active: bool = True
    display_order: int = 0


class PointsPackageUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=120)
    points: Optional[int] = Field(None, gt=0)
    price_minor: Optional[int] = Field(None, gt=0)
    currency: Optional[str] = Field(None, min_length=3, max_length=10)
    is_active: Optional[bool] = None
    display_order: Optional[int] = None


class PointsWalletResponse(BaseModel):
    balance_points: int


class PointsLedgerEntryResponse(BaseModel):
    id: UUID
    delta_points: int
    balance_after: int
    action: str
    description: Optional[str] = None
    created_at: datetime


class CreateCheckoutSessionRequest(BaseModel):
    package_id: str
    success_url: Optional[str] = None
    cancel_url: Optional[str] = None


class CreateCheckoutSessionResponse(BaseModel):
    checkout_url: str
    session_id: str


# ============================================================================
# Auth Schemas
# ============================================================================

class UserProfileResponse(BaseSchema):
    """Authenticated user profile response."""
    id: UUID
    full_name: str
    email: str
    company_name: str
    company_address: str
    phone_number: Optional[str] = None
    company_logo_url: Optional[str] = None
    created_at: datetime


class LoginRequest(BaseModel):
    """Credentials for logging in."""
    email: str = Field(..., max_length=200)
    password: str = Field(..., min_length=8, max_length=200)


class AuthTokenResponse(BaseModel):
    """JWT token and current user payload."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserProfileResponse


class RefreshTokenRequest(BaseModel):
    """Request payload for access token refresh."""
    refresh_token: str


class SignupOtpRequest(BaseModel):
    """Request OTP for signup verification."""
    email: str = Field(..., max_length=200)


class SignupOtpResponse(BaseModel):
    """Response when OTP email is dispatched."""
    message: str
    expires_in_seconds: int


class ForgotPasswordRequest(BaseModel):
    """Request password reset email."""
    email: str = Field(..., max_length=200)


class ResetPasswordRequest(BaseModel):
    """Reset password using one-time reset token."""
    token: str
    new_password: str = Field(..., min_length=10, max_length=200)


class GenericMessageResponse(BaseModel):
    """Simple message response."""
    message: str


# ============================================================================
# Error Schemas
# ============================================================================

class ErrorResponse(BaseModel):
    """Error response schema."""
    error: str
    detail: Optional[str] = None
    code: Optional[str] = None
