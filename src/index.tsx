import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { CURRENT_VERSION } from './components/VersionBadge';

// Telemetry — import แบบ dynamic โดยตั้งใจ: environment ที่ไม่เปิดจะไม่โหลด
// OTel SDK ลงเครื่องผู้ใช้เลย ไม่บล็อกการ render เพราะ error ที่เกิดก่อน SDK
// พร้อมจะถูก window handler เก็บได้อยู่แล้วเมื่อมันติดตั้งเสร็จ
// เวอร์ชันมาจาก changelog.json ที่เดียวกับ VersionBadge — REACT_APP_VERSION ไม่เคยมีใครตั้ง
// ทุก build จึงรายงานเป็น 0.0.0
if (import.meta.env.REACT_APP_OTEL_ENABLED === 'true') {
  void import('./lib/telemetry')
    .then((m) => m.initTelemetry(CURRENT_VERSION))
    .catch((e) => console.warn('[telemetry] init failed', e));
}

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
