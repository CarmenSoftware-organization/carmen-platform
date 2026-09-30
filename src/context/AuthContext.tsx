import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';
import userService from '../services/userService';
import permissionService from '../services/permissionService';
import clusterAdminService from '../services/clusterAdminService';
import type { User, LoginCredentials, LoginResult, LoginResponse, AuthContextValue, EffectivePermissions, AdminScope } from '../types';
import { checkPermission, checkPlatformAuthority } from '../utils/permissions';
import { clearListViewState } from '../utils/clearListViewState';
import { clearDeniedTokens, stashDeniedTokens } from '../utils/deniedSession';
import { useI18n } from '../hooks/useI18n';

const AuthContext = createContext<AuthContextValue | null>(null);

const isDev = import.meta.env.DEV;

/**
 * A user-initiated reload gets one fresh silent-SSO check, ignoring the once-per-tab guard
 * (typically pressed right after signing in through the other app in another tab).
 * การ reload ของ user ได้ลองเช็ค silent SSO ใหม่หนึ่งครั้ง ไม่สน guard แบบครั้งเดียวต่อแท็บ
 * (มักกดหลัง login ผ่านอีกแอปในอีกแท็บ)
 */
function isUserReload(): boolean {
  try {
    const [entry] = performance.getEntriesByType('navigation');
    return (entry as PerformanceNavigationTiming | undefined)?.type === 'reload';
  } catch {
    return false;
  }
}

/**
 * Reads the `email` claim from a JWT without verifying it: the server already validated the token
 * before the sign-in redirect, so this only labels the local session.
 */
