"""Pydantic schemas for API validation and serialization."""
from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional, List
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
    common_names: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None
    category: str = Field(..., max_length=50)
    density: float = Field(..., gt=0, description="Density in g/cm³")
    cost_per_kg: Decimal = Field(..., gt=0, description="Cost per kg in USD")
    scrap_cost_per_kg: Decimal = Field(default=30, ge=0, description="Scrap saving benchmark in INR/kg")
    machining_difficulty_factor: float = Field(default=1.0, ge=0.5, le=3.0)
    availability_factor: float = Field(default=1.0, ge=0.5, le=2.0)


class MaterialCreate(MaterialBase):
    """Schema for creating a material."""
    pass


class MaterialUpdate(BaseModel):
    """Schema for updating a material."""
    name: Optional[str] = Field(None, max_length=100)
    common_names: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None
    density: Optional[float] = Field(None, gt=0)
    cost_per_kg: Optional[Decimal] = Field(None, gt=0)
    scrap_cost_per_kg: Optional[Decimal] = Field(None, ge=0)
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
    rate_per_kg: Decimal = Field(default=0, ge=0)
    rate_per_sq_inch: Decimal = Field(default=0, ge=0)
    rate_per_sq_ft: Decimal = Field(default=0, ge=0)
    rate_per_piece: Decimal = Field(default=0, ge=0)
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
    rate_per_kg: Optional[Decimal] = Field(None, ge=0)
    rate_per_sq_inch: Optional[Decimal] = Field(None, ge=0)
    rate_per_sq_ft: Optional[Decimal] = Field(None, ge=0)
    rate_per_piece: Optional[Decimal] = Field(None, ge=0)
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
    setup_hour_rate: Decimal = Field(default=0, ge=0, description="Setup-specific hourly rate in INR")
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
    setup_hour_rate: Optional[Decimal] = Field(None, ge=0)
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
# Vendor Matching Schemas
# ============================================================================

class VendorMachineCapabilityBase(BaseModel):
    machine_type: str = Field(..., max_length=50)
    envelope_x_mm: float = Field(..., gt=0)
    envelope_y_mm: float = Field(..., gt=0)
    envelope_z_mm: float = Field(..., gt=0)
    machine_rate_override: Optional[Decimal] = Field(None, gt=0)


class VendorMachineCapabilityCreate(VendorMachineCapabilityBase):
    pass


class VendorMachineCapabilityResponse(VendorMachineCapabilityBase, BaseSchema):
    id: UUID
    vendor_id: UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime


class VendorMaterialExpertiseCreate(BaseModel):
    material_category: str = Field(..., max_length=50)


class VendorMaterialExpertiseResponse(BaseSchema):
    id: UUID
    vendor_id: UUID
    material_category: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class VendorCertificationCreate(BaseModel):
    certification_code: str = Field(..., max_length=50)


class VendorCertificationResponse(BaseSchema):
    id: UUID
    vendor_id: UUID
    certification_code: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class VendorBase(BaseModel):
    name: str = Field(..., max_length=200)
    quality_rating: float = Field(default=4.0, ge=0, le=5)
    on_time_rating: float = Field(default=4.0, ge=0, le=5)
    current_load_pct: float = Field(default=50.0, ge=0, le=100)
    notes: Optional[str] = None


class VendorCreate(VendorBase):
    pass


class VendorUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    quality_rating: Optional[float] = Field(None, ge=0, le=5)
    on_time_rating: Optional[float] = Field(None, ge=0, le=5)
    current_load_pct: Optional[float] = Field(None, ge=0, le=100)
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class VendorResponse(VendorBase, BaseSchema):
    id: UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime
    machine_capabilities: List[VendorMachineCapabilityResponse] = Field(default_factory=list)
    material_expertise: List[VendorMaterialExpertiseResponse] = Field(default_factory=list)
    certifications: List[VendorCertificationResponse] = Field(default_factory=list)


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


class DFMIssueResponse(BaseModel):
    """Single DFM issue entry."""
    severity: str
    code: str
    title: str
    description: str
    recommendation: str
    penalty: int
    confidence: float = Field(..., ge=0.0, le=1.0)


class DFMAnalysisResponse(BaseModel):
    """Weighted DFM analysis result."""
    score: int
    label: str
    issues: List[DFMIssueResponse]
    has_blocking_issue: bool
    total_penalty: int
    confidence_score: float = Field(..., ge=0.0, le=1.0)


