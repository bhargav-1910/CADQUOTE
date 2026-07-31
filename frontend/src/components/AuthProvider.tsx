import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { LoginRequest, SignupRequest, UpdateProfileRequest, UserProfile } from '@/types';
import {
  getAuthToken,
  setAuthToken,
  clearAuthTokens,
  loginUser,
  signupUser,
  getCurrentUser,
  updateCurrentUser,
  refreshAccessToken,
  logoutUser,
} from '@/services/api';

const USER_PROFILE_KEY = 'forgequote.auth.user-profile';


const readCachedProfile = (): UserProfile | null => {
  try {
    const raw = localStorage.getItem(USER_PROFILE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as UserProfile;
  } catch {
    return null;
  }
};


const writeCachedProfile = (profile: UserProfile | null): void => {
  if (!profile) {
    localStorage.removeItem(USER_PROFILE_KEY);
    return;
  }

  localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(profile));
};

interface AuthContextValue {
  user: UserProfile | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (payload: LoginRequest) => Promise<void>;
  signup: (payload: SignupRequest) => Promise<void>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
  updateProfile: (payload: UpdateProfileRequest) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const decodeJwtPayload = (token: string): { exp?: number } | null => {
  const payloadPart = token.split('.')[1];
  if (!payloadPart) {
    return null;
  }

  try {
    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(atob(padded)) as { exp?: number };
  } catch {
    return null;
  }
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<UserProfile | null>(() => readCachedProfile());
  const [loading, setLoading] = useState(true);

  const refreshProfile = async () => {
    const profile = await getCurrentUser();
    setUser(profile);
    writeCachedProfile(profile);
  };

  useEffect(() => {
    const boot = async () => {
      const token = getAuthToken();
      // Nothing suggests a prior session — stay anonymous rather than firing a
      // refresh request on every visitor's first page load.
      if (!token && !readCachedProfile()) {
        setLoading(false);
        return;
      }

      try {
        // A missing access token does not mean signed out: the HttpOnly
        // refresh cookie survives a tab close, so try to restore the session.
        const payload = token ? decodeJwtPayload(token) : null;
        const nowSeconds = Math.floor(Date.now() / 1000);
        if (!payload?.exp || payload.exp <= nowSeconds) {
          const refreshed = await refreshAccessToken();
          setUser(refreshed.user);
          writeCachedProfile(refreshed.user);
          setLoading(false);
          return;
        }

        await refreshProfile();
      } catch {
        clearAuthTokens();
        setUser(null);
        writeCachedProfile(null);
      } finally {
        setLoading(false);
      }
    };

    boot();
  }, []);

  // Only the short-lived access token is kept in local storage. The refresh
  // token stays in the HttpOnly cookie the server set, out of reach of any
  // script that might be injected into the page.
  const login = async (payload: LoginRequest) => {
    const result = await loginUser(payload);
    setAuthToken(result.access_token);
    setUser(result.user);
    writeCachedProfile(result.user);
  };

  // Register returns tokens — log the new user straight in.
  const signup = async (payload: SignupRequest) => {
    const result = await signupUser(payload);
    setAuthToken(result.access_token);
    setUser(result.user);
    writeCachedProfile(result.user);
  };

  const logout = () => {
    logoutUser().catch(() => {
      clearAuthTokens();
    });
    setUser(null);
    writeCachedProfile(null);
  };

  const updateProfile = async (payload: UpdateProfileRequest) => {
    const profile = await updateCurrentUser(payload);
    setUser(profile);
    writeCachedProfile(profile);
  };

  useEffect(() => {
    const refreshIfExpiring = async () => {
      if (!user) {
        return;
      }

      const token = getAuthToken();
      if (!token) {
        return;
      }

      try {
        const payload = decodeJwtPayload(token);
        if (!payload?.exp) {
          return;
        }

        const nowSeconds = Math.floor(Date.now() / 1000);
        if (payload.exp - nowSeconds < 120) {
          const refreshed = await refreshAccessToken();
          setUser(refreshed.user);
          writeCachedProfile(refreshed.user);
        }
      } catch {
        // Ignore parsing errors and let normal 401 handler drive logout.
      }
    };

    const interval = window.setInterval(() => {
      refreshIfExpiring().catch(() => {
        clearAuthTokens();
        setUser(null);
        writeCachedProfile(null);
      });
    }, 60_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [user]);

  useEffect(() => {
    const onForcedLogout = () => {
      clearAuthTokens();
      setUser(null);
      writeCachedProfile(null);
    };

    window.addEventListener('auth:logout', onForcedLogout);
    return () => {
      window.removeEventListener('auth:logout', onForcedLogout);
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      login,
      signup,
      logout,
      refreshProfile,
      updateProfile,
    }),
    [user, loading, updateProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
