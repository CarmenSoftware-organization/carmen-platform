import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

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

    if (!accessToken || !refreshToken) {
      navigate('/login?error=google_auth_failed', { replace: true });
      return;
    }

    loginWithTokens(accessToken, refreshToken).then((result) => {
      if (result.success) {
        navigate('/dashboard', { replace: true });
      } else {
        navigate(`/login?error=${encodeURIComponent(result.error || 'google_auth_failed')}`, {
          replace: true,
        });
      }
    });
  }, [loginWithTokens, navigate]);

  return null;
};

export default GoogleCallback;
