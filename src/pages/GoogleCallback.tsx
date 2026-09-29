import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { resolveNextPath } from '../utils/resolveNextPath';

/**
 * ปลายทางที่ gateway redirect กลับมาหลัง Google sign-in สำเร็จ (`GET /api/auth/google/callback`
 * บน backend) — token มากับ `window.location.hash` ไม่ใช่ query string เพราะ fragment ไม่ถูกส่งไป
 * server/CDN ใดๆ ต่างจาก query string ที่ติด access log ได้ อ่านครั้งเดียวแล้วผ่าน
 * `loginWithTokens()` ของ AuthContext ซึ่งทำ authority gate เดียวกับ login() ปกติ
 */
const GoogleCallback: React.FC = () => {
  const { loginWithTokens } = useAuth();
  const navigate = useNavigate();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // effect วิ่งสองครั้งใน StrictMode dev — กัน token ถูกอ่านซ้ำ
    ran.current = true;

    const hash = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash;
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    // ตั้งโดย authorize's state round-trip (ดู auth.controller.ts's googleCallback) — deep-link
    // เดิม (เช่น protected route ที่ silent-SSO-check redirect มา) ที่ควรกลับไปหลัง login สำเร็จ
    const next = params.get('next');

    if (!accessToken || !refreshToken) {
      const failParams = new URLSearchParams({ error: 'google_auth_failed' });
      if (next) failParams.set('next', next);
      navigate(`/login?${failParams.toString()}`, { replace: true });
      return;
    }

    loginWithTokens(accessToken, refreshToken).then((result) => {
      if (result.success) {
        navigate(resolveNextPath(next), { replace: true });
      } else if (result.deniedEmail !== undefined) {
        // deniedEmail is only ever set by loginWithTokens's access-denied branch — this is a
        // genuine "authenticated, but no Platform authority" case, not a technical failure.
        // Checked for presence, not truthiness: decodeJwtEmail can legitimately return '' (a
        // token with neither an email nor preferred_username claim), and that denial is just as
        // real — it must still land on /access-denied, not silently fall through to the generic
        // banner below.
        // deniedEmail ถูกตั้งเฉพาะ branch access-denied ของ loginWithTokens — เป็นเคส "login สำเร็จ
        // แต่ไม่มีสิทธิ์ Platform" จริงๆ ไม่ใช่ความล้มเหลวทางเทคนิค เช็คว่ามีค่านี้ไหม ไม่ใช่เช็คว่า
        // ไม่ว่างเปล่า เพราะ decodeJwtEmail คืน '' ได้จริง (token ที่ไม่มีทั้ง email และ
        // preferred_username) แต่การถูกปฏิเสธก็ยังเป็นเรื่องจริงเหมือนกัน ต้องไปหน้า /access-denied
        // ไม่ใช่หลุดไปที่ banner ทั่วไปด้านล่าง
        const denyParams = new URLSearchParams({ email: result.deniedEmail });
        navigate(`/access-denied?${denyParams.toString()}`, { replace: true });
      } else {
        // Any other failure here is loginWithTokens's generic catch-all (e.g. localStorage
        // throwing in a private-browsing mode) — a technical hiccup, not an authority denial, so
        // it belongs on the sign-in page's own error banner, not the access-denied page.
        // ความล้มเหลวอื่นตรงนี้เป็น catch-all ทั่วไปของ loginWithTokens (เช่น localStorage throw ใน
        // private browsing) — เป็นปัญหาทางเทคนิค ไม่ใช่การปฏิเสธสิทธิ์ จึงควรอยู่ที่ banner ของหน้า
        // sign-in ไม่ใช่หน้า access-denied
        const failParams = new URLSearchParams({ error: result.error || 'google_auth_failed' });
        if (next) failParams.set('next', next);
        navigate(`/login?${failParams.toString()}`, { replace: true });
      }
    });
  }, [loginWithTokens, navigate]);

  return null;
};

export default GoogleCallback;
