"""Database models for CNC Quote Platform."""
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    Column, String, Float, Integer, Boolean, DateTime, 
    ForeignKey, Text, Numeric, Enum as SQLEnum, JSON, TypeDecorator, CHAR,
    UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import relationship
import enum

from app.core.crypto import EncryptedString
from app.core.database import Base


# Cross-database UUID type
class UUID(TypeDecorator):
    """Platform-independent UUID type - uses CHAR(32) for SQLite, native UUID for PostgreSQL."""
    impl = CHAR
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == 'postgresql':
            return dialect.type_descriptor(PG_UUID(as_uuid=True))
        else:
            return dialect.type_descriptor(CHAR(32))

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        elif dialect.name == 'postgresql':
            return value
        else:
            if isinstance(value, uuid.UUID):
                return value.hex
            return value

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        elif dialect.name == 'postgresql':
            return value
        else:
            if not isinstance(value, uuid.UUID):
                return uuid.UUID(value)
            return value


class ProcessingStatus(str, enum.Enum):
    """Status of geometry processing."""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class QuoteStatus(str, enum.Enum):
    """Status of a quote."""
    DRAFT = "draft"
    GENERATED = "generated"
    SENT = "sent"
    EXPIRED = "expired"
    ACCEPTED = "accepted"
    DECLINED = "declined"


class User(Base):
    """Application user for authentication and company profile data."""
    __tablename__ = "users"

    id = Column(UUID(), primary_key=True, default=uuid.uuid4)
    full_name = Column(String(200), nullable=False)
    email = Column(String(200), nullable=False, unique=True, index=True)
    hashed_password = Column(String(255), nullable=False)

    company_name = Column(String(200), nullable=False)
    company_address = Column(Text, nullable=False)
    phone_number = Column(String(30), nullable=True)
    # Tax identifier: encrypted at rest, never searched.
    gstin = Column(EncryptedString(20), nullable=True)
    company_logo_path = Column(String(500), nullable=True)
    brand_color = Column(String(7), nullable=True)  # hex accent, e.g. #0284c7
    refresh_token_hash = Column(String(128), nullable=True)
    refresh_token_expires_at = Column(DateTime, nullable=True)

    # Authorization. 'user' is the default least-privilege role; 'admin'
    # unlocks the global pricing/vendor/points-package configuration.
    role = Column(String(20), nullable=False, default="user", server_default="user")

    # Session state. session_id is regenerated on every successful login so a
    # pre-authentication token can never be replayed (session fixation), and
    # session_started_at anchors the absolute timeout.
    session_id = Column(String(64), nullable=True)
    session_started_at = Column(DateTime, nullable=True)
    last_activity_at = Column(DateTime, nullable=True)

    # Brute-force protection and credential lifecycle.
    failed_login_count = Column(Integer, nullable=False, default=0, server_default="0")
    locked_until = Column(DateTime, nullable=True)
    last_login_at = Column(DateTime, nullable=True)
    password_changed_at = Column(DateTime, nullable=True)
    # Most recent superseded bcrypt hashes; blocks password reuse.
    password_history = Column(JSON, nullable=True)

    # Email ownership. Unverified accounts still work — verification gates
    # privilege (the admin role) rather than everyday use, so signup keeps its
    # current one-step flow.
    email_verified = Column(Boolean, nullable=False, default=False, server_default="0")
    email_verified_at = Column(DateTime, nullable=True)

    # TOTP second factor (RFC 6238). The secret is encrypted at rest, so a
    # database leak does not hand over working one-time codes.
    totp_secret = Column(EncryptedString(64), nullable=True)
    totp_enabled = Column(Boolean, nullable=False, default=False, server_default="0")
    totp_confirmed_at = Column(DateTime, nullable=True)
    # SHA-256 of each single-use recovery code; never the codes themselves.
    totp_backup_codes = Column(JSON, nullable=True)
    # Rejects a replayed code within its own 30-second step.
    totp_last_used_step = Column(Integer, nullable=True)

    # Subscription: 'free' users may only quote the built-in sample part;
    # 'pro' unlocks everything. plan_expires_at=NULL means no expiry.
    plan = Column(String(20), nullable=False, default="free", server_default="free")
    plan_expires_at = Column(DateTime, nullable=True)

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    cad_files = relationship("CADFile", back_populates="user")
    quotes = relationship("Quote", back_populates="user")
    points_wallet = relationship("PointsWallet", back_populates="user", uselist=False)
    points_ledger_entries = relationship("PointsLedgerEntry", back_populates="user")


