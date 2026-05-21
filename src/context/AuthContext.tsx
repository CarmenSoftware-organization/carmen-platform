import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import api from '../services/api';
import userService from '../services/userService';
import type { User, LoginCredentials, LoginResult, LoginResponse, AuthContextValue } from '../types';

const AuthContext = createContext<AuthContextValue | null>(null);

const isDev = process.env.NODE_ENV === 'development';

const ALLOWED_ROLES = [
  'platform_admin',
  'super_admin',
  'support_manager',
  'support_staff',
  'security_officer',
];

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginResponse, setLoginResponse] = useState<LoginResponse | null>(null);
  const [userCount, setUserCount] = useState<number | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');

    if (!token) {
      // No access_token found - clear everything and redirect to login
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      delete api.defaults.headers.common['Authorization'];
      setUser(null);
      setLoading(false);

      const publicPaths = ['/', '/login'];
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
      // Fetch fresh profile to get firstname/middlename/lastname
      fetchProfile();
      fetchUserCount();
    }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const fetchUserCount = async () => {
    try {
      const response = await userService.getAll({ page: 1, perpage: 1 });
      const total = response.paginate?.total ?? response.total ?? response.data?.length ?? 0;
      setUserCount(total);
    } catch {
      // User count fetch failed silently — default to null (enforce role checks)
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

      // Check platform_role access
      const role = loginData.platform_role;
      if (role && !ALLOWED_ROLES.includes(role)) {
        return {
          success: false,
          error: isDev
            ? `Access Denied. Your role "${role}" is not authorized. Allowed: ${ALLOWED_ROLES.join(', ')}`
            : 'Access Denied. You are not authorized to access this platform.'
        };
      }

      // Build initial user object from login data
      const userData: User = {
        id: '',
        email: credentials.username,
        name: credentials.username,
        platform_role: role,
      };

      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(userData));
      localStorage.setItem('loginResponse', JSON.stringify(loginData));
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      setUser(userData);
      setLoginResponse(loginData);

      // Fetch full profile to get firstname/middlename/lastname
      fetchProfile();
      fetchUserCount();

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
    localStorage.removeItem('user');
    localStorage.removeItem('loginResponse');
    delete api.defaults.headers.common['Authorization'];
    setUser(null);
    setLoginResponse(null);
  };

  const platformRole = loginResponse?.platform_role || user?.platform_role || null;

  const hasRole = (roles: string[]): boolean => {
    // Allow all access when there are 0 or 1 users (initial setup)
    if (userCount !== null && userCount <= 1) return true;
    if (!platformRole) return false;
    return roles.includes(platformRole);
  };

  const value: AuthContextValue = {
    user,
    login,
    logout,
    refreshUser,
    isAuthenticated: !!user,
    loading,
    loginResponse,
    platformRole,
    hasRole,
    userCount
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
