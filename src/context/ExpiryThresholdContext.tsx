import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import expiryThresholdService from '../services/expiryThresholdService';
import { devLog } from '../utils/errorParser';
import type { ExpiryThresholdsConfig } from '../types';

/**
 * ค่าตั้งต้นในโค้ด — ต้องตรงกับ default ของ registry ฝั่ง backend และกับ constant เดิม
 * (`DEFAULT_EXPIRING_SOON_DAYS` ใน `pages/licenses/licenseDates.ts`) ที่ระบบใช้มาตลอด
 * ใช้เมื่อยังไม่ล็อกอิน หรืออ่านค่าไม่สำเร็จ
 * The in-code defaults, identical to the backend registry defaults and the former constant.
 */
export const DEFAULT_EXPIRY_THRESHOLDS: ExpiryThresholdsConfig = {
  subscription_days: 30,
  bu_quota_days: 30,
  seat_days: 30,
};

interface ExpiryThresholdContextValue {
  /** เกณฑ์ที่มีผลจริง = ค่าตั้งต้นในโค้ด ทับด้วยค่าจาก backend รายฟิลด์ */
  thresholds: ExpiryThresholdsConfig;
  /** false จนกว่าคำขอแรกจะจบ (สำเร็จหรือล้มก็ตาม) */
  isReady: boolean;
  /** ให้หน้าตั้งค่าเรียกหลังบันทึก เพื่อให้ป้ายในหน้าอื่นสะท้อนผลโดยไม่ต้องรีโหลดทั้งแอป */
  refresh: () => Promise<void>;
}

const ExpiryThresholdContext = createContext<ExpiryThresholdContextValue | undefined>(undefined);

/**
 * จ่ายเกณฑ์ "ใกล้หมดอายุ" ให้ทั้งแอป โดยอ่านจาก backend ครั้งเดียวหลังยืนยันตัวตนสำเร็จ
 *
 * ยิงพลาด = ใช้ค่าตั้งต้นในโค้ด และไม่ขึ้น toast โดยเจตนา — ผู้ใช้ทั่วไปทำอะไรกับความผิดพลาดนี้
 * ไม่ได้ และหน้ารายการใบยังใช้งานได้ครบ (แค่ป้ายเตือนใช้เกณฑ์เดิม 30 วัน) การเตือนจึงสร้าง
 * ความกังวลโดยเปล่าประโยชน์ · ท่าเดียวกับ FeatureFlagContext
 * A failed fetch falls back silently: the lists still work, only the badge window is the old one.
 *
 * ทับรายฟิลด์ ไม่ใช่ทั้งก้อน — backend ที่ยังไม่รู้จักฟิลด์ใดฟิลด์หนึ่งจะไม่ทำให้ฟิลด์นั้นเป็น
 * `undefined` แล้วการคำนวณกลายเป็น `NaN` (ซึ่งทำให้ทุกการเทียบเป็น false เงียบ ๆ ป้าย
 * "ใกล้หมดอายุ" จะหายไปทั้งระบบโดยไม่มี error ให้เห็น)
 * Merged per field so a backend that predates a field cannot turn it into NaN.
 */
export const ExpiryThresholdProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  const [thresholds, setThresholds] = useState<ExpiryThresholdsConfig>(DEFAULT_EXPIRY_THRESHOLDS);
  const [isReady, setIsReady] = useState(false);

  const load = useCallback(async () => {
    try {
      const remote = await expiryThresholdService.getAll();
      setThresholds({ ...DEFAULT_EXPIRY_THRESHOLDS, ...remote });
    } catch (err) {
      devLog('expiryThresholds: falling back to in-code defaults', err);
      setThresholds(DEFAULT_EXPIRY_THRESHOLDS);
    } finally {
      setIsReady(true);
    }
  }, []);

  useEffect(() => {
    // ยังตัดสินไม่ได้ว่าใครล็อกอินอยู่ — รอ ไม่ยิง
    if (loading) return;
    // หน้าสาธารณะ (Landing, Login, Changelog) ไม่มีรายการใบให้แสดง และ endpoint ต้องการ token
    // จึงข้ามคำขอไปเลย แต่ต้องตั้ง isReady เป็น true ไม่งั้นผู้บริโภคที่รอค่านี้จะค้างตลอดกาล
    // Public pages carry no licence lists and the endpoint needs a token — skip the call, but
    // still mark ready or anything waiting on it hangs forever.
    if (!isAuthenticated) {
      setThresholds(DEFAULT_EXPIRY_THRESHOLDS);
      setIsReady(true);
      return;
    }
    void load();
  }, [isAuthenticated, loading, load]);

  return (
    <ExpiryThresholdContext.Provider value={{ thresholds, isReady, refresh: load }}>
      {children}
    </ExpiryThresholdContext.Provider>
  );
};

/**
 * อ่านเกณฑ์ "ใกล้หมดอายุ" จาก context
 * @returns เกณฑ์ทั้งสามพร้อมสถานะการโหลดและตัวรีเฟรช
 * @throws เมื่อถูกเรียกนอก ExpiryThresholdProvider
 */
export const useExpiryThresholds = (): ExpiryThresholdContextValue => {
  const ctx = useContext(ExpiryThresholdContext);
  if (!ctx) throw new Error('useExpiryThresholds must be used within an ExpiryThresholdProvider');
  return ctx;
};