class PasswordResetToken(Base):
    """Single-use, short-lived password reset grant.

    Only the SHA-256 of the emailed token is stored, so a database read does
    not yield a working reset link.
    """
    __tablename__ = "password_reset_tokens"

    id = Column(UUID(), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(), ForeignKey("users.id"), nullable=False, index=True)
    token_hash = Column(String(128), nullable=False, unique=True, index=True)
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")


class EmailVerificationToken(Base):
    """Single-use email ownership proof, stored hashed like a reset token."""
    __tablename__ = "email_verification_tokens"

    id = Column(UUID(), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(), ForeignKey("users.id"), nullable=False, index=True)
    token_hash = Column(String(128), nullable=False, unique=True, index=True)
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")


class ConsentRecord(Base):
    """Auditable cookie/privacy consent decision.

    Anonymous visitors are identified by an opaque client-generated id held in
    a first-party cookie; authenticated decisions also carry the user id.
    """
    __tablename__ = "consent_records"

    id = Column(UUID(), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(), ForeignKey("users.id"), nullable=True, index=True)
    subject_key = Column(String(64), nullable=False, index=True)
    policy_version = Column(String(40), nullable=False)
    necessary = Column(Boolean, nullable=False, default=True)
    preferences = Column(Boolean, nullable=False, default=False)
    analytics = Column(Boolean, nullable=False, default=False)
    marketing = Column(Boolean, nullable=False, default=False)
    source = Column(String(40), nullable=False, default="banner")
    ip_hash = Column(String(64), nullable=True)  # hashed, never the raw address
    user_agent = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class PointsWallet(Base):
    """Per-user points balance."""
    __tablename__ = "points_wallets"

    id = Column(UUID(), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(), ForeignKey("users.id"), nullable=False, unique=True, index=True)
    balance_points = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="points_wallet")


class PointsLedgerEntry(Base):
    """Immutable points transaction history."""
    __tablename__ = "points_ledger_entries"

    id = Column(UUID(), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(), ForeignKey("users.id"), nullable=False, index=True)
    delta_points = Column(Integer, nullable=False)
    balance_after = Column(Integer, nullable=False)
    action = Column(String(100), nullable=False)
    description = Column(String(255), nullable=True)
    reference_type = Column(String(100), nullable=True)
    reference_id = Column(String(100), nullable=True)
    metadata_json = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    user = relationship("User", back_populates="points_ledger_entries")


