import React from 'react';
import { useFeatureFlags } from '../context/FeatureFlagContext';

interface FeatureProps {
  /** คีย์ฟีเจอร์ในแค็ตตาล็อก `src/constants/featureFlags.ts` */
  flag: string;
  /** วาดแทนเมื่อสถานะเป็น `hide` (ค่าเริ่มต้น: ไม่วาดอะไร) */
  fallback?: React.ReactNode;
  /** วาดแทนเมื่อสถานะเป็น `inactive` — ไม่ระบุจะถือเหมือน `hide` */
  inactiveFallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * วาดลูกเฉพาะเมื่อฟีเจอร์อยู่ในสถานะ `active` — ทรงเดียวกับ `<Can>` โดยเจตนา เพื่อให้อ่านคู่กันได้
 * ในไฟล์เดียว (`<Can>` = ผู้ใช้คนนี้ทำได้ไหม, `<Feature>` = ของนี้พร้อมหรือยัง)
 * Deliberately shaped like <Can> so the two read together: one asks about the user, one about
 * the feature.
 *
 * ไม่รอ `isReady`: ก่อนค่าจาก backend มาถึง context จ่ายค่าตั้งต้นในโค้ดอยู่แล้ว ชิ้นส่วนย่อยจึง
 * "กระพริบ" ได้อย่างมากหนึ่งเฟรม ซึ่งยอมรับได้ ต่างจากเมนูและเส้นทางที่ต้องรอ
 * Does not wait for isReady: a fragment may flicker for a frame, which is acceptable — unlike a
 * menu row or a whole route.
 */
const Feature: React.FC<FeatureProps> = ({ flag, fallback = null, inactiveFallback, children }) => {
  const state = useFeatureFlags().flagOf(flag);
  if (state === 'active') return <>{children}</>;
  if (state === 'inactive') return <>{inactiveFallback ?? fallback}</>;
  return <>{fallback}</>;
};

export default Feature;
