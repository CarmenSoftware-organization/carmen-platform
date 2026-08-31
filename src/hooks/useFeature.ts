import { useFeatureFlags } from '../context/FeatureFlagContext';
import type { FeatureState } from '../constants/featureFlags';

/**
 * สถานะของฟีเจอร์หนึ่งตัว สำหรับกรณีที่ต้อง "ปิดการใช้งาน" ปุ่มมากกว่าจะซ่อนมันทิ้ง
 * ปุ่มที่หายไปกลางฟอร์มทำให้ผู้ใช้งงกว่าปุ่มที่กดไม่ได้และบอกเหตุผล
 * For the disable-rather-than-hide case: a button that vanishes mid-form confuses more than a
 * disabled one that says why.
 * @param key - คีย์ฟีเจอร์ในแค็ตตาล็อก `src/constants/featureFlags.ts`
 * @returns สถานะปัจจุบัน คีย์ที่ไม่รู้จักคืน 'active'
 */
export function useFeature(key: string): FeatureState {
  return useFeatureFlags().flagOf(key);
}