class GeometryAnalysisResponse(BaseSchema):
    """Geometry analysis response schema."""
    id: UUID
    cad_file_id: UUID
    volume: float = Field(..., description="Part volume in cm³")
    surface_area: float = Field(..., description="Surface area in cm²")
    bounding_box: BoundingBox
    min_wall_thickness: Optional[float] = Field(None, description="Minimum wall thickness in mm")
    hole_count: int = Field(default=0)
    hole_diameters_mm: Optional[List[float]] = Field(None, description="Fitted diameters of detected circular holes")
    machining_direction_count: Optional[int] = Field(
        None, description="Distinct hole-axis directions from the exact B-rep (STEP only)"
    )
    brep_hole_data: Optional[List[dict]] = Field(
        None, description="Exact B-rep holes: [{diameter_mm, depth_mm, axis}]"
    )
    complexity_score: float
    removal_ratio: float
    triangle_count: Optional[int] = None
    vertex_count: Optional[int] = None
    analysis_time_seconds: Optional[float] = None
    analysis_library: Optional[str] = None
    dfm_analysis: Optional[DFMAnalysisResponse] = None
    created_at: datetime


# ============================================================================
# Pricing Schemas
# ============================================================================

class PricingOverrides(BaseModel):
    """Optional quote-scoped pricing overrides (does not change global config)."""
    material_cost_per_kg: Optional[Decimal] = Field(None, gt=0)
    material_machining_difficulty_factor: Optional[float] = Field(None, ge=0.5, le=3.0)
    material_density: Optional[float] = Field(None, gt=0)
    scrap_cost_per_kg: Optional[Decimal] = Field(None, ge=0)
    include_scrap_saving: Optional[bool] = None
    surface_finish_fixed_cost: Optional[Decimal] = Field(None, ge=0)
    surface_finish_cost_multiplier: Optional[float] = Field(None, ge=1.0)
    surface_finish_rate_per_kg: Optional[Decimal] = Field(None, ge=0)
    surface_finish_rate_per_sq_inch: Optional[Decimal] = Field(None, ge=0)
    surface_finish_rate_per_sq_ft: Optional[Decimal] = Field(None, ge=0)
    surface_finish_rate_per_piece: Optional[Decimal] = Field(None, ge=0)
    inspection_fixed_cost: Optional[Decimal] = Field(None, ge=0)
    inspection_percentage_cost: Optional[float] = Field(None, ge=0, le=100)
    machine_hourly_rate: Optional[Decimal] = Field(None, gt=0)
    machine_setup_hourly_rate: Optional[Decimal] = Field(None, ge=0)
    machine_efficiency_rate: Optional[float] = Field(None, ge=0.1, le=1.0)
    machine_setup_time_hours: Optional[float] = Field(None, ge=0)
    machine_name: Optional[str] = Field(None, max_length=100)
    margin_factor: Optional[float] = Field(None, ge=1.0, le=5.0)
    vendor_margin_pct: Optional[float] = Field(None, ge=0, le=100)
    platform_commission_pct: Optional[float] = Field(None, ge=0, le=100)
    vendor_overhead_pct: Optional[float] = Field(None, ge=0, le=100)
    platform_overhead_pct: Optional[float] = Field(None, ge=0, le=100)
    risk_factor_pct: Optional[float] = Field(None, ge=0, le=20)
    vendor_load_pct: Optional[float] = Field(None, ge=0, le=100)
    urgent_factor_pct: Optional[float] = Field(None, ge=0, le=40)
    min_order_value: Optional[Decimal] = Field(None, ge=0)
    negotiation_buffer_pct: Optional[float] = Field(None, ge=0, le=100)
    tolerance_tier: Optional[Literal["general", "precision", "tight"]] = None

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
    dfm_analysis: Optional[DFMAnalysisResponse] = None
    
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

class ProcessRoutingOperation(BaseModel):
    operation: str = Field(..., max_length=100)
    process: str = Field(..., max_length=100)
    machine_type: str = Field(..., max_length=50)
    setup_time_minutes: float = Field(..., ge=0)
    cycle_time_minutes: float = Field(..., ge=0)
    remarks: Optional[str] = None


class VendorMatchSummary(BaseModel):
    vendor_id: UUID
    vendor_name: str
    score: float
    details: dict


