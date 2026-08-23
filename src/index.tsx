import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// Telemetry — import แบบ dynamic โดยตั้งใจ: environment ที่ไม่เปิดจะไม่โหลด
// OTel SDK ลงเครื่องผู้ใช้เลย ไม่บล็อกการ render เพราะ error ที่เกิดก่อน SDK
// พร้อมจะถูก window handler เก็บได้อยู่แล้วเมื่อมันติดตั้งเสร็จ
if (import.meta.env.REACT_APP_OTEL_ENABLED === 'true') {
  void import('./lib/telemetry')
    .then((m) => m.initTelemetry(String(import.meta.env.REACT_APP_VERSION ?? '0.0.0')))
    .catch((e) => console.warn('[telemetry] init failed', e));
}

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
