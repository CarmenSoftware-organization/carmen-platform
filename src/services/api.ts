import axios from "axios";

const api = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
    "x-app-id": process.env.REACT_APP_API_APP_ID,
  },
  // Disable SSL verification for development (not recommended for production)
  httpsAgent:
    process.env.NODE_ENV === "development"
      ? {
          rejectUnauthorized: false,
        }
      : undefined,
});

// Request interceptor - redirect to login if no token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    } else if (!config.url?.includes("/auth/login")) {
      // No access_token and not a login request - redirect to login
      window.location.href = "/login";
      return Promise.reject(new Error("No access token"));
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLoginRequest = error.config?.url?.includes("/auth/login");
    if (!isLoginRequest && (error.response?.status === 401 || error.response?.status === 403)) {
      // Token expired, invalid, or forbidden - redirect to login
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

export default api;