class VendorMatchPreviewRequest(BaseModel):
    cad_file_id: UUID
    material_id: UUID
    required_certifications: Optional[List[str]] = None
    machine_name: Optional[str] = None


class VendorMatchPreviewResponse(BaseModel):
    matched: bool
    selected_vendor: Optional[VendorMatchSummary]
    details: dict

class QuoteCreateRequest(BaseModel):
    """Request to create a formal quote."""
    cad_file_id: UUID
    material_id: UUID
    surface_finish_id: UUID
    inspection_level_id: UUID
    quantity: int = Field(default=1, ge=1, le=10000)

    # Customer info (customer_id links an existing CRM record; free text
    # still stored as the quote's snapshot)
    customer_id: Optional[UUID] = None
    customer_name: Optional[str] = Field(None, max_length=200)
    customer_email: Optional[str] = Field(None, max_length=200)
    customer_company: Optional[str] = Field(None, max_length=200)

    # RFQ details
    rfq_number: Optional[str] = Field(None, max_length=100)
    part_name: Optional[str] = Field(None, max_length=200)
    part_number: Optional[str] = Field(None, max_length=100)
    revision: Optional[str] = Field(None, max_length=50)
    rfq_date: Optional[datetime] = None
    quote_due_date: Optional[datetime] = None
    annual_volume: Optional[int] = Field(None, ge=1)
    batch_size: Optional[int] = Field(None, ge=1)
    target_price: Optional[Decimal] = Field(None, ge=0)
    application: Optional[str] = None

    # Part & material details
    raw_form: Optional[str] = Field(None, max_length=100)
    raw_size: Optional[str] = Field(None, max_length=100)
    net_weight_kg: Optional[float] = Field(None, ge=0)
    raw_weight_kg: Optional[float] = Field(None, ge=0)
    buy_to_fly_ratio: Optional[float] = Field(None, ge=0)
    requested_surface_finish: Optional[str] = Field(None, max_length=100)
    tolerance_notes: Optional[str] = Field(None, max_length=100)
    hsn_code: Optional[str] = Field(None, max_length=50)
    complexity_level: Optional[str] = Field(None, max_length=50)

    # Process routing and vendor requirements
    process_routing: Optional[List[ProcessRoutingOperation]] = None
    required_certifications: Optional[List[str]] = None

    # Commercial terms
    price_validity: Optional[str] = Field(None, max_length=100)
    gst: Optional[str] = Field(None, max_length=50)
    delivery: Optional[str] = Field(None, max_length=200)
    payment_terms: Optional[str] = Field(None, max_length=200)
    incoterms: Optional[str] = Field(None, max_length=50)
    tooling_ownership: Optional[str] = Field(None, max_length=200)
    packaging: Optional[str] = Field(None, max_length=200)
    terms_and_conditions: Optional[str] = None
    dfm_exceptions: Optional[str] = None
    
    pricing_overrides: Optional[PricingOverrides] = None
    notes: Optional[str] = None