function decodeJwtEmail(token: string): string {
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const claims = JSON.parse(json) as { email?: string; preferred_username?: string };
    return claims.email || claims.preferred_username || '';
  } catch {
    return '';
  }
}

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  // I18nProvider ครอบ AuthProvider ใน App.tsx จึงเรียก useI18n ตรงนี้ได้
  const { t, lang } = useI18n();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginResponse, setLoginResponse] = useState<LoginResponse | null>(null);
  const [userCount, setUserCount] = useState<number | null>(null);
  const [effectivePermissions, setEffectivePermissions] = useState<EffectivePermissions | null>(null);
  const [adminScope, setAdminScope] = useState<AdminScope | null>(null);
  // Guards the silent-check redirect against StrictMode's dev double-invoke, whose 2nd run would overwrite
  // the in-flight navigation with '/login'. A ref, not sessionStorage: it must reset on every real mount.
  const silentCheckStartedRef = useRef(false);

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

      // Skipped: `/` (public landing page), /changelog (public content) and /access-denied (must never retry;
      // it shows the denied user their email + Logout). /login is NOT skipped: opening it with a live Keycloak
      // session (from the other app) should sign in silently, without an extra click.
      const publicPaths = ['/', '/changelog', '/access-denied'];
      if (!publicPaths.includes(window.location.pathname)) {
        if (silentCheckStartedRef.current) return; // see the ref's own comment above
        silentCheckStartedRef.current = true;
        // One silent SSO check per tab session (like App's RequireAuth): a live Keycloak session returns tokens
        // with no click; otherwise Keycloak answers `login_required` and the gateway sends us to /login.
        // ลอง silent SSO check หนึ่งครั้งต่อ tab session (เหมือน RequireAuth ของ App): มี session ที่ live อยู่ก็ได้ token
        // โดยไม่ต้องกด ไม่มีก็ Keycloak ตอบ `login_required` แล้ว gateway ส่งกลับ /login
        let alreadyTried = false;
        try {
          alreadyTried = sessionStorage.getItem('carmen.silentSsoTried') === '1' && !isUserReload();
        } catch {
          // storage unavailable — fall through and just attempt the check
        }
        if (!alreadyTried) {
          try {
            sessionStorage.setItem('carmen.silentSsoTried', '1');
          } catch {
            // ignore
          }
          // On /login, reuse its own `next` param rather than wrapping the whole URL as `next`,
          // which would round-trip back through /login for nothing.
          // ที่ /login ใช้ `next` ของหน้านั้นเอง แทนการ wrap ทั้ง URL เป็น `next` ที่จะวนกลับ /login เปล่าๆ
          const next =
            window.location.pathname === '/login'
              ? new URLSearchParams(window.location.search).get('next') ?? ''
              : `${window.location.pathname}${window.location.search}`;
          window.location.href = `${import.meta.env.REACT_APP_API_BASE_URL}/api/auth/authorize?app=platform&silent=true&next=${encodeURIComponent(next)}`;
        } else if (window.location.pathname !== '/login') {
          // Already on /login (a failed silent check just landed here): let Login.tsx render.
          // อยู่ที่ /login แล้ว (silent check ที่ล้มเหลวเพิ่งกลับมาที่นี่): ให้ Login.tsx render
          window.location.href = '/login';
        }
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
      const storedAdminScope = localStorage.getItem('adminScope');
      if (storedAdminScope) {
        setAdminScope(JSON.parse(storedAdminScope));
      }
      // Fetch fresh profile to get firstname/middlename/lastname
      fetchProfile();
      fetchEffectivePermissions();
      fetchAdminScope();
      fetchUserCount();
    }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyEffectivePermissions = (eff?: EffectivePermissions | null): EffectivePermissions | null => {
    const value: EffectivePermissions | null = eff ?? null;
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
      return applyEffectivePermissions(null); // no permissions resolved
    }
  };

  /**
   * Resolve which clusters this user administers.
   *
   * No dev-mock fallback — a mock here would hand every dev session admin rights over every
   * cluster and hide exactly the scoping bugs this value exists to surface. A failed fetch means
   * "administers nothing".
   */
  const fetchAdminScope = async (): Promise<AdminScope | null> => {
    try {
      const scope = await clusterAdminService.getMyAdminClusters({ page: 1, perpage: 100 });
      setAdminScope(scope);
      localStorage.setItem('adminScope', JSON.stringify(scope));
      return scope;
    } catch {
      const empty: AdminScope = { all: false, clusters: [] };
      setAdminScope(empty);
      localStorage.removeItem('adminScope');
      return empty;
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
        throw new Error(t('login.noToken'));
      }

      // Authenticate the session first so the permission/count requests are authorized.
      localStorage.setItem('token', token);
      if (loginData.refresh_token) {
        localStorage.setItem('refresh_token', loginData.refresh_token);
      }
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;

      // Permission-based access gate: resolve platform permissions + user count + admin scope.
      const [eff, count, scope] = await Promise.all([
        fetchEffectivePermissions(),
        fetchUserCount(),
        fetchAdminScope(),
      ]);
      const hasAnyPermission = checkPlatformAuthority(eff);
      // A cluster-admin membership is authority in its own right — it is what gates every
      // invitation and membership route on the server. Without this clause a user whose only
      // authority is that membership cannot enter the app at all.
      const hasClusterAdmin = !!scope && (scope.all || scope.clusters.length > 0);
      const isBootstrap = count !== null && count <= 1; // first-admin escape hatch
      if (!hasAnyPermission && !hasClusterAdmin && !isBootstrap) {
        // Not authorized for the platform admin — tear down the partial session.
        localStorage.removeItem('token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('effectivePermissions');
        localStorage.removeItem('adminScope');
        delete api.defaults.headers.common['Authorization'];
        setEffectivePermissions(null);
        setAdminScope(null);
        return {
          success: false,
          error: t('login.accessDeniedPlatform'),
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
          devMessage += t('error.unknown');
        }
        return { success: false, error: devMessage };
      }

      // Production: generic messages only
      let errorMessage = t('login.unableToLogin');
      if (err.response?.status === 401) {
        errorMessage = t('login.invalidCredentials');
      } else if (err.response?.status === 429) {
        errorMessage = t('login.tooManyAttempts');
      }
      return { success: false, error: errorMessage };
    }
  };

  /**
   * Same session bootstrap as login() (authority gate, profile fetch, list-view reset) for tokens issued by
   * the gateway's sign-in redirect. Separate because there is no `credentials.username`; the user label is
   * built from the token's `email` claim.
   */
  const loginWithTokens = async (accessToken: string, refreshToken: string): Promise<LoginResult> => {
    try {
      localStorage.setItem('token', accessToken);
      if (refreshToken) {
        localStorage.setItem('refresh_token', refreshToken);
      }
      api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;

      const [eff, count, scope] = await Promise.all([
        fetchEffectivePermissions(),
        fetchUserCount(),
        fetchAdminScope(),
      ]);
      const hasAnyPermission = checkPlatformAuthority(eff);
      const hasClusterAdmin = !!scope && (scope.all || scope.clusters.length > 0);
      const isBootstrap = count !== null && count <= 1;
      if (!hasAnyPermission && !hasClusterAdmin && !isBootstrap) {
        // Local-only on purpose: this account may still be valid on App (shared SSO session), so an implicit
        // revoke here would sign it out there; only an explicit Logout ends the shared session. The tokens are
        // parked in sessionStorage so the access-denied page's sign-out button can revoke them first
        // (see utils/deniedSession.ts).
        stashDeniedTokens(accessToken, refreshToken);
        localStorage.removeItem('token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('effectivePermissions');
        localStorage.removeItem('adminScope');
        delete api.defaults.headers.common['Authorization'];
        setEffectivePermissions(null);
        setAdminScope(null);
        return {
          success: false,
          error: t('login.accessDeniedPlatform'),
          deniedEmail: decodeJwtEmail(accessToken),
        };
      }

      const email = decodeJwtEmail(accessToken);
      const userData: User = { id: '', email, name: email };
      const loginData: LoginResponse = { access_token: accessToken, refresh_token: refreshToken };
      localStorage.setItem('user', JSON.stringify(userData));
      localStorage.setItem('loginResponse', JSON.stringify(loginData));
      setUser(userData);
      setLoginResponse(loginData);

      clearListViewState();
      fetchProfile();
      clearDeniedTokens(); // a successful sign-in supersedes any earlier denied one

      // Clear the silent-check guard so a later token loss (e.g. after logout) can retry the check.
      try {
        sessionStorage.removeItem('carmen.silentSsoTried');
      } catch {
        // ignore — storage unavailable, nothing to clear
      }

      return { success: true };
    } catch {
      return { success: false, error: t('login.unableToLogin') };
    }
  };

  const refreshUser = useCallback(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
    }
  }, []);

  const logout = async () => {
    const accessToken = localStorage.getItem('token');
    const refreshToken = localStorage.getItem('refresh_token');

    // Local state clears synchronously, before the network call below — the UI must not wait
    // on it (matches the previous, pre-await behavior; see the test asserting this).
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    localStorage.removeItem('loginResponse');
    localStorage.removeItem('effectivePermissions');
    localStorage.removeItem('adminScope');
    delete api.defaults.headers.common['Authorization'];
    setUser(null);
    setLoginResponse(null);
    setEffectivePermissions(null);
    setAdminScope(null);

    // Await the backchannel revoke before the front-channel redirect: unawaited, it raced end-session, so Keycloak
    // still saw a live session and showed its own confirmation page; awaited, end-session redirects straight
    // through (302), as App's useLogout() does.
    // ต้อง await revoke ก่อน redirect: ถ้าไม่ await จะชนกับ end-session ทำให้ Keycloak เจอ session ที่ยัง live
    // แล้วโชว์หน้ายืนยันของมันเอง; await แล้ว end-session redirect ผ่านตรง (302) เหมือน useLogout() ของ App
    if (accessToken || refreshToken) {
      try {
        await fetch(`${import.meta.env.REACT_APP_API_BASE_URL}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({ refresh_token: refreshToken ?? '' }),
          signal: AbortSignal.timeout(5000),
        });
      } catch {
        // Best-effort: continue to the front-channel logout regardless (worst case Keycloak shows its confirm page once).
      }
    }

    // Pre-mark the silent-check guard: we just ended the only session, so the check on the /login this redirect
    // lands on would fire once more and fail (a wasted round trip and a visible flash).
    // ตั้ง guard ของ silent check ไว้ก่อน: เพิ่งปิด session เดียวที่มี การเช็คที่ /login ปลายทางจะยิงซ้ำเปล่าประโยชน์
    // (เสียเวลาและจอกระพริบ)
    try {
      sessionStorage.setItem('carmen.silentSsoTried', '1');
    } catch {
      // ignore — worst case is just the one extra round trip this was meant to skip
    }

    // Front-channel: also end the Keycloak SSO session, or the next silent check would find it and sign the
    // user straight back in. A real navigation, so nothing after it runs.
    window.location.href = `${import.meta.env.REACT_APP_API_BASE_URL}/api/auth/end-session?app=platform&locale=${lang}`;
  };

  const isSuperAdmin = !!effectivePermissions?.is_super_admin;

  // The bootstrap escape hatch belongs here rather than in checkPlatformAuthority: the very
  // first administrator of a fresh install has no permission rows yet, and hasPermission
  // (below) already treats that state as full access. The two must agree, or the first admin
  // is bounced out of the view they exist to set up.
  const hasPlatformAuthority =
    (userCount !== null && userCount <= 1) || checkPlatformAuthority(effectivePermissions);

  const hasClusterAdminScope =
    !!adminScope && (adminScope.all || adminScope.clusters.length > 0);

  const hasPermission = (key: string, opts?: { clusterId?: string }): boolean => {
    // Bootstrap escape hatch: 0–1 users => allow everything.
    if (userCount !== null && userCount <= 1) return true;
    return checkPermission(effectivePermissions, key, opts);
  };

  const isClusterAdminOf = (clusterId: string): boolean =>
    !!adminScope && (adminScope.all || adminScope.clusters.some((c) => c.id === clusterId));

  const value: AuthContextValue = {
    user,
    login,
    loginWithTokens,
    logout,
    refreshUser,
    isAuthenticated: !!user,
    loading,
    loginResponse,
    userCount,
    effectivePermissions,
    hasPermission,
    isSuperAdmin,
    adminScope,
    isClusterAdminOf,
    hasPlatformAuthority,
    hasClusterAdminScope,
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
