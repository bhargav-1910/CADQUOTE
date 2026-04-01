/**
 * TypeScript type definitions for the CNC Quote Platform API
 */

// Enums
export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type QuoteStatus = 'draft' | 'generated' | 'sent' | 'expired';

// Base types
export interface BoundingBox {
  x: number;
  y: number;
  z: number;
  volume: number;
}

export type DFMSeverity = 'error' | 'warning' | 'info';

export interface DFMIssue {
  severity: DFMSeverity;
  code: string;
  title: string;
  description: string;
  recommendation: string;
  penalty: number;
  confidence: number;
}

export interface DFMAnalysisResult {
  score: number;
  label: 'Excellent' | 'Good' | 'Moderate' | 'High Risk';
  issues: DFMIssue[];
  has_blocking_issue: boolean;
  total_penalty: number;
  confidence_score: number;
}

// Material
export interface Material {
  id: string;
  name: string;
  description: string | null;
  category: string;
  density: number;
  cost_per_kg: number;
  machining_difficulty_factor: number;
  availability_factor: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Surface Finish
export interface SurfaceFinish {
  id: string;
  name: string;
  description: string | null;
  cost_multiplier: number;
  fixed_cost: number;
  lead_time_addition_days: number;
  compatible_materials: string[] | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Inspection Level
export interface InspectionLevel {
  id: string;
  name: string;
  description: string | null;
  fixed_cost: number;
  percentage_cost: number;
  lead_time_addition_days: number;
  includes_certificate: boolean;
  includes_cmm_report: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// CAD File
export interface CADFile {
  id: string;
  original_filename: string;
  file_format: string;
  file_size: number;
  file_hash: string;
  processing_status: ProcessingStatus;
  processing_error: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface CADFileUploadResponse extends CADFile {
  message: string;
}

// Geometry Analysis
export interface GeometryAnalysis {
  id: string;
  cad_file_id: string;
  volume: number;
  surface_area: number;
  bounding_box: BoundingBox;
  min_wall_thickness: number | null;
  hole_count: number;
  complexity_score: number;
  removal_ratio: number;
  triangle_count: number | null;
  vertex_count: number | null;
  analysis_time_seconds: number | null;
  dfm_analysis?: DFMAnalysisResult | null;
  created_at: string;
}

// Pricing
export interface PriceBreakdown {
  material_cost: number;
  machining_cost: number;
  finish_cost: number;
  inspection_cost: number;
  subtotal: number;
  margin_factor: number;
  total_price: number;
  unit_price: number;
}

export interface PricingOverrides {
  material_cost_per_kg?: number;
  material_machining_difficulty_factor?: number;
  surface_finish_fixed_cost?: number;
  surface_finish_cost_multiplier?: number;
  inspection_fixed_cost?: number;
  inspection_percentage_cost?: number;
  machine_hourly_rate?: number;
  machine_efficiency_rate?: number;
  machine_setup_time_hours?: number;
  margin_factor?: number;
}

export interface PricingRequest {
  cad_file_id: string;
  material_id: string;
  surface_finish_id: string;
  inspection_level_id: string;
  quantity: number;
  pricing_overrides?: PricingOverrides;
}

export interface BatchPricingRequest {
  cad_file_ids: string[];
  material_id: string;
  surface_finish_id: string;
  inspection_level_id: string;
  quantity: number;
  pricing_overrides?: PricingOverrides;
}

export interface PricingResponse {
  cad_file_id: string;
  file_name: string;
  quantity: number;
  material: Material;
  surface_finish: SurfaceFinish;
  inspection_level: InspectionLevel;
  volume_cm3: number;
  weight_kg: number;
  bounding_box: BoundingBox;
  complexity_score: number;
  dfm_analysis?: DFMAnalysisResult | null;
  price_breakdown: PriceBreakdown;
  estimated_lead_time_days: number;
  pricing_explanation: Record<string, unknown>;
}

export interface BatchPricingResponse {
  results: PricingResponse[];
  priced_count: number;
}

// Quote
export interface QuoteCreateRequest {
  cad_file_id: string;
  material_id: string;
  surface_finish_id: string;
  inspection_level_id: string;
  quantity: number;
  pricing_overrides?: PricingOverrides;
  customer_name?: string;
  customer_email?: string;
  customer_company?: string;
  notes?: string;
  auto_send_email?: boolean;
}

export interface BatchQuoteCreateRequest {
  cad_file_ids: string[];
  material_id: string;
  surface_finish_id: string;
  inspection_level_id: string;
  quantity: number;
  pricing_overrides?: PricingOverrides;
  customer_name?: string;
  customer_email?: string;
  customer_company?: string;
  notes?: string;
  auto_send_email?: boolean;
}

export interface CombinedQuoteLineItemRequest {
  cad_file_id: string;
  material_id: string;
  surface_finish_id: string;
  inspection_level_id: string;
  quantity: number;
}

export interface CombinedQuoteCreateRequest {
  items: CombinedQuoteLineItemRequest[];
  pricing_overrides?: PricingOverrides;
  customer_name?: string;
  customer_email?: string;
  customer_company?: string;
  notes?: string;
  auto_send_email?: boolean;
}

export interface BatchQuoteResponse {
  quotes: Quote[];
  total_price: number;
  quote_count: number;
}

export interface QuoteEmailRequest {
  recipient_email?: string;
  subject?: string;
  message?: string;
  mailbox_access_consent?: boolean;
  send_as_logged_in_user?: boolean;
}

export interface QuoteEmailResponse {
  message: string;
  recipient_email: string;
  quote_id: string;
}

export interface PointsPackage {
  id: string;
  name: string;
  points: number;
  price_minor: number;
  currency: string;
  is_active: boolean;
  display_order: number;
}

export interface CreatePointsPackageRequest {
  package_code: string;
  name: string;
  points: number;
  price_minor: number;
  currency: string;
  is_active: boolean;
  display_order: number;
}

export interface UpdatePointsPackageRequest {
  name?: string;
  points?: number;
  price_minor?: number;
  currency?: string;
  is_active?: boolean;
  display_order?: number;
}

export interface PointsWallet {
  balance_points: number;
}

export interface PointsLedgerEntry {
  id: string;
  delta_points: number;
  balance_after: number;
  action: string;
  description: string | null;
  created_at: string;
}

export interface CreateCheckoutSessionRequest {
  package_id: string;
  success_url?: string;
  cancel_url?: string;
}

export interface CreateCheckoutSessionResponse {
  checkout_url: string;
  session_id: string;
}

export interface Quote {
  id: string;
  quote_number: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_company: string | null;
  cad_file: CADFile;
  material: Material;
  surface_finish: SurfaceFinish;
  inspection_level: InspectionLevel;
  quantity: number;
  material_cost: number;
  machining_cost: number;
  finish_cost: number;
  inspection_cost: number;
  subtotal: number;
  margin_factor: number;
  total_price: number;
  unit_price: number;
  estimated_lead_time_days: number;
  status: QuoteStatus;
  valid_until: string;
  pdf_path: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuoteListItem {
  id: string;
  quote_number: string;
  customer_name: string | null;
  total_price: number;
  status: QuoteStatus;
  valid_until: string;
  created_at: string;
}

// App State
export interface QuoteConfiguration {
  cadFile: CADFile | null;
  geometry: GeometryAnalysis | null;
  materialId: string | null;
  surfaceFinishId: string | null;
  inspectionLevelId: string | null;
  quantity: number;
  customerName: string;
  customerEmail: string;
  customerCompany: string;
  notes: string;
}

// Authentication
export interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  company_name: string;
  company_address: string;
  phone_number: string | null;
  company_logo_url: string | null;
  created_at: string;
}

export interface UpdateProfileRequest {
  full_name: string;
  company_name: string;
  company_address: string;
  phone_number?: string;
  logo?: File;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface SignupRequest {
  full_name: string;
  email: string;
  password: string;
  company_name: string;
  company_address: string;
  otp: string;
  logo?: File;
}

export interface SignupOtpRequest {
  email: string;
}

export interface SignupOtpResponse {
  message: string;
  expires_in_seconds: number;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  new_password: string;
}

export interface GenericMessageResponse {
  message: string;
}

export interface AuthTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: UserProfile;
}