class StripeCheckoutCredit(Base):
    """Tracks Stripe checkout sessions credited to a wallet for idempotency."""
    __tablename__ = "stripe_checkout_credits"

    id = Column(UUID(), primary_key=True, default=uuid.uuid4)
    stripe_session_id = Column(String(255), nullable=False, unique=True, index=True)
    user_id = Column(UUID(), ForeignKey("users.id"), nullable=False, index=True)
    package_id = Column(String(100), nullable=False)
    points_credited = Column(Integer, nullable=False)
    amount_paid_minor = Column(Integer, nullable=True)
    currency = Column(String(10), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class PointsPackage(Base):
    """Admin-configurable points package catalog used by Stripe checkout."""
    __tablename__ = "points_packages"

    id = Column(UUID(), primary_key=True, default=uuid.uuid4)
    package_code = Column(String(100), nullable=False, unique=True, index=True)
    name = Column(String(120), nullable=False)
    points = Column(Integer, nullable=False)
    price_minor = Column(Integer, nullable=False)
    currency = Column(String(10), nullable=False, default="inr")
    is_active = Column(Boolean, nullable=False, default=True)
    display_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ============================================================================
# Configuration Models (Data-Driven)
# ============================================================================

class Material(Base):
    """Raw material configuration."""
    __tablename__ = "materials"
    
    id = Column(UUID(), primary_key=True, default=uuid.uuid4)

    # Catalog ownership. NULL user_id = system default, visible to everyone and
    # editable only by an admin. A non-NULL user_id is that user's private row;
    # source_id points at the system row it replaces, so the default is hidden
    # for that user and can be restored by deleting the override.
    user_id = Column(UUID(), ForeignKey("users.id"), nullable=True, index=True)
    source_id = Column(UUID(), nullable=True, index=True)
    name = Column(String(100), nullable=False)
    common_names = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)
    category = Column(String(50), nullable=False)  # e.g., "aluminum", "steel", "plastic"
    
    # Physical properties
    density = Column(Float, nullable=False)  # g/cm³
    
    # Cost factors
    cost_per_kg = Column(Numeric(10, 2), nullable=False)  # USD per kg
    scrap_cost_per_kg = Column(Numeric(10, 2), nullable=False, default=Decimal("30.00"))
    machining_difficulty_factor = Column(Float, nullable=False, default=1.0)
    
    # Availability
    availability_factor = Column(Float, default=1.0)  # Affects lead time
    is_active = Column(Boolean, default=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    quotes = relationship("Quote", back_populates="material")

    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_materials_user_name"),
    )



class SurfaceFinish(Base):
    """Surface finish configuration."""
    __tablename__ = "surface_finishes"
    
    id = Column(UUID(), primary_key=True, default=uuid.uuid4)

    # Catalog ownership. NULL user_id = system default, visible to everyone and
    # editable only by an admin. A non-NULL user_id is that user's private row;
    # source_id points at the system row it replaces, so the default is hidden
    # for that user and can be restored by deleting the override.
    user_id = Column(UUID(), ForeignKey("users.id"), nullable=True, index=True)
    source_id = Column(UUID(), nullable=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    
    # Cost factors
    cost_multiplier = Column(Float, nullable=False, default=1.0)  # Multiplies machining cost
    fixed_cost = Column(Numeric(10, 2), default=0)  # Additional fixed cost
    rate_per_kg = Column(Numeric(10, 2), nullable=False, default=Decimal("0.00"))
    rate_per_sq_inch = Column(Numeric(10, 2), nullable=False, default=Decimal("0.00"))
    rate_per_sq_ft = Column(Numeric(10, 2), nullable=False, default=Decimal("0.00"))
    rate_per_piece = Column(Numeric(10, 2), nullable=False, default=Decimal("0.00"))
    
    # Lead time impact
    lead_time_addition_days = Column(Float, default=0)
    
    # Compatibility
    compatible_materials = Column(JSON, nullable=True)  # List of material categories
    
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    quotes = relationship("Quote", back_populates="surface_finish")

    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_surface_finishes_user_name"),
    )



class InspectionLevel(Base):
    """Inspection level configuration."""
    __tablename__ = "inspection_levels"
    
    id = Column(UUID(), primary_key=True, default=uuid.uuid4)

    # Catalog ownership. NULL user_id = system default, visible to everyone and
    # editable only by an admin. A non-NULL user_id is that user's private row;
    # source_id points at the system row it replaces, so the default is hidden
    # for that user and can be restored by deleting the override.
    user_id = Column(UUID(), ForeignKey("users.id"), nullable=True, index=True)
    source_id = Column(UUID(), nullable=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    
    # Cost factors
    fixed_cost = Column(Numeric(10, 2), default=0)  # Fixed additional cost
    percentage_cost = Column(Float, default=0)  # Percentage of total cost
    
    # Lead time impact
    lead_time_addition_days = Column(Float, default=0)
    
    # Include documentation
    includes_certificate = Column(Boolean, default=False)
    includes_cmm_report = Column(Boolean, default=False)
    
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    quotes = relationship("Quote", back_populates="inspection_level")

    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_inspection_levels_user_name"),
    )



