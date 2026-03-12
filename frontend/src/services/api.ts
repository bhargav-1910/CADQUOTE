/**
 * API client for CNC Quote Platform backend
 */
import axios, { AxiosInstance, AxiosError } from 'axios';
import type {
  CADFile,
  CADFileUploadResponse,
  GeometryAnalysis,
  Material,
  SurfaceFinish,
  InspectionLevel,
  PricingRequest,
  PricingResponse,
  QuoteCreateRequest,
  Quote,
  QuoteListItem,
} from '@/types';

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Error handler
const handleError = (error: AxiosError): never => {
  if (error.response) {
    const data = error.response.data as { detail?: string };
    throw new Error(data.detail || `API Error: ${error.response.status}`);
  } else if (error.request) {
    throw new Error('Network error. Please check your connection.');
  } else {
    throw new Error(error.message);
  }
};

// ============================================================================
// File Upload API
// ============================================================================

export const uploadCADFile = async (file: File): Promise<CADFileUploadResponse> => {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await api.post<CADFileUploadResponse>('/files/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export const getCADFile = async (fileId: string): Promise<CADFile> => {
  try {
    const response = await api.get<CADFile>(`/files/${fileId}`);
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export const getGeometryAnalysis = async (fileId: string): Promise<GeometryAnalysis> => {
  try {
    const response = await api.get<GeometryAnalysis>(`/files/${fileId}/geometry`, {
      validateStatus: (status) => status === 200, // Only treat 200 as success, throw on 202
    });
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export const triggerProcessing = async (fileId: string): Promise<{ status: string; geometry_id: string }> => {
  try {
    const response = await api.post<{ status: string; geometry_id: string }>(`/files/${fileId}/process`);
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export const getFileDownloadUrl = (fileId: string): string => {
  return `/api/files/${fileId}/download`;
};

export const getFilePreviewUrl = (fileId: string): string => {
  return `/api/files/${fileId}/preview`;
};

// ============================================================================
// Configuration API
// ============================================================================

export const getMaterials = async (activeOnly = true): Promise<Material[]> => {
  try {
    const response = await api.get<Material[]>('/config/materials', {
      params: { active_only: activeOnly },
    });
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export const getSurfaceFinishes = async (activeOnly = true): Promise<SurfaceFinish[]> => {
  try {
    const response = await api.get<SurfaceFinish[]>('/config/finishes', {
      params: { active_only: activeOnly },
    });
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export const getInspectionLevels = async (activeOnly = true): Promise<InspectionLevel[]> => {
  try {
    const response = await api.get<InspectionLevel[]>('/config/inspections', {
      params: { active_only: activeOnly },
    });
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

// ============================================================================
// Pricing API
// ============================================================================

export const getInstantPricing = async (request: PricingRequest): Promise<PricingResponse> => {
  try {
    const response = await api.post<PricingResponse>('/pricing', request);
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

// ============================================================================
// Quote API
// ============================================================================

export const createQuote = async (request: QuoteCreateRequest): Promise<Quote> => {
  try {
    const response = await api.post<Quote>('/quotes', request);
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export const getQuote = async (quoteId: string): Promise<Quote> => {
  try {
    const response = await api.get<Quote>(`/quotes/${quoteId}`);
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export const getQuoteByNumber = async (quoteNumber: string): Promise<Quote> => {
  try {
    const response = await api.get<Quote>(`/quotes/number/${quoteNumber}`);
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export const listQuotes = async (skip = 0, limit = 50): Promise<QuoteListItem[]> => {
  try {
    const response = await api.get<QuoteListItem[]>('/quotes', {
      params: { skip, limit },
    });
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export const generateQuotePDF = async (quoteId: string): Promise<{ pdf_path: string; message: string }> => {
  try {
    const response = await api.post<{ pdf_path: string; message: string }>(`/quotes/${quoteId}/pdf`);
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export const getQuotePDFUrl = (quoteId: string): string => {
  return `/api/quotes/${quoteId}/pdf/download`;
};

// ============================================================================
// Admin / Pricing Config API
// ============================================================================

export const updateMaterial = async (materialId: string, data: Partial<Material>): Promise<Material> => {
  try {
    const response = await api.patch<Material>(`/config/materials/${materialId}`, data);
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export const updateSurfaceFinish = async (finishId: string, data: Partial<SurfaceFinish>): Promise<SurfaceFinish> => {
  try {
    const response = await api.patch<SurfaceFinish>(`/config/finishes/${finishId}`, data);
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export const updateInspectionLevel = async (inspectionId: string, data: Partial<InspectionLevel>): Promise<InspectionLevel> => {
  try {
    const response = await api.patch<InspectionLevel>(`/config/inspections/${inspectionId}`, data);
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export interface MachineRate {
  id: string;
  name: string;
  description: string | null;
  hourly_rate: number;
  efficiency_rate: number;
  setup_time_hours: number;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const getMachineRates = async (): Promise<MachineRate[]> => {
  try {
    const response = await api.get<MachineRate[]>('/config/machine-rates');
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export const updateMachineRate = async (rateId: string, data: Partial<MachineRate>): Promise<MachineRate> => {
  try {
    const response = await api.patch<MachineRate>(`/config/machine-rates/${rateId}`, data);
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

// Export api instance for advanced usage
export default api;
