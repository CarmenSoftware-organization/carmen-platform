import React, { createContext, useState, useContext, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

const ALLOWED_ROLES = [
  'platform_admin',
  'super_admin',
  'support_manager',
  'support_staff',
  'security_officer',
];

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loginResponse, setLoginResponse] = useState(null);

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
    }
    setLoading(false);
  }, []);

  const login = async (credentials) => {
    try {
      // Update this endpoint based on your actual API
      const response = await api.post('/api/auth/login', credentials);

      // Handle both token and access_token response formats
      const token = response.data.access_token || response.data.token;
      const userData = response.data.user || response.data.data || {
        email: credentials.email,
        name: response.data.name || credentials.email
      };

      if (!token) {
        throw new Error('No token received from server');
      }

      // Check platform_role access
      const platformRole = response.data.platform_role || userData.platform_role;
      if (platformRole && !ALLOWED_ROLES.includes(platformRole)) {
        return {
          success: false,
          error: `Access Denied. Your role "${platformRole}" is not authorized to access this platform.`
        };
      }

      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(userData));
      localStorage.setItem('loginResponse', JSON.stringify(response.data));
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      setUser(userData);
      setLoginResponse(response.data);

      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      let errorMessage = 'Login failed. Please check your credentials.';
      if (error.response?.status === 401) {
        errorMessage = 'Unauthorized. Invalid email or password.';
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
      return {
        success: false,
        error: errorMessage
      };
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('loginResponse');
    delete api.defaults.headers.common['Authorization'];
    setUser(null);
    setLoginResponse(null);
  };

  const platformRole = loginResponse?.platform_role || user?.platform_role || null;

  const hasRole = (roles) => {
    if (!platformRole) return false;
    return roles.includes(platformRole);
  };

  const value = {
    user,
    login,
    logout,
    isAuthenticated: !!user,
    loading,
    loginResponse,
    platformRole,
    hasRole
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
