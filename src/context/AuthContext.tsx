import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import api from '../services/api';
import userService from '../services/userService';
import permissionService from '../services/permissionService';
import type { User, LoginCredentials, LoginResult, LoginResponse, AuthContextValue, EffectivePermissions } from '../types';
import { checkPermission, DEV_MOCK_EFFECTIVE_PERMISSIONS } from '../utils/permissions';
import { clearListViewState } from '../utils/clearListViewState';

const AuthContext = createContext<AuthContextValue | null>(null);

const isDev = import.meta.env.DEV;

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginResponse, setLoginResponse] = useState<LoginResponse | null>(null);
  const [userCount, setUserCount] = useState<number | null>(null);
  const [effectivePermissions, setEffectivePermissions] = useState<EffectivePermissions | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');

    if (!token) {
      // No access_token found - clear everything and redirect to login
      localStorage.removeItem('token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user');
      delete api.defaults.headers.common['Authorization'];
      setUser(null);
      setLoading(false);

      const publicPaths = ['/', '/login', '/changelog'];
      if (!publicPaths.includes(window.location.pathname)) {
        window.location.href = '/login';
      }
      return;
    }

    if (userData) {
      setUser(JSON.parse(userData));
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      const storedLoginResponse = localStorage.getItem('loginResponse');
      if (storedLoginResponse) {
        setLoginResponse(JSON.parse(storedLoginResponse));
      }
      const storedEffectivePermissions = localStorage.getItem('effectivePermissions');
      if (storedEffectivePermissions) {
        setEffectivePermissions(JSON.parse(storedEffectivePermissions));
      }
      // Fetch fresh profile to get firstname/middlename/lastname
      fetchProfile();
      fetchEffectivePermissions();
      fetchUserCount();
    }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyEffectivePermissions = (eff?: EffectivePermissions | null): EffectivePermissions | null => {
    let value: EffectivePermissions | null = eff ?? null;
    // Dev-only fallback: grant the mock when the backend returns no permissions —
    // but NOT for a real super-admin (preserve their is_super_admin flag).
    if ((!value || (!value.is_super_admin && value.platform.length === 0 && Object.keys(value.clusters).length === 0)) && isDev) {
      value = DEV_MOCK_EFFECTIVE_PERMISSIONS;
    }
    setEffectivePermissions(value);
    if (value) localStorage.setItem('effectivePermissions', JSON.stringify(value));
    else localStorage.removeItem('effectivePermissions');
    return value;
  };

  const fetchEffectivePermissions = async (): Promise<EffectivePermissions | null> => {
    try {
      const eff = await permissionService.getMyPlatformPermissions();
      return applyEffectivePermissions(eff);
    } catch {
      return applyEffectivePermissions(null); // dev-mock fallback applies in dev; null in prod
    }
  };

  const fetchProfile = async () => {
    try {
      const response = await api.get('/api/user/profile');
      const data = response.data.data || response.data;
      const info = data.user_info || data;
      const merged = {
        ...data,
        firstname: info.firstname,
        middlename: info.middlename,
        lastname: info.lastname,
        telephone: info.telephone,
      };
      localStorage.setItem('user', JSON.stringify(merged));
      setUser(merged);
    } catch {
      // Profile fetch failed silently — user data from login is still available
    }
  };

  const fetchUserCount = async (): Promise<number | null> => {
    try {
      const response = await userService.getAll({ page: 1, perpage: 1 });
      const total = response.paginate?.total ?? response.total ?? response.data?.length ?? 0;
      setUserCount(total);
      return total;
    } catch {
      // User count fetch failed silently — default to null (enforce role checks)
      return null;
    }
  };

  const login = async (credentials: LoginCredentials): Promise<LoginResult> => {
    try {
      const response = await api.post('/api/auth/login', credentials);

      // Backend wraps login data inside response.data.data
      const loginData: LoginResponse = response.data.data || response.data;
      const token = loginData.access_token;

      if (!token) {
        throw new Error('No token received from server');
      }

      // Authenticate the session first so the permission/count requests are authorized.
      localStorage.setItem('token', token);
      if (loginData.refresh_token) {
        localStorage.setItem('refresh_token', loginData.refresh_token);
      }
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;

      // Permission-based access gate: resolve platform permissions + user count.
      const [eff, count] = await Promise.all([fetchEffectivePermissions(), fetchUserCount()]);
      const hasAnyPermission = !!eff && (eff.is_super_admin || eff.platform.length > 0 || Object.keys(eff.clusters).length > 0);
      const isBootstrap = count !== null && count <= 1; // first-admin escape hatch
      if (!hasAnyPermission && !isBootstrap) {
        // Not authorized for the platform admin — tear down the partial session.
        localStorage.removeItem('token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('effectivePermissions');
        delete api.defaults.headers.common['Authorization'];
        setEffectivePermissions(null);
        return {
          success: false,
          error: 'Access Denied. You are not authorized to access this platform.',
        };
      }

      // Authorized — persist the session.
      const userData: User = {
        id: '',
        email: credentials.username,
        name: credentials.username,
      };
      localStorage.setItem('user', JSON.stringify(userData));
      localStorage.setItem('loginResponse', JSON.stringify(loginData));
      setUser(userData);
      setLoginResponse(loginData);

      // Fresh login starts clean — drop saved per-page filters/search/sort/pagination.
      clearListViewState();

      // Load full profile (firstname/lastname/etc.) in the background.
      fetchProfile();

      return { success: true };
    } catch (error: unknown) {
      const err = error as { response?: { status?: number; data?: { message?: string } }; message?: string };

      // Development: show full error details for debugging
      if (isDev) {
        console.error('Login error:', error);
        let devMessage = `[${err.response?.status || 'Network Error'}] `;
        if (err.response?.data?.message) {
          devMessage += err.response.data.message;
        } else if (err.message) {
          devMessage += err.message;
        } else {
          devMessage += 'Unknown error';
        }
        return { success: false, error: devMessage };
      }

      // Production: generic messages only
      let errorMessage = 'Unable to login. Please try again later.';
      if (err.response?.status === 401) {
        errorMessage = 'Invalid email/username or password.';
      } else if (err.response?.status === 429) {
        errorMessage = 'Too many login attempts. Please try again later.';
      }
      return { success: false, error: errorMessage };
    }
  };

  const refreshUser = useCallback(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
    }
  }, []);

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    localStorage.removeItem('loginResponse');
    localStorage.removeItem('effectivePermissions');
    delete api.defaults.headers.common['Authorization'];
    setUser(null);
    setLoginResponse(null);
    setEffectivePermissions(null);
  };

  const isSuperAdmin = !!effectivePermissions?.is_super_admin;

  const hasPermission = (key: string, opts?: { clusterId?: string }): boolean => {
    // Bootstrap escape hatch: 0–1 users => allow everything.
    if (userCount !== null && userCount <= 1) return true;
    return checkPermission(effectivePermissions, key, opts);
  };

  const value: AuthContextValue = {
    user,
    login,
    logout,
    refreshUser,
    isAuthenticated: !!user,
    loading,
    loginResponse,
    userCount,
    effectivePermissions,
    hasPermission,
    isSuperAdmin,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