class MachineRate(Base):
    """Machine rate configuration for pricing."""
    __tablename__ = "machine_rates"
    
    id = Column(UUID(), primary_key=True, default=uuid.uuid4)

    # Catalog ownership. NULL user_id = system default, visible to everyone and
    # editable only by an admin. A non-NULL user_id is that user's private row;
    # source_id points at the system row it replaces, so the default is hidden
    # for that user and can be restored by deleting the override.
    user_id = Column(UUID(), ForeignKey("users.id"), nullable=True, index=True)
    source_id = Column(UUID(), nullable=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    
    hourly_rate = Column(Numeric(10, 2), nullable=False)  # USD per hour
    setup_hour_rate = Column(Numeric(10, 2), nullable=False, default=Decimal("0.00"))
    efficiency_rate = Column(Float, default=0.75)  # Machine efficiency
    setup_time_hours = Column(Float, default=0.5)  # Setup time per job
    
    is_default = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_machine_rates_user_name"),
    )


# ============================================================================
# Vendor Matching Models
# ============================================================================

class Vendor(Base):
    """Manufacturing vendor profile used by matching engine."""
    __tablename__ = "vendors"

    id = Column(UUID(), primary_key=True, default=uuid.uuid4)
    name = Column(String(200), nullable=False, unique=True)
    is_active = Column(Boolean, nullable=False, default=True)
    quality_rating = Column(Float, nullable=False, default=4.0)
    on_time_rating = Column(Float, nullable=False, default=4.0)
    current_load_pct = Column(Float, nullable=False, default=50.0)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    machine_capabilities = relationship("VendorMachineCapability", back_populates="vendor", cascade="all, delete-orphan")
    material_expertise = relationship("VendorMaterialExpertise", back_populates="vendor", cascade="all, delete-orphan")
    certifications = relationship("VendorCertification", back_populates="vendor", cascade="all, delete-orphan")
    quotes = relationship("Quote", back_populates="matched_vendor")



