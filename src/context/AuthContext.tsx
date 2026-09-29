import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';
import userService from '../services/userService';
import permissionService from '../services/permissionService';
import clusterAdminService from '../services/clusterAdminService';
import type { User, LoginCredentials, LoginResult, LoginResponse, AuthContextValue, EffectivePermissions, AdminScope } from '../types';
import { checkPermission, checkPlatformAuthority } from '../utils/permissions';
import { clearListViewState } from '../utils/clearListViewState';
import { useI18n } from '../hooks/useI18n';

const AuthContext = createContext<AuthContextValue | null>(null);

const isDev = import.meta.env.DEV;

/**
 * A real user-initiated reload (F5 / Ctrl+R / the browser's reload button) always gets one
 * fresh silent-SSO-check attempt, ignoring the tab-session guard below — someone hitting
 * reload on /login is deliberately asking "check again," most commonly right after
 * establishing a session in the *other* app in a different tab. Without this, the guard
 * (correctly) never re-fires on its own for the rest of the tab's life once tried, so a
 * reload here would look identical to any other in-app navigation and stay stuck skipping
 * the check forever.
 * การ reload จริงของ user (F5 / Ctrl+R / ปุ่ม reload ของ browser) จะได้ลองเช็ค silent SSO ใหม่เสมอ
 * หนึ่งครั้ง ไม่สนใจ guard ของ tab session ด้านล่าง — คนที่กด reload ที่ /login ตั้งใจจะ "เช็คใหม่อีกที"
 * ส่วนใหญ่คือเพิ่ง login สำเร็จที่อีกแอปในอีกแท็บมา ถ้าไม่มีเงื่อนไขนี้ guard จะไม่ยิงซ้ำเองอีกเลยตลอด
 * tab session นั้น (ถูกแล้วสำหรับ in-app navigation ปกติ) ทำให้ reload หน้านี้ดูเหมือน navigation
 * อื่นๆ แล้วค้างข้ามการเช็คไปตลอดกาล
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
 * Decode a JWT's payload without verifying its signature — safe here because the token was
 * already validated server-side by Keycloak/micro-business before it reached this browser via
 * the Google sign-in redirect; this only reads the `email` claim to label the local session.
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
  // Guards only the silent-check redirect below (not the whole mount effect) against
  // React.StrictMode's dev-only double-invoke (src/index.tsx): without it, the 2nd invocation
  // re-reads the sessionStorage guard the 1st invocation just set to '1', takes the `else`
  // branch, and sets `window.location.href` to '/login' — overwriting the 1st invocation's
  // in-flight silent-check navigation in the same tick, so the browser only ever ends up at
  // '/login'. A ref (not sessionStorage) is the guard here because it must reset to `false`
  // per real mount, whereas sessionStorage deliberately persists across mounts within a tab.
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

      // `/`, /changelog and /access-denied are deliberately still skipped: `/` is the public
      // marketing landing page (not an admin page — auto-redirecting a mere visitor into the
      // dashboard is a separate product decision, not made here), changelog is genuinely
      // public content, and access-denied must never retry (its whole point is showing a
      // denied user their own email + a Logout button, not silently bouncing them around).
      // /login is NOT skipped — landing there directly (e.g. a bookmark) with a live Keycloak
      // session already open (from the other app) should sign in just as silently as any
      // protected route would, not require an extra manual click on [Sign in].
      const publicPaths = ['/', '/changelog', '/access-denied'];
      if (!publicPaths.includes(window.location.pathname)) {
        if (silentCheckStartedRef.current) return; // see the ref's own comment above
        silentCheckStartedRef.current = true;
        // ลอง silent SSO check ก่อนหนึ่งครั้งต่อ tab session (เหมือน carmen-inventory-frontend-react's
        // RequireAuth) — ถ้า Keycloak มี session ที่ยัง live อยู่แล้ว (เช่น login ผ่าน App มา) จะได้
        // token กลับมาโดยไม่ต้องกดอะไรเลย แล้วกลับมาที่ path เดิม; ถ้าไม่มี session Keycloak ตอบเงียบๆ
        // (`login_required`) แล้ว gateway ส่งกลับมาที่ /login ตามปกติ ไม่มี error banner — ไม่ใช่ loop
        // guard แบบเข้มงวด (ผลลัพธ์ที่ไม่เจอ session ลงเอยที่ /login ตรงๆ เสมอ อยู่นอก path นี้แล้ว)
        // แค่กันไม่ให้ path อื่นที่ยัง logout อยู่ต้องรอ round-trip ซ้ำอีกใน tab session เดียวกัน
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
          // On /login itself, wrapping the whole current URL as `next` (like every other path
          // does) would round-trip back through /login for no reason — Login.tsx already reads
          // its own `next` param and forwards there once `isAuthenticated` flips true. Reusing
          // that same param directly here skips the pointless extra hop and, on success, lands
          // GoogleCallback straight on the real deep link (or /dashboard, its own fallback).
          // ที่ /login เอง การ wrap ทั้ง URL ปัจจุบันเป็น `next` แบบ path อื่นๆ จะกลับไปที่ /login
          // เฉยๆโดยไม่ได้ประโยชน์อะไร — Login.tsx อ่าน `next` ของตัวเองแล้ว forward ต่ออยู่แล้วเมื่อ
          // `isAuthenticated` เป็น true ใช้ param เดียวกันนี้ตรงๆ เลยตัด hop ที่ไม่จำเป็นออก พอสำเร็จ
          // GoogleCallback จะไปที่ deep link จริง (หรือ /dashboard ค่า fallback ของมันเอง) ได้ตรงๆ
          const next =
            window.location.pathname === '/login'
              ? new URLSearchParams(window.location.search).get('next') ?? ''
              : `${window.location.pathname}${window.location.search}`;
          window.location.href = `${import.meta.env.REACT_APP_API_BASE_URL}/api/auth/authorize?app=platform&silent=true&next=${encodeURIComponent(next)}`;
        } else if (window.location.pathname !== '/login') {
          // Already at /login (e.g. this very effect's own failed silent check just landed
          // back here) — nothing to navigate to, let Login.tsx render normally instead of
          // reassigning `location.href` to the exact URL already loaded.
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
   * Same session bootstrap as login() (authority gate, profile fetch, list-view reset), but the
   * tokens already exist — they came from the gateway's Google sign-in redirect
   * (GET /api/auth/google/callback), not from posting credentials here. Kept as its own function
   * rather than folded into login() because there is no `credentials.username` to build the
   * placeholder user label from; it reads `email` off the access token's own claims instead.
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
        // Deliberately local-only: this account may still have valid, active access on
        // carmen-inventory-frontend-react (shared Keycloak session/SSO) — Platform denying its
        // own authority must not revoke that shared session out from under App. Revoking here
        // was tried and reverted: under the single-sign-on model, ending a session belongs to
        // an explicit Logout action (global, ends it everywhere on purpose), never to an
        // implicit side effect of one app's own authorization check.
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

      // เคลียร์ guard ของ silent SSO check (mount effect ด้านบน) — login สำเร็จแล้ว รอบหน้าที่
      // token หายไปอีก (เช่น หลัง logout) ควรลอง silent check ใหม่ได้อีกครั้ง ไม่ใช่ข้ามไปตลอด
      // tab session
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

    // Awaited (not fire-and-forget) — this is the actual difference from carmen-inventory-
    // frontend-react's logout() that this function was supposed to already match, and turned
    // out not to: `/api/auth/logout` → micro-business → micro-keycloak's
    // `logoutWithRefreshToken()` POSTs the refresh_token straight to Keycloak's own
    // `/protocol/openid-connect/logout`, which genuinely ends the underlying Keycloak session
    // (contrary to an earlier, narrower finding from before this SSO migration existed).
    // Firing this without awaiting it (the previous code here) started the front-channel
    // redirect below in the same tick — the multi-hop RPC chain (gateway → micro-business →
    // micro-keycloak → Keycloak) hadn't finished yet, so Keycloak's end-session endpoint below
    // still found a live session and had to ask the user to confirm (no `id_token_hint` on that
    // call — see the earlier investigation). Awaiting first means the session is already gone
    // by the time end-session runs, so Keycloak just redirects straight through (302) with no
    // confirmation page — exactly what App's already-sequential `useLogout()`/`logout()` gets.
    // ยิงแบบ await (ไม่ใช่ fire-and-forget) — นี่คือความต่างจริงจาก logout() ของ
    // carmen-inventory-frontend-react ที่ฟังก์ชันนี้ควรจะเหมือนอยู่แล้วแต่ไม่เหมือน:
    // `/api/auth/logout` → micro-business → micro-keycloak's `logoutWithRefreshToken()` ยิง
    // refresh_token ตรงไป Keycloak's `/protocol/openid-connect/logout` เอง ซึ่ง**ปิด session ของ
    // Keycloak จริง** (ต่างจาก finding เดิมที่แคบกว่า จากก่อนมี SSO migration นี้) การยิงแบบไม่
    // await (โค้ดเดิมตรงนี้) ทำให้ front-channel redirect ด้านล่างเริ่มในติ๊กเดียวกัน — RPC chain
    // หลายชั้น (gateway → micro-business → micro-keycloak → Keycloak) ยังไม่เสร็จ ทำให้
    // end-session ของ Keycloak ด้านล่างยังเจอ session ที่ live อยู่ ต้องถาม confirm ก่อน (ไม่มี
    // `id_token_hint` ในคอลนั้น — ดูการสอบสวนก่อนหน้า) การ await ก่อน ทำให้ session หายไปแล้วตอน
    // end-session รัน Keycloak เลย redirect ผ่านตรง (302) ไม่ถาม confirm เหมือนกับที่ App's
    // `useLogout()`/`logout()` ที่ sequential อยู่แล้วได้ผลลัพธ์
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
        // Best-effort — proceed to front-channel logout regardless. Worst case: the browser's
        // own KEYCLOAK_SESSION cookie is still live and the user sees Keycloak's confirmation
        // page once, same as before this fix.
      }
    }

    // Pre-mark the silent-check guard: we are, right now, deterministically ending the only
    // session there is — the mount effect's silent check landing back on /login after this
    // redirect chain (Platform → Keycloak → /login) would otherwise fire once more and find
    // no session (since we just ended it ourselves), costing a guaranteed-to-fail round trip
    // and a visible flash for no benefit. Set *before* navigating so it's already there by the
    // time /login's own mount effect runs on the page this redirect lands on.
    // ตั้ง guard ของ silent-check ไว้ก่อนล่วงหน้า — ตอนนี้เรากำลังปิด session เดียวที่มีอยู่แบบชัวร์
    // อยู่แล้ว mount effect's silent check ที่ลงเอยที่ /login หลัง redirect chain นี้ (Platform →
    // Keycloak → /login) จะยิงอีกรอบโดยไม่จำเป็น เจอว่าไม่มี session แน่ๆ (เพราะเราปิดมันเองไปแล้ว)
    // เสีย round trip ที่พลาดแน่ๆกับจอกระพริบไปเปล่าๆ ตั้งก่อน navigate เพื่อให้มีอยู่แล้วตอน mount
    // effect ของหน้า /login ที่ redirect นี้ไปจบ ทำงาน
    try {
      sessionStorage.setItem('carmen.silentSsoTried', '1');
    } catch {
      // ignore — worst case is just the one extra round trip this was meant to skip
    }

    // Front-channel: also end this browser's Keycloak SSO session (KEYCLOAK_SESSION cookie),
    // not just the local one — under the SSO model, skipping this alone would leave that cookie
    // live, so the very next protected-route visit's silent-SSO check (this file's mount
    // effect, or App's require-auth.tsx) would find a session and silently sign the user right
    // back in, undoing this logout entirely. Real navigation, so nothing after this line runs.
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
