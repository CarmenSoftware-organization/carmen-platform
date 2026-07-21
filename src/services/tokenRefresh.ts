import axios from 'axios';

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
