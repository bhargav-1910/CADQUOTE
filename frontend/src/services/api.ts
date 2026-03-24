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
  BatchPricingRequest,
  BatchPricingResponse,
  QuoteCreateRequest,
  BatchQuoteCreateRequest,
  CombinedQuoteCreateRequest,
  BatchQuoteResponse,
  Quote,
  QuoteListItem,
  LoginRequest,
  SignupRequest,
  SignupOtpRequest,
  SignupOtpResponse,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  GenericMessageResponse,
  AuthTokenResponse,
  UserProfile,
  QuoteEmailRequest,
  QuoteEmailResponse,
} from '@/types';

const AUTH_TOKEN_KEY = 'forgequote.auth.token';
const REFRESH_TOKEN_KEY = 'forgequote.auth.refresh-token';

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

let refreshPromise: Promise<AuthTokenResponse> | null = null;

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as (typeof error.config & { _retry?: boolean });
    const status = error.response?.status as number | undefined;
    const url = originalRequest?.url ?? '';

    const isAuthEndpoint =
      url.includes('/auth/login') ||
      url.includes('/auth/register') ||
      url.includes('/auth/refresh') ||
      url.includes('/auth/logout');

    if (status === 401 && !originalRequest?._retry && !isAuthEndpoint) {
      try {
        originalRequest._retry = true;
        if (!refreshPromise) {
          refreshPromise = refreshAccessToken();
        }
        await refreshPromise;
        refreshPromise = null;
        return api(originalRequest);
      } catch {
        refreshPromise = null;
        clearAuthTokens();
        window.dispatchEvent(new Event('auth:logout'));
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }
    }

    return Promise.reject(error);
  },
);

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

export const fetchFilePreviewBlob = async (fileId: string): Promise<Blob> => {
  try {
    const response = await api.get<Blob>(`/files/${fileId}/preview`, {
      responseType: 'blob',
    });
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

const triggerBlobDownload = (blob: Blob, filename: string): void => {
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(objectUrl);
};

// ============================================================================
// Authentication API
// ============================================================================

export const setAuthToken = (token: string | null): void => {
  if (token) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }
};

export const setRefreshToken = (token: string | null): void => {
  if (token) {
    localStorage.setItem(REFRESH_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }
};

export const setAuthTokens = (accessToken: string | null, refreshToken: string | null): void => {
  setAuthToken(accessToken);
  setRefreshToken(refreshToken);
};

export const clearAuthTokens = (): void => {
  setAuthTokens(null, null);
};

export const getAuthToken = (): string | null => {
  return localStorage.getItem(AUTH_TOKEN_KEY);
};

export const getRefreshToken = (): string | null => {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
};

export const refreshAccessToken = async (): Promise<AuthTokenResponse> => {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    throw new Error('No refresh token available');
  }

  try {
    const response = await api.post<AuthTokenResponse>('/auth/refresh', {
      refresh_token: refreshToken,
    });
    setAuthTokens(response.data.access_token, response.data.refresh_token);
    return response.data;
  } catch (error) {
    clearAuthTokens();
    return handleError(error as AxiosError);
  }
};

export const logoutUser = async (): Promise<void> => {
  try {
    await api.post('/auth/logout');
  } finally {
    clearAuthTokens();
  }
};

export const loginUser = async (payload: LoginRequest): Promise<AuthTokenResponse> => {
  try {
    const response = await api.post<AuthTokenResponse>('/auth/login', payload);
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export const signupUser = async (payload: SignupRequest): Promise<AuthTokenResponse> => {
  try {
    const formData = new FormData();
    formData.append('full_name', payload.full_name);
    formData.append('email', payload.email);
    formData.append('password', payload.password);
    formData.append('company_name', payload.company_name);
    formData.append('company_address', payload.company_address);
    formData.append('otp', payload.otp);
    if (payload.logo) {
      formData.append('logo', payload.logo);
    }

    const response = await api.post<AuthTokenResponse>('/auth/register', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export const getCurrentUser = async (): Promise<UserProfile> => {
  try {
    const response = await api.get<UserProfile>('/auth/me');
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export const requestSignupOtp = async (payload: SignupOtpRequest): Promise<SignupOtpResponse> => {
  try {
    const response = await api.post<SignupOtpResponse>('/auth/register/request-otp', payload);
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export const requestPasswordReset = async (payload: ForgotPasswordRequest): Promise<GenericMessageResponse> => {
  try {
    const response = await api.post<GenericMessageResponse>('/auth/password/forgot', payload);
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export const resetPassword = async (payload: ResetPasswordRequest): Promise<GenericMessageResponse> => {
  try {
    const response = await api.post<GenericMessageResponse>('/auth/password/reset', payload);
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
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

export const getBatchPricing = async (request: BatchPricingRequest): Promise<BatchPricingResponse> => {
  try {
    const response = await api.post<BatchPricingResponse>('/pricing/batch', request);
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

export const createBatchQuote = async (request: BatchQuoteCreateRequest): Promise<BatchQuoteResponse> => {
  try {
    const response = await api.post<BatchQuoteResponse>('/quotes/batch', request);
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export const createCombinedQuote = async (request: CombinedQuoteCreateRequest): Promise<Quote> => {
  try {
    const response = await api.post<Quote>('/quotes/combined', request);
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

export const downloadQuotePDF = async (quoteId: string, quoteNumber?: string): Promise<void> => {
  try {
    const response = await api.get<Blob>(`/quotes/${quoteId}/pdf/download`, {
      responseType: 'blob',
    });
    const filename = quoteNumber ? `${quoteNumber}.pdf` : `quote-${quoteId}.pdf`;
    triggerBlobDownload(response.data, filename);
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export const sendQuoteEmail = async (
  quoteId: string,
  payload: QuoteEmailRequest,
): Promise<QuoteEmailResponse> => {
  try {
    const response = await api.post<QuoteEmailResponse>(`/quotes/${quoteId}/email`, payload);
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
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
