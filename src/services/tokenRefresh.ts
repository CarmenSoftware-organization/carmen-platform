import axios from 'axios';
import type { AxiosError, AxiosRequestConfig } from 'axios';

const TOKEN_KEY = 'token';
const REFRESH_KEY = 'refresh_token';

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

let refreshPromise: Promise<string> | null = null;

export function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function doRefresh(): Promise<string> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    throw new Error('No refresh token available');
  }

  const baseURL = import.meta.env.REACT_APP_API_BASE_URL;
  const resp = await axios.post(
    `${baseURL}/api/auth/refresh-token`,
    { refresh_token: refreshToken },
    {
      headers: {
        'Content-Type': 'application/json',
        'x-app-id': import.meta.env.REACT_APP_API_APP_ID,
      },
    },
  );

  const data = resp.data?.data ?? resp.data;
  const newAccess: string | undefined = data?.access_token;
  if (!newAccess) {
    throw new Error('Refresh response missing access_token');
  }

  localStorage.setItem(TOKEN_KEY, newAccess);
  const newRefresh: string | undefined = data?.refresh_token;
  if (newRefresh) {
    localStorage.setItem(REFRESH_KEY, newRefresh);
  }
  return newAccess;
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem('user');
  localStorage.removeItem('loginResponse');
  localStorage.removeItem('effectivePermissions');
}

export function redirectToLogin(): void {
  window.location.href = '/login';
}

type RetryConfig = AxiosRequestConfig & { _retry?: boolean };

export async function handleResponseError(
  error: AxiosError,
  retry: (config: AxiosRequestConfig) => Promise<unknown>,
): Promise<unknown> {
  const original = (error.config ?? {}) as RetryConfig;
  const status = error.response?.status;
  const url = original.url ?? '';
  const isLoginRequest = url.includes('/auth/login');

  if (status === 401 && !isLoginRequest && !original._retry) {
    original._retry = true;
    try {
      const newToken = await refreshAccessToken();
      original.headers = original.headers ?? {};
      (original.headers as Record<string, unknown>).Authorization = `Bearer ${newToken}`;
      return await retry(original);
    } catch {
      clearSession();
      redirectToLogin();
      return Promise.reject(error);
    }
  }

  if ((status === 401 || status === 403) && !isLoginRequest) {
    // 403, or a 401 whose retry already failed. A fresh non-login 401 always
    // returns from the block above and never falls through here.
    clearSession();
    redirectToLogin();
  }

  return Promise.reject(error);
}