class BatchQuoteCreateRequest(BaseModel):
    """Request to create multiple quotes at once with shared configuration."""
    cad_file_ids: List[UUID] = Field(..., min_length=1)
    material_id: UUID
    surface_finish_id: UUID
    inspection_level_id: UUID
    quantity: int = Field(default=1, ge=1, le=10000)

    customer_id: Optional[UUID] = None
    customer_name: Optional[str] = Field(None, max_length=200)
    customer_email: Optional[str] = Field(None, max_length=200)
    customer_company: Optional[str] = Field(None, max_length=200)
    rfq_number: Optional[str] = Field(None, max_length=100)
    part_name: Optional[str] = Field(None, max_length=200)
    part_number: Optional[str] = Field(None, max_length=100)
    revision: Optional[str] = Field(None, max_length=50)
    rfq_date: Optional[datetime] = None
    quote_due_date: Optional[datetime] = None
    annual_volume: Optional[int] = Field(None, ge=1)
    batch_size: Optional[int] = Field(None, ge=1)
    target_price: Optional[Decimal] = Field(None, ge=0)
    application: Optional[str] = None
    raw_form: Optional[str] = Field(None, max_length=100)
    raw_size: Optional[str] = Field(None, max_length=100)
    net_weight_kg: Optional[float] = Field(None, ge=0)
    raw_weight_kg: Optional[float] = Field(None, ge=0)
    buy_to_fly_ratio: Optional[float] = Field(None, ge=0)
    requested_surface_finish: Optional[str] = Field(None, max_length=100)
    tolerance_notes: Optional[str] = Field(None, max_length=100)
    hsn_code: Optional[str] = Field(None, max_length=50)
    complexity_level: Optional[str] = Field(None, max_length=50)
    process_routing: Optional[List[ProcessRoutingOperation]] = None
    required_certifications: Optional[List[str]] = None
    price_validity: Optional[str] = Field(None, max_length=100)
    gst: Optional[str] = Field(None, max_length=50)
    delivery: Optional[str] = Field(None, max_length=200)
    payment_terms: Optional[str] = Field(None, max_length=200)
    incoterms: Optional[str] = Field(None, max_length=50)
    tooling_ownership: Optional[str] = Field(None, max_length=200)
    packaging: Optional[str] = Field(None, max_length=200)
    terms_and_conditions: Optional[str] = None
    dfm_exceptions: Optional[str] = None
    pricing_overrides: Optional[PricingOverrides] = None
    notes: Optional[str] = None


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

    customer_id: Optional[UUID] = None
    customer_name: Optional[str] = Field(None, max_length=200)
    customer_email: Optional[str] = Field(None, max_length=200)
    customer_company: Optional[str] = Field(None, max_length=200)
    rfq_number: Optional[str] = Field(None, max_length=100)
    part_name: Optional[str] = Field(None, max_length=200)
    part_number: Optional[str] = Field(None, max_length=100)
    revision: Optional[str] = Field(None, max_length=50)
    rfq_date: Optional[datetime] = None
    quote_due_date: Optional[datetime] = None
    annual_volume: Optional[int] = Field(None, ge=1)
    batch_size: Optional[int] = Field(None, ge=1)
    target_price: Optional[Decimal] = Field(None, ge=0)
    application: Optional[str] = None
    raw_form: Optional[str] = Field(None, max_length=100)
    raw_size: Optional[str] = Field(None, max_length=100)
    net_weight_kg: Optional[float] = Field(None, ge=0)
    raw_weight_kg: Optional[float] = Field(None, ge=0)
    buy_to_fly_ratio: Optional[float] = Field(None, ge=0)
    requested_surface_finish: Optional[str] = Field(None, max_length=100)
    tolerance_notes: Optional[str] = Field(None, max_length=100)
    hsn_code: Optional[str] = Field(None, max_length=50)
    complexity_level: Optional[str] = Field(None, max_length=50)
    process_routing: Optional[List[ProcessRoutingOperation]] = None
    required_certifications: Optional[List[str]] = None
    price_validity: Optional[str] = Field(None, max_length=100)
    gst: Optional[str] = Field(None, max_length=50)
    delivery: Optional[str] = Field(None, max_length=200)
    payment_terms: Optional[str] = Field(None, max_length=200)
    incoterms: Optional[str] = Field(None, max_length=50)
    tooling_ownership: Optional[str] = Field(None, max_length=200)
    packaging: Optional[str] = Field(None, max_length=200)
    terms_and_conditions: Optional[str] = None
    dfm_exceptions: Optional[str] = None
    pricing_overrides: Optional[PricingOverrides] = None
    notes: Optional[str] = None


class QuoteResponse(BaseSchema):
    """Quote response schema."""
    id: UUID
    quote_number: str

    # Customer
    customer_id: Optional[UUID] = None
    customer_name: Optional[str]
    customer_email: Optional[str]
    customer_company: Optional[str]
    rfq_number: Optional[str]
    part_name: Optional[str]
    part_number: Optional[str]
    revision: Optional[str]
    rfq_date: Optional[datetime]
    quote_due_date: Optional[datetime]
    annual_volume: Optional[int]
    batch_size: Optional[int]
    target_price: Optional[Decimal]
    application: Optional[str]
    raw_form: Optional[str]
    raw_size: Optional[str]
    net_weight_kg: Optional[float]
    raw_weight_kg: Optional[float]
    buy_to_fly_ratio: Optional[float]
    requested_surface_finish: Optional[str]
    tolerance_notes: Optional[str]
    hsn_code: Optional[str]
    complexity_level: Optional[str]
    process_routing: Optional[List[ProcessRoutingOperation]]
    matched_vendor: Optional[VendorMatchSummary]
    vendor_match_details: Optional[dict]
    
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

    # Customer share link and response
    share_token: Optional[str] = None
    responded_at: Optional[datetime] = None
    customer_response_note: Optional[str] = None

    pdf_path: Optional[str]
    price_validity: Optional[str]
    gst: Optional[str]
    delivery: Optional[str]
    payment_terms: Optional[str]
    incoterms: Optional[str]
    tooling_ownership: Optional[str]
    packaging: Optional[str]
    terms_and_conditions: Optional[str]
    dfm_exceptions: Optional[str]
    
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime


class QuoteListResponse(BaseSchema):
    """Simplified quote list item."""
    id: UUID
    quote_number: str
    cad_file_id: Optional[UUID] = None
    customer_name: Optional[str]
    total_price: Decimal
    status: str
    valid_until: datetime
    created_at: datetime
    responded_at: Optional[datetime] = None
    customer_response_note: Optional[str] = None


class BatchQuoteResponse(BaseModel):
    """Response for batch quote creation."""
    quotes: List[QuoteResponse]
    total_price: Decimal
    quote_count: int


class QuoteShareResponse(BaseModel):
    """Share token for the customer-facing quote page."""
    quote_id: UUID
    share_token: str


class PublicQuoteLineItem(BaseModel):
    """A line item shown on the customer-facing quote page."""
    part_name: str
    quantity: int
    unit_price: Decimal
    line_total: Decimal


class PublicSellerInfo(BaseModel):
    """The issuing shop's public identity."""
    company_name: str
    company_address: Optional[str] = None
    contact_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    brand_color: Optional[str] = None


class PublicQuoteResponse(BaseModel):
    """Customer-facing quote view — no internal cost or margin data."""
    quote_number: str
    status: str
    customer_name: Optional[str]
    customer_company: Optional[str]
    part_name: Optional[str]
    material_name: Optional[str]
    surface_finish_name: Optional[str]
    inspection_level_name: Optional[str]
    tolerance_notes: Optional[str]
    line_items: List[PublicQuoteLineItem]
    total_price: Decimal
    estimated_lead_time_days: float
    valid_until: datetime
    created_at: datetime
    payment_terms: Optional[str]
    delivery: Optional[str]
    gst: Optional[str]
    price_validity: Optional[str]
    responded_at: Optional[datetime]
    customer_response_note: Optional[str]
    seller: PublicSellerInfo


class PublicQuoteRespondRequest(BaseModel):
    """Customer response to a shared quote."""
    action: str = Field(..., pattern="^(accept|decline)$")
    note: Optional[str] = Field(None, max_length=2000)


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
    brand_color: Optional[str] = None
    gstin: Optional[str] = None
    plan: str = "free"
    plan_expires_at: Optional[datetime] = None
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


# ============================================================================
# Error Schemas
# ============================================================================

class ErrorResponse(BaseModel):
    """Error response schema."""
    error: str
    detail: Optional[str] = None
    code: Optional[str] = None


# ============================================================================
# Customer Schemas (CRM-lite)
# ============================================================================

class CustomerBase(BaseModel):
    """Customer contact fields."""
    name: str = Field(..., min_length=1, max_length=200)
    email: Optional[str] = Field(None, max_length=200)
    company: Optional[str] = Field(None, max_length=200)
    phone: Optional[str] = Field(None, max_length=30)
    gstin: Optional[str] = Field(None, max_length=20)
    notes: Optional[str] = None


class CustomerCreate(CustomerBase):
    """Create (find-or-create by email/name) a customer."""
    pass


class CustomerUpdate(BaseModel):
    """Partial update of a customer record."""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    email: Optional[str] = Field(None, max_length=200)
    company: Optional[str] = Field(None, max_length=200)
    phone: Optional[str] = Field(None, max_length=30)
    gstin: Optional[str] = Field(None, max_length=20)
    notes: Optional[str] = None


class CustomerResponse(CustomerBase, BaseSchema):
    """Customer record with per-customer quote aggregates."""
    id: UUID
    created_at: datetime
    updated_at: datetime

    quote_count: int = 0
    total_quoted_value: Decimal = Decimal("0")
    accepted_count: int = 0
    declined_count: int = 0
    last_quote_at: Optional[datetime] = None
