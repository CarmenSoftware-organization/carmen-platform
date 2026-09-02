import { EMAIL_FLOWS } from '../../constants/emailFlows';
import type { EmailFlowMeta } from '../../constants/emailFlows';
import type { EmailRoutingConfig, EmailSetting } from '../../types';

/** เลนหนึ่งเส้นของแผงสาย = โปรไฟล์ปลายทางหนึ่งตัว กับเส้นทางทั้งหมดที่วิ่งเข้ามาหามัน */
export interface RoutingLane {
  profileId: string;
  /** null = mapping ชี้ไป id ที่ไม่มีในรายการโปรไฟล์แล้ว (ถูกลบทิ้งโดยไม่ได้แก้ mapping) */
  profile: EmailSetting | null;
  isDefault: boolean;
  /** เส้นทางที่เลือกโปรไฟล์นี้ไว้ตรง ๆ */
  explicit: EmailFlowMeta[];
  /** เส้นทางที่ตกมาถึงเพราะเป็นค่าเริ่มต้น — ว่างเสมอ ยกเว้นเลนของ default */
  inherited: EmailFlowMeta[];
}

export interface RoutingMap {
  lanes: RoutingLane[];
  /** เส้นทางที่ยังไม่มีปลายทาง เพราะยังไม่ได้เลือกโปรไฟล์เริ่มต้น */
  unrouted: EmailFlowMeta[];
}

const EMPTY: RoutingMap = { lanes: [], unrouted: [] };

/**
 * แปลง mapping แบน ๆ (`{ default: id, register: id, … }`) เป็นภาพฝั่งปลายทาง
 *
 * หน้านี้ถามคำถามเดียวว่า "อีเมลแต่ละชนิดออกจากปากไหน" ซึ่งอ่านจากฝั่งโปรไฟล์ได้ตรงกว่า:
 * โปรไฟล์ที่ไม่มีเส้นทางวิ่งเข้าเลยจะกลายเป็นเลนว่างที่มองเห็นได้ ต่างจากตาราง mapping เดิม
 * ที่บอกได้แค่ว่าเส้นทางไหนไปไหน แล้วปล่อยให้ผู้ดูแลไล่ทีละบรรทัดเองว่าโปรไฟล์ตัวไหนตกสำรวจ
 *
 * คืน `EMPTY` เมื่อยังไม่มี routing — ผู้เรียกต้องไม่วาดอะไรเลยในจังหวะนั้น เพราะเลนว่างล้วน
 * จะอ่านได้ว่า "ไม่มีใครใช้โปรไฟล์เหล่านี้" ซึ่งเป็นคำโกหกระหว่างที่ยังโหลดไม่เสร็จ
 *
 * ลำดับเลน: ค่าเริ่มต้นก่อน แล้วเลนที่มีเส้นทางวิ่งเข้า แล้วเลนที่ดับ — เรียงตามลำดับโปรไฟล์เดิม
 * ในแต่ละกลุ่ม ผู้ดูแลจึงเห็นสิ่งที่ทำงานอยู่ก่อนสิ่งที่ไม่ได้ทำงาน
 */
export function buildRoutingMap(
  routing: EmailRoutingConfig | null,
  profiles: EmailSetting[],
): RoutingMap {
  if (!routing) return EMPTY;

  const defaultId = routing.default ?? '';
  const explicitBy: Record<string, EmailFlowMeta[]> = {};
  const inherited: EmailFlowMeta[] = [];

  for (const flow of EMAIL_FLOWS) {
    const target = routing[flow.value];
    if (target) {
      (explicitBy[target] ??= []).push(flow);
    } else {
      inherited.push(flow);
    }
  }

  // id ทุกตัวที่ต้องมีเลน: โปรไฟล์ที่มีอยู่จริง + id ที่ mapping อ้างถึงแต่หาโปรไฟล์ไม่เจอแล้ว
  const byId: Record<string, EmailSetting> = {};
  for (const p of profiles) byId[p.id] = p;

  const laneFor = (id: string): RoutingLane => ({
    profileId: id,
    profile: byId[id] ?? null,
    isDefault: id === defaultId,
    explicit: explicitBy[id] ?? [],
    inherited: id === defaultId ? inherited : [],
  });

  const orphanIds = [defaultId, ...Object.keys(explicitBy)].filter(
    (id, i, all) => id && !byId[id] && all.indexOf(id) === i,
  );
  const ids = [...profiles.map((p) => p.id), ...orphanIds];
  const lanes = ids.map(laneFor);
  const weight = (lane: RoutingLane): number => {
    if (lane.isDefault) return 0;
    return lane.explicit.length > 0 ? 1 : 2;
  };
  lanes.sort((a, b) => weight(a) - weight(b));

  return { lanes, unrouted: defaultId ? [] : inherited };
}

/** เลนของโปรไฟล์ตัวหนึ่ง — การ์ดโปรไฟล์ใช้ตัวนี้เพื่อพูดเรื่องเดียวกับแผงสายด้านบน */
export function laneOf(map: RoutingMap, profileId: string): RoutingLane | null {
  return map.lanes.find((lane) => lane.profileId === profileId) ?? null;
}