class VendorMachineCapability(Base):
    """Machine capability and work envelope for a vendor."""
    __tablename__ = "vendor_machine_capabilities"

    id = Column(UUID(), primary_key=True, default=uuid.uuid4)
    vendor_id = Column(UUID(), ForeignKey("vendors.id"), nullable=False, index=True)
    machine_type = Column(String(50), nullable=False)  # 3-axis, 5-axis, lathe
    envelope_x_mm = Column(Float, nullable=False)
    envelope_y_mm = Column(Float, nullable=False)
    envelope_z_mm = Column(Float, nullable=False)
    machine_rate_override = Column(Numeric(10, 2), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    vendor = relationship("Vendor", back_populates="machine_capabilities")


class VendorMaterialExpertise(Base):
    """Material categories a vendor can confidently manufacture."""
    __tablename__ = "vendor_material_expertise"

    id = Column(UUID(), primary_key=True, default=uuid.uuid4)
    vendor_id = Column(UUID(), ForeignKey("vendors.id"), nullable=False, index=True)
    material_category = Column(String(50), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    vendor = relationship("Vendor", back_populates="material_expertise")


class VendorCertification(Base):
    """Certification evidence used as hard gate for matching."""
    __tablename__ = "vendor_certifications"

    id = Column(UUID(), primary_key=True, default=uuid.uuid4)
    vendor_id = Column(UUID(), ForeignKey("vendors.id"), nullable=False, index=True)
    certification_code = Column(String(50), nullable=False)  # ISO9001, AS9100
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    vendor = relationship("Vendor", back_populates="certifications")


# ============================================================================
# Customer Model (CRM-lite)
# ============================================================================

class Customer(Base):
    """A workspace-private customer record; quotes link to it while keeping
    their own free-text snapshot of the customer fields."""
    __tablename__ = "customers"

    id = Column(UUID(), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(), ForeignKey("users.id"), nullable=False, index=True)

    # name and company stay plaintext: the customer list searches them with
    # LIKE, which encrypted values cannot support. Contact details and tax id
    # are read-and-display only, so those are encrypted at rest.
    name = Column(String(200), nullable=False)
    email = Column(String(200), nullable=True, index=True)
    company = Column(String(200), nullable=True)
    phone = Column(EncryptedString(30), nullable=True)
    gstin = Column(EncryptedString(20), nullable=True)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User")
    quotes = relationship("Quote", back_populates="customer")


# ============================================================================
# CAD File Model
# ============================================================================

class CADFile(Base):
    """Uploaded CAD file."""
    __tablename__ = "cad_files"
    
    id = Column(UUID(), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(), ForeignKey("users.id"), nullable=False, index=True)
    original_filename = Column(String(255), nullable=False)
    stored_filename = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_hash = Column(String(64), nullable=False, index=True)  # SHA-256
    file_size = Column(Integer, nullable=False)  # bytes
    file_format = Column(String(10), nullable=False)  # step, stp, stl
    
    # Processing status
    processing_status = Column(
        SQLEnum(ProcessingStatus), 
        default=ProcessingStatus.PENDING
    )
    processing_error = Column(Text, nullable=True)
    processed_at = Column(DateTime, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="cad_files")
    geometry = relationship("GeometryAnalysis", back_populates="cad_file", uselist=False)
    quotes = relationship("Quote", back_populates="cad_file")


class GeometryAnalysis(Base):
    """Geometry analysis results for a CAD file."""
    __tablename__ = "geometry_analyses"
    
    id = Column(UUID(), primary_key=True, default=uuid.uuid4)
    cad_file_id = Column(UUID(), ForeignKey("cad_files.id"), nullable=False, unique=True)
    
    # Core metrics
    volume = Column(Float, nullable=False)  # cm³
    surface_area = Column(Float, nullable=False)  # cm²
    
    # Bounding box (cm)
    bbox_x = Column(Float, nullable=False)
    bbox_y = Column(Float, nullable=False)
    bbox_z = Column(Float, nullable=False)
    bounding_box_volume = Column(Float, nullable=False)  # cm³
    
    # Advanced metrics
    min_wall_thickness = Column(Float, nullable=True)  # mm
    hole_count = Column(Integer, default=0)
    # Fitted diameters (mm) of circular hole loops; None for legacy analyses.
    hole_diameters_mm = Column(JSON, nullable=True)

    # Exact B-rep features (STEP files with OCP installed); None otherwise.
    # Distinct hole-axis directions — drives the setup count in pricing.
    machining_direction_count = Column(Integer, nullable=True)
    solid_count = Column(Integer, nullable=True)
    # Per-hole detail: [{diameter_mm, depth_mm, axis}, ...]
    brep_hole_data = Column(JSON, nullable=True)
    
    # Computed scores
    complexity_score = Column(Float, nullable=False)  # surface_area / volume
    removal_ratio = Column(Float, nullable=False)  # volume / bounding_box_volume
    
    # Mesh info (for STL)
    triangle_count = Column(Integer, nullable=True)
    vertex_count = Column(Integer, nullable=True)
    
    # Processing info
    analysis_time_seconds = Column(Float, nullable=True)
    analysis_library = Column(String(50), nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    cad_file = relationship("CADFile", back_populates="geometry")


# ============================================================================
# Quote Model
# ============================================================================

class Quote(Base):
    """Generated quotation."""
    __tablename__ = "quotes"
    
    id = Column(UUID(), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(), ForeignKey("users.id"), nullable=False, index=True)
    quote_number = Column(String(20), unique=True, nullable=False, index=True)
    
    # Customer info (free-text snapshot; customer_id links the CRM record)
    customer_id = Column(UUID(), ForeignKey("customers.id"), nullable=True, index=True)
    customer_name = Column(String(200), nullable=True)
    customer_email = Column(String(200), nullable=True)
    customer_company = Column(String(200), nullable=True)

    # RFQ details
    rfq_number = Column(String(100), nullable=True)
    part_name = Column(String(200), nullable=True)
    part_number = Column(String(100), nullable=True)
    revision = Column(String(50), nullable=True)
    rfq_date = Column(DateTime, nullable=True)
    quote_due_date = Column(DateTime, nullable=True)
    annual_volume = Column(Integer, nullable=True)
    batch_size = Column(Integer, nullable=True)
    target_price = Column(Numeric(12, 2), nullable=True)
    application = Column(Text, nullable=True)

    # Part and material details
    raw_form = Column(String(100), nullable=True)
    raw_size = Column(String(100), nullable=True)
    net_weight_kg = Column(Float, nullable=True)
    raw_weight_kg = Column(Float, nullable=True)
    buy_to_fly_ratio = Column(Float, nullable=True)
    requested_surface_finish = Column(String(100), nullable=True)
    tolerance_notes = Column(String(100), nullable=True)
    hsn_code = Column(String(50), nullable=True)
    complexity_level = Column(String(50), nullable=True)

    # Process routing matrix snapshot
    process_routing = Column(JSON, nullable=True)
    
    # References
    cad_file_id = Column(UUID(), ForeignKey("cad_files.id"), nullable=False)
    material_id = Column(UUID(), ForeignKey("materials.id"), nullable=False)
    surface_finish_id = Column(UUID(), ForeignKey("surface_finishes.id"), nullable=False)
    inspection_level_id = Column(UUID(), ForeignKey("inspection_levels.id"), nullable=False)

    # Vendor matching
    matched_vendor_id = Column(UUID(), ForeignKey("vendors.id"), nullable=True)
    vendor_match_details = Column(JSON, nullable=True)
    
    # Quantity
    quantity = Column(Integer, default=1)
    
    # Price breakdown (stored for historical accuracy)
    material_cost = Column(Numeric(14, 2), nullable=False)
    machining_cost = Column(Numeric(14, 2), nullable=False)
    finish_cost = Column(Numeric(14, 2), nullable=False)
    inspection_cost = Column(Numeric(14, 2), nullable=False)
    subtotal = Column(Numeric(14, 2), nullable=False)
    margin_factor = Column(Float, nullable=False)
    total_price = Column(Numeric(14, 2), nullable=False)
    unit_price = Column(Numeric(14, 2), nullable=False)
    
    # Lead time (days)
    estimated_lead_time_days = Column(Float, nullable=False)
    
    # Status and validity
    status = Column(SQLEnum(QuoteStatus), default=QuoteStatus.DRAFT)
    valid_until = Column(DateTime, nullable=False)

    # Customer-facing share link and response
    share_token = Column(String(64), unique=True, nullable=True, index=True)
    customer_response_note = Column(Text, nullable=True)
    responded_at = Column(DateTime, nullable=True)

    # Calibration loop: engine metrics snapshotted at creation, and the
    # machinist/vendor-corrected values recorded after the job is quoted or
    # run. Predicted-vs-actual pairs are the dataset the pricing
    # coefficients get refit against.
    predicted_costing = Column(JSON, nullable=True)
    actual_costing = Column(JSON, nullable=True)

    # Commercial terms
    price_validity = Column(String(100), nullable=True)
    gst = Column(String(50), nullable=True)
    delivery = Column(String(200), nullable=True)
    payment_terms = Column(String(200), nullable=True)
    incoterms = Column(String(50), nullable=True)
    tooling_ownership = Column(String(200), nullable=True)
    packaging = Column(String(200), nullable=True)
    terms_and_conditions = Column(Text, nullable=True)
    dfm_exceptions = Column(Text, nullable=True)
    
    # Document
    pdf_path = Column(String(500), nullable=True)
    
    # Metadata
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="quotes")
    customer = relationship("Customer", back_populates="quotes")
    cad_file = relationship("CADFile", back_populates="quotes")
    material = relationship("Material", back_populates="quotes")
    surface_finish = relationship("SurfaceFinish", back_populates="quotes")
    inspection_level = relationship("InspectionLevel", back_populates="quotes")
    matched_vendor = relationship("Vendor", back_populates="quotes")
