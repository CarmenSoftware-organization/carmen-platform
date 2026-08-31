import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import featureFlagService, { type FeatureStateMap } from '../services/featureFlagService';
import { DEFAULT_FEATURE_STATES, type FeatureState } from '../constants/featureFlags';
import { devLog } from '../utils/errorParser';

interface FeatureFlagContextValue {
  /** สถานะของฟีเจอร์หนึ่งตัว คีย์ที่ไม่รู้จักถือเป็น 'active' — ตัวครอบที่พิมพ์คีย์ผิดต้องไม่ซ่อน UI ทิ้ง */
  flagOf: (key: string) => FeatureState;
  /** แมปที่มีผลจริง = ค่าตั้งต้นในโค้ด ทับด้วยค่าจาก backend รายคีย์ */
  states: Record<string, FeatureState>;
  /** false จนกว่าคำขอแรกจะจบ (สำเร็จหรือล้มก็ตาม) — ตัวกรองเมนูและเส้นทางต้องรอค่านี้ */
  isReady: boolean;
  /** ให้หน้าตั้งค่าเรียกหลังบันทึก เพื่อให้ sidebar สะท้อนผลโดยไม่ต้องรีโหลด */
  refresh: () => Promise<void>;
}

const FeatureFlagContext = createContext<FeatureFlagContextValue | undefined>(undefined);

/**
 * จ่ายสถานะฟีเจอร์ให้ทั้งแอป โดยอ่านจาก backend ครั้งเดียวหลังยืนยันตัวตนสำเร็จ
 *
 * ยิงพลาด = ใช้ค่าตั้งต้นในโค้ดทั้งชุด และไม่ขึ้น toast โดยเจตนา — ผู้ใช้ทั่วไปทำอะไรกับความ
 * ผิดพลาดนี้ไม่ได้ และแอปยังใช้งานได้ครบ (เห็นทุกอย่าง) การเตือนจึงสร้างความกังวลโดยเปล่าประโยชน์
 * A failed fetch falls back to the in-code defaults silently: the app still works, everything is
 * visible, and an ordinary user can do nothing about it.
 *
 * `isReady` เป็น true เมื่อคำขอแรกจบไม่ว่าผลจะเป็นอย่างไร ผู้บริโภคจึงไม่ค้างรอตลอดกาลเมื่อ
 * backend ล่ม
 * isReady flips once the first request settles either way, so nothing waits forever.
 */
export const FeatureFlagProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  const [states, setStates] = useState<Record<string, FeatureState>>(DEFAULT_FEATURE_STATES);
  const [isReady, setIsReady] = useState(false);

  const load = useCallback(async () => {
    try {
      const remote: FeatureStateMap = await featureFlagService.getAll();
      setStates({ ...DEFAULT_FEATURE_STATES, ...remote });
    } catch (err) {
      devLog('featureFlags: falling back to in-code defaults', err);
      setStates(DEFAULT_FEATURE_STATES);
    } finally {
      setIsReady(true);
    }
  }, []);

  useEffect(() => {
    // ยังตัดสินไม่ได้ว่าใครล็อกอินอยู่ — รอ ไม่ยิง
    if (loading) return;
    // ยังไม่ล็อกอิน: หน้าสาธารณะ (Landing, Login, Changelog) ไม่มี flag ให้ใช้อยู่แล้ว และ endpoint
    // ต้องการ token จึงข้ามคำขอไปเลย แต่ต้องตั้ง isReady เป็น true ไม่งั้นหน้าเหล่านั้นค้างที่ตัวโหลด
    // Public pages carry no flags and the endpoint needs a token — skip the call, but still mark
    // ready or those pages hang on the loader forever.
    if (!isAuthenticated) {
      setStates(DEFAULT_FEATURE_STATES);
      setIsReady(true);
      return;
    }
    void load();
  }, [isAuthenticated, loading, load]);

  const flagOf = useCallback(
    (key: string): FeatureState => states[key] ?? 'active',
    [states],
  );

  return (
    <FeatureFlagContext.Provider value={{ flagOf, states, isReady, refresh: load }}>
      {children}
    </FeatureFlagContext.Provider>
  );
};

/**
 * อ่านสถานะฟีเจอร์จาก context
 * @returns ตัวช่วยอ่าน flag
 * @throws เมื่อถูกเรียกนอก FeatureFlagProvider
 */
export const useFeatureFlags = (): FeatureFlagContextValue => {
  const ctx = useContext(FeatureFlagContext);
  if (!ctx) throw new Error('useFeatureFlags must be used within a FeatureFlagProvider');
  return ctx;
};
