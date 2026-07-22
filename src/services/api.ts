import axios from "axios";
import { handleResponseError } from "./tokenRefresh";

const api = axios.create({
  baseURL: import.meta.env.REACT_APP_API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
    "x-app-id": import.meta.env.REACT_APP_API_APP_ID,
  },
  // Disable SSL verification for development (not recommended for production)
  httpsAgent: import.meta.env.DEV
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

// Response interceptor - reactive token refresh on 401 (logic in tokenRefresh.ts).
// On a non-login 401 the original request is retried transparently after refresh;
// 403 and failed refreshes tear the session down and redirect to /login.
api.interceptors.response.use(
  (response) => response,
  (error) => handleResponseError(error, (config) => api(config)),
);

export default api;
