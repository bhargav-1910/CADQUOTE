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
  AuthTokenResponse,
  UserProfile,
  UpdateProfileRequest,
  Customer,
  CustomerCreateRequest,
  CustomerUpdateRequest,
  PointsPackage,
  PointsWallet,
  PointsLedgerEntry,
  CreatePointsPackageRequest,
  UpdatePointsPackageRequest,
  CreateCheckoutSessionRequest,
  CreateCheckoutSessionResponse,
  VendorMatchSummary,
  QuoteShareResponse,
  PublicQuote,
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
  // Required so the HttpOnly, SameSite=Strict refresh cookie is sent to
  // /api/auth/refresh. The API is same-origin in dev (Vite proxy) and in
  // production (nginx), so this does not widen the CORS surface.
  withCredentials: true,
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

    // Subscription gate hit: let the app show the upgrade prompt globally.
    if (status === 402) {
      const detail = error.response?.data?.detail;
      if (typeof detail === 'string' && detail.startsWith('subscription_required')) {
        window.dispatchEvent(new CustomEvent('billing:subscription-required'));
      }
    }

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

export const fetchFileDownloadBlob = async (fileId: string): Promise<Blob> => {
  try {
    const response = await api.get<Blob>(`/files/${fileId}/download`, {
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
  // The refresh token normally travels in the HttpOnly cookie, which this code
  // cannot read — that is the point. The stored copy is only a fallback for
  // browsers where the cookie was blocked.
  const refreshToken = getRefreshToken();

  try {
    const response = await api.post<AuthTokenResponse>('/auth/refresh', {
      refresh_token: refreshToken,
    });
    setAuthToken(response.data.access_token);
    // Keep the fallback copy only if we were already relying on it.
    if (refreshToken) {
      setRefreshToken(response.data.refresh_token);
    }
    return response.data;
  } catch (error) {
    clearAuthTokens();
    return handleError(error as AxiosError);
  }
};

// ============================================================================
// Password recovery and account management
// ============================================================================

export const requestPasswordReset = async (email: string): Promise<{ message: string }> => {
  try {
    const response = await api.post<{ message: string }>('/auth/forgot-password', { email });
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export const confirmPasswordReset = async (
  token: string,
  newPassword: string,
): Promise<{ message: string }> => {
  try {
    const response = await api.post<{ message: string }>('/auth/reset-password', {
      token,
      new_password: newPassword,
    });
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export const changePassword = async (
  currentPassword: string,
  newPassword: string,
): Promise<{ message: string }> => {
  try {
    const response = await api.post<{ message: string }>('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export const deleteAccount = async (
  password: string,
  confirm: string,
): Promise<{ message: string }> => {
  try {
    const response = await api.delete<{ message: string }>('/auth/me', {
      data: { password, confirm },
    });
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

/** Whether the client should present a challenge before the next sign-in. */
export const getLoginChallenge = async (email?: string): Promise<boolean> => {
  try {
    const response = await api.get<{ challenge_required: boolean }>('/auth/login-challenge', {
      params: email ? { email } : undefined,
    });
    return response.data.challenge_required;
  } catch {
    return false;
  }
};

// ============================================================================
// Legal & consent
// ============================================================================

export interface LegalInfoResponse {
  app_name: string;
  company_name: string;
  contact_email: string;
  privacy_email: string;
  security_email: string;
  company_address: string;
  jurisdiction: string;
  policy_version: string;
  data_retention_days: number;
  documents: { slug: string; title: string; url: string }[];
}

export const getLegalInfo = async (): Promise<LegalInfoResponse> => {
  const response = await api.get<LegalInfoResponse>('/legal/info');
  return response.data;
};

export interface ConsentPayload {
  subject_key: string;
  policy_version: string;
  preferences: boolean;
  analytics: boolean;
  marketing: boolean;
  source: string;
}

export const recordConsent = async (payload: ConsentPayload): Promise<void> => {
  await api.post('/legal/consent', payload);
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
    formData.append('company_address', payload.company_address ?? '');
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
    formData.append('gstin', payload.gstin ?? '');
    if (payload.brand_color !== undefined) {
      formData.append('brand_color', payload.brand_color);
    }
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

export const deleteQuote = async (quoteId: string): Promise<void> => {
  try {
    await api.delete(`/quotes/${quoteId}`);
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export const fetchFileThumbnailBlob = async (fileId: string): Promise<Blob> => {
  const response = await api.get(`/files/${fileId}/thumbnail`, { responseType: 'blob' });
  return response.data as Blob;
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

// ============================================================================
// Quote Sharing (customer-facing) API
// ============================================================================

export const shareQuote = async (quoteId: string): Promise<QuoteShareResponse> => {
  try {
    const response = await api.post<QuoteShareResponse>(`/quotes/${quoteId}/share`);
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

/** Record machinist-corrected costing values (calibration loop). */
export const recordQuoteActuals = async (
  quoteId: string,
  actuals: Record<string, number | string>,
): Promise<Quote> => {
  try {
    const response = await api.put<Quote>(`/quotes/${quoteId}/actuals`, actuals);
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

/** Owner-side: record a decision received outside the share link (forwarded PDF, phone call). */
export const respondToQuote = async (
  quoteId: string,
  action: 'accept' | 'decline',
  note?: string,
): Promise<Quote> => {
  try {
    const response = await api.post<Quote>(`/quotes/${quoteId}/respond`, {
      action,
      note: note || null,
    });
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export const getPublicQuote = async (shareToken: string): Promise<PublicQuote> => {
  try {
    const response = await api.get<PublicQuote>(`/public/quotes/${shareToken}`);
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export const respondToPublicQuote = async (
  shareToken: string,
  action: 'accept' | 'decline',
  note?: string,
): Promise<PublicQuote> => {
  try {
    const response = await api.post<PublicQuote>(`/public/quotes/${shareToken}/respond`, {
      action,
      note: note || null,
    });
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export const getPublicQuotePdfUrl = (shareToken: string): string => {
  return `${apiBaseUrl}/public/quotes/${shareToken}/pdf`;
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
// Email verification & two-factor authentication
// ============================================================================

export interface TotpStatus {
  enabled: boolean;
  confirmed_at: string | null;
  backup_codes_remaining: number;
}

export interface TotpSetup {
  secret: string;
  otpauth_uri: string;
  backup_codes: string[];
}

export const verifyEmail = async (token: string): Promise<{ message: string }> => {
  try {
    const response = await api.post<{ message: string }>('/auth/verify-email', { token });
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export const resendVerification = async (): Promise<{ message: string }> => {
  try {
    const response = await api.post<{ message: string }>('/auth/resend-verification');
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export const getTotpStatus = async (): Promise<TotpStatus> => {
  try {
    const response = await api.get<TotpStatus>('/auth/totp');
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

/** Begin enrolment. The secret and recovery codes are returned exactly once. */
export const setupTotp = async (): Promise<TotpSetup> => {
  try {
    const response = await api.post<TotpSetup>('/auth/totp/setup');
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export const enableTotp = async (code: string): Promise<{ message: string }> => {
  try {
    const response = await api.post<{ message: string }>('/auth/totp/enable', { code });
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export const disableTotp = async (password: string): Promise<{ message: string }> => {
  try {
    const response = await api.post<{ message: string }>('/auth/totp/disable', { password });
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

// ============================================================================
// Pricing Catalog API (per workspace)
//
// Editing a system default copies it into your workspace first, so the PATCH
// response may carry a different id than the row you edited. Callers must key
// off the returned row rather than assuming the id is stable.
// ============================================================================

/** Scope of a catalog write: your own workspace, or the shared default (admin). */
export type CatalogScope = 'mine' | 'global';

const scopeQuery = (scope: CatalogScope) => (scope === 'global' ? '?scope=global' : '');

/** True when this row is a customisation rather than the shared default. */
export const isCustomised = (row: { user_id?: string | null }): boolean =>
  Boolean(row.user_id);

export const updateMaterial = async (
  materialId: string,
  data: Partial<Material>,
  scope: CatalogScope = 'mine',
): Promise<Material> => {
  try {
    const response = await api.patch<Material>(`/config/materials/${materialId}${scopeQuery(scope)}`, data);
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export const updateSurfaceFinish = async (
  finishId: string,
  data: Partial<SurfaceFinish>,
  scope: CatalogScope = 'mine',
): Promise<SurfaceFinish> => {
  try {
    const response = await api.patch<SurfaceFinish>(`/config/finishes/${finishId}${scopeQuery(scope)}`, data);
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export const updateInspectionLevel = async (
  inspectionId: string,
  data: Partial<InspectionLevel>,
  scope: CatalogScope = 'mine',
): Promise<InspectionLevel> => {
  try {
    const response = await api.patch<InspectionLevel>(`/config/inspections/${inspectionId}${scopeQuery(scope)}`, data);
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

/** Delete a customisation, restoring the shared system default. */
export const resetMaterial = async (materialId: string): Promise<void> => {
  try {
    await api.delete(`/config/materials/${materialId}`);
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export const resetSurfaceFinish = async (finishId: string): Promise<void> => {
  try {
    await api.delete(`/config/finishes/${finishId}`);
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export const resetInspectionLevel = async (inspectionId: string): Promise<void> => {
  try {
    await api.delete(`/config/inspections/${inspectionId}`);
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export const resetMachineRate = async (rateId: string): Promise<void> => {
  try {
    await api.delete(`/config/machine-rates/${rateId}`);
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

/** Count of catalog rows this workspace has customised, per table. */
export const getCatalogOverrides = async (): Promise<Record<string, number>> => {
  try {
    const response = await api.get<Record<string, number>>('/config/overrides');
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export interface MachineRate {
  id: string;
  /** null = shared system default; set = this workspace's own row. */
  user_id?: string | null;
  source_id?: string | null;
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

export const updateMachineRate = async (
  rateId: string,
  data: Partial<MachineRate>,
  scope: CatalogScope = 'mine',
): Promise<MachineRate> => {
  try {
    const response = await api.patch<MachineRate>(`/config/machine-rates/${rateId}${scopeQuery(scope)}`, data);
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

// ============================================================================
// Customers (CRM-lite) API
// ============================================================================

export const listCustomers = async (search?: string): Promise<Customer[]> => {
  try {
    const response = await api.get<Customer[]>('/customers', {
      params: search ? { search } : undefined,
    });
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export const createCustomer = async (payload: CustomerCreateRequest): Promise<Customer> => {
  try {
    const response = await api.post<Customer>('/customers', payload);
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export const getCustomer = async (customerId: string): Promise<Customer> => {
  try {
    const response = await api.get<Customer>(`/customers/${customerId}`);
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export const updateCustomer = async (
  customerId: string,
  payload: CustomerUpdateRequest,
): Promise<Customer> => {
  try {
    const response = await api.patch<Customer>(`/customers/${customerId}`, payload);
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

export const getCustomerQuotes = async (customerId: string): Promise<QuoteListItem[]> => {
  try {
    const response = await api.get<QuoteListItem[]>(`/customers/${customerId}/quotes`);
    return response.data;
  } catch (error) {
    return handleError(error as AxiosError);
  }
};

// Export api instance for advanced usage
export default api;
