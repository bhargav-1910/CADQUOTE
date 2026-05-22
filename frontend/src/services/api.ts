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
  ForgotPasswordRequest,
  ResetPasswordRequest,
  GenericMessageResponse,
  AuthTokenResponse,
  UserProfile,
  UpdateProfileRequest,
  QuoteEmailRequest,
  QuoteEmailResponse,
  PointsPackage,
  PointsWallet,
  PointsLedgerEntry,
  CreatePointsPackageRequest,
  UpdatePointsPackageRequest,
  CreateCheckoutSessionRequest,
  CreateCheckoutSessionResponse,
  VendorMatchSummary,
} from '@/types';

const AUTH_TOKEN_KEY = 'forgequote.auth.token';
const REFRESH_TOKEN_KEY = 'forgequote.auth.refresh-token';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api';

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: apiBaseUrl,
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

const formatApiErrorDetail = (detail: unknown): string | null => {
  if (typeof detail === 'string') {
    return detail;
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }

        if (item && typeof item === 'object') {
          const errorItem = item as { loc?: unknown; msg?: unknown; message?: unknown };
          const rawMessage = typeof errorItem.msg === 'string'
            ? errorItem.msg
            : typeof errorItem.message === 'string'
            ? errorItem.message
            : null;

          if (!rawMessage) {
            return null;
          }

          if (Array.isArray(errorItem.loc)) {
            const fieldPath = errorItem.loc
              .filter((segment) => segment !== 'body')
              .map((segment) => String(segment))
              .join('.');

            return fieldPath ? `${fieldPath}: ${rawMessage}` : rawMessage;
          }

          return rawMessage;
        }

        return null;
      })
      .filter((message): message is string => Boolean(message));

    if (messages.length > 0) {
      return messages.join(' | ');
    }
  }

  if (detail && typeof detail === 'object') {
    const detailObject = detail as { message?: unknown; detail?: unknown; error?: unknown };

    if (typeof detailObject.message === 'string') {
      return detailObject.message;
    }

    if (typeof detailObject.detail === 'string') {
      return detailObject.detail;
    }

    if (typeof detailObject.error === 'string') {
      return detailObject.error;
    }
  }

  return null;
};

// Error handler
const handleError = (error: AxiosError): never => {
  if (error.response) {
    const data = error.response.data as { detail?: unknown; message?: unknown; error?: unknown };
    const message =
      formatApiErrorDetail(data?.detail) ??
      (typeof data?.message === 'string' ? data.message : null) ??
      (typeof data?.error === 'string' ? data.error : null) ??
      `API Error: ${error.response.status}`;

    throw new Error(message);
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

export const updateCurrentUser = async (payload: UpdateProfileRequest): Promise<UserProfile> => {
  try {
    const formData = new FormData();
    formData.append('full_name', payload.full_name);
    formData.append('company_name', payload.company_name);
    formData.append('company_address', payload.company_address);
    formData.append('phone_number', payload.phone_number ?? '');
    if (payload.logo) {
      formData.append('logo', payload.logo);
    }

    const response = await api.patch<UserProfile>('/auth/me', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
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

export const getQuotePDFPreviewUrl = (quoteId: string): string => {
  return `/api/quotes/${quoteId}/pdf/preview`;
};

export const fetchQuotePDFPreviewBlob = async (quoteId: string): Promise<Blob> => {
  try {
    const response = await api.get<Blob>(`/quotes/${quoteId}/pdf/preview`, {
      responseType: 'blob',
    });
    return response.data;
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
// Billing API
// ============================================================================

export const getPointsPackages = async (includeInactive = false): Promise<PointsPackage[]> => {
  try {
    const response = await api.get<PointsPackage[]>('/billing/packages', {
      params: { include_inactive: includeInactive },
    });
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export const createPointsPackage = async (payload: CreatePointsPackageRequest): Promise<PointsPackage> => {
  try {
    const response = await api.post<PointsPackage>('/billing/packages', payload);
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export const updatePointsPackage = async (
  packageCode: string,
  payload: UpdatePointsPackageRequest,
): Promise<PointsPackage> => {
  try {
    const response = await api.patch<PointsPackage>(`/billing/packages/${packageCode}`, payload);
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export const getPointsWallet = async (): Promise<PointsWallet> => {
  try {
    const response = await api.get<PointsWallet>('/billing/wallet');
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export const getPointsLedger = async (limit = 50): Promise<PointsLedgerEntry[]> => {
  try {
    const response = await api.get<PointsLedgerEntry[]>('/billing/ledger', {
      params: { limit },
    });
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export const createStripeCheckoutSession = async (
  payload: CreateCheckoutSessionRequest,
): Promise<CreateCheckoutSessionResponse> => {
  try {
    const response = await api.post<CreateCheckoutSessionResponse>('/billing/checkout-session', payload);
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
  setup_hour_rate: number;
  efficiency_rate: number;
  setup_time_hours: number;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface VendorMachineCapability {
  id: string;
  vendor_id: string;
  machine_type: string;
  envelope_x_mm: number;
  envelope_y_mm: number;
  envelope_z_mm: number;
  machine_rate_override?: number | null;
  is_active: boolean;
}

export interface VendorMaterialExpertise {
  id: string;
  vendor_id: string;
  material_category: string;
  is_active: boolean;
}

export interface VendorCertification {
  id: string;
  vendor_id: string;
  certification_code: string;
  is_active: boolean;
}

export interface Vendor {
  id: string;
  name: string;
  quality_rating: number;
  on_time_rating: number;
  current_load_pct: number;
  notes?: string | null;
  is_active: boolean;
  machine_capabilities: VendorMachineCapability[];
  material_expertise: VendorMaterialExpertise[];
  certifications: VendorCertification[];
}

export interface VendorMatchPreviewResponse {
  matched: boolean;
  selected_vendor: VendorMatchSummary | null;
  details: Record<string, unknown>;
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

export const getVendors = async (activeOnly = true): Promise<Vendor[]> => {
  try {
    const response = await api.get<Vendor[]>('/config/vendors', {
      params: { active_only: activeOnly },
    });
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export const previewVendorMatch = async (
  payload: {
    cad_file_id: string;
    material_id: string;
    required_certifications?: string[];
    machine_name?: string;
  },
): Promise<VendorMatchPreviewResponse> => {
  try {
    const response = await api.post<VendorMatchPreviewResponse>('/quotes/match-vendors', payload);
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

// Export api instance for advanced usage
export default api;
