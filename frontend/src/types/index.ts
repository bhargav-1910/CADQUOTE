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
  price_breakdown: PriceBreakdown;
  estimated_lead_time_days: number;
  pricing_explanation: Record<string, unknown>;
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
}

export interface BatchQuoteResponse {
  quotes: Quote[];
  total_price: number;
  quote_count: number;
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
