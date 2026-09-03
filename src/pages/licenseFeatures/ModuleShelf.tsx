import React from 'react';
import { cn } from '../../lib/utils';
import { useI18n } from '../../hooks/useI18n';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { FeatureStateToggle } from '../../components/FeatureStateToggle';
import type { FeatureState } from '../../constants/featureFlags';
import type { LicenseFeatureAdminRow } from '../../types';
import type { TKey } from '../../i18n/types';

export interface ModuleGroup {
  /** ส่วนหน้าของคีย์ก่อนจุดแรก เช่น `configuration` */
  moduleKey: string;
  /** แถวของโมดูลเอง (`parent_key === null`) — ขายแยกได้ จึงมีสถานะของตัวเอง */
  moduleRow?: LicenseFeatureAdminRow;
  /**
   * ลูกหลาน**ทุกชั้น**ที่ผ่านตัวกรองปัจจุบันแล้ว เรียงแบบ depth-first · depth 1 = ลูกตรง
   *
   * เรียงด้วยโครงต้นไม้ ไม่ใช่ `sort_order` ดิบ เพราะ generator วางหลานไว้แถบ `+500`
   * ของโมดูลราก — เรียงด้วย sort_order ตรง ๆ หลานจะไปกองท้ายชั้นวางแทนที่จะอยู่ใต้พ่อ
   */
  children: (LicenseFeatureAdminRow & { depth: number })[];
  /** จำนวนลูกทั้งหมดของโมดูลนี้ ก่อนกรอง — ตัวหารของข้อความ "แสดง x จาก y" */
  totalChildren: number;
  /** สถานะของลูกทั้งโมดูล ก่อนกรอง */
  childStates: Record<FeatureState, number>;
}

interface ModuleShelfProps {
  group: ModuleGroup;
  onChange: (row: LicenseFeatureAdminRow, next: FeatureState) => void;
  canManage: boolean;
  savingId: string | null;
  /** true เมื่อคำค้นหรือตัวกรองสถานะกำลังทำงาน — เปลี่ยนสิ่งที่หัวชั้นวางพูด */
  filtering: boolean;
  labelKeys: Record<FeatureState, TKey>;
  hintKeys: Record<FeatureState, TKey>;
}

/**
 * ชั้นวางหนึ่งโมดูล — หัวชั้น + ลูกของมัน
 *
 * แค็ตตาล็อกนี้เป็นต้นไม้สองชั้นอยู่แล้ว (10 โมดูล + 66 ลูก) แต่หน้าเดิมแสดงเป็นรายการแบน
 * 76 แถวเรียงตามคีย์ แบ่ง 8 หน้า พร้อมคอลัมน์ "โมดูล" ที่พิมพ์คำเดิมซ้ำ 18 แถวติดกัน —
 * คอลัมน์ที่ไม่ให้ข้อมูลใหม่สักแถว ที่นี่โมดูลกลายเป็น**หัวเรื่อง** คอลัมน์นั้นจึงหายไปเอง
 * และการแบ่งหน้าก็หมดความจำเป็น เพราะชุดข้อมูลมีเพดานเชิงโครงสร้างและอยู่ในหน่วยความจำครบแล้ว
 *
 * หัวชั้นสรุปจาก**ลูกทั้งโมดูล เสมอ ไม่ใช่เฉพาะที่ผ่านตัวกรอง** ("18 รายการ · ปิดขาย 2")
 * ตัวเลขที่หดตามตัวกรองจะทำให้ผู้อ่านเข้าใจว่าโมดูลมีของแค่นั้นจริง ๆ · ระหว่างกรองอยู่จึงบอก
 * "แสดง 2 จาก 18" แทน ซึ่งพูดถึงมุมมองปัจจุบันตรง ๆ โดยไม่แตะข้อเท็จจริงของโมดูล
 */
export const ModuleShelf: React.FC<ModuleShelfProps> = ({
  group,
  onChange,
  canManage,
  savingId,
  filtering,
  labelKeys,
  hintKeys,
}) => {
  const { t } = useI18n();
  const { moduleKey, moduleRow, children, totalChildren, childStates } = group;

  return (
    <Card>
      <CardContent className="p-0">
        {/* พื้นหลังของหัวชั้น ไม่ใช่แค่เส้นคั่น — ทุกแถวลูกก็มีเส้นคั่นเหมือนกัน เส้นอย่างเดียว
            จึงบอกไม่ได้ว่าแถวไหนคือหัวเรื่องและแถวไหนคือของบนชั้น */}
        <div className="flex flex-col gap-3 border-b border-border bg-muted px-4 py-2.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            {/* 16px/600 เทียบกับ 14px/400 ของแถวลูก — วัดแล้วว่าลำพัง font-weight กับพื้นหลัง
                จาง ๆ ยังทำให้หัวชั้นสูงและหนักเท่าแถวลูกจนแยกไม่ออกในการกวาดสายตา */}
            <h2 className="truncate text-base font-semibold">{moduleRow?.label ?? moduleKey}</h2>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-mono text-[10px] text-muted-foreground sm:text-xs">
                {moduleKey}
              </span>
              <span className="text-xs text-muted-foreground">
                {filtering
                  ? t('pages.licenseFeatures.moduleShowing', {
                      shown: children.length,
                      total: totalChildren,
                    })
                  : t('pages.licenseFeatures.moduleFeatureCount', { count: totalChildren })}
              </span>
              {childStates.inactive > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  {t('pages.licenseFeatures.moduleClosedCount', { count: childStates.inactive })}
                </Badge>
              )}
              {childStates.hide > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  {t('pages.licenseFeatures.moduleHiddenCount', { count: childStates.hide })}
                </Badge>
              )}
            </div>
          </div>

          {moduleRow && (
            <div className="flex flex-wrap items-center gap-3 lg:justify-end">
              <AffectedBuCount count={moduleRow.affected_bu_count} />
              <FeatureStateToggle
                value={moduleRow.state}
                onChange={(next) => onChange(moduleRow, next)}
                featureLabel={moduleRow.label}
                labelKeys={labelKeys}
                hintKeys={hintKeys}
                disabled={!canManage || savingId === moduleRow.id}
              />
            </div>
          )}
        </div>

        {children.length > 0 && (
          <ul className="divide-y divide-border">
            {children.map((row) => (
              <li
                key={row.id}
                // ค่าเยื้องขึ้นกับ depth ตอน runtime ซึ่ง Tailwind JIT สร้างคลาสให้ไม่ได้
                // (มันสแกนหาคลาสจากซอร์สตอน build) จึงต้องเป็น inline style · pr-4 แทน px-4
                style={{ paddingLeft: `${1 + (row.depth - 1) * 1.25}rem` }}
                className={cn(
                  'flex flex-col gap-2 py-3 pr-4',
                  'lg:flex-row lg:items-center lg:justify-between lg:gap-4',
                  savingId === row.id && 'opacity-60',
                )}
              >
                <div className="min-w-0 lg:flex-1">
                  <p className="truncate text-sm">{row.label}</p>
                  <p className="truncate font-mono text-[10px] text-muted-foreground sm:text-xs">
                    {row.key}
                  </p>
                  {informativeDescription(row, moduleKey) && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {row.description}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                  <AffectedBuCount count={row.affected_bu_count} />
                  <FeatureStateToggle
                    value={row.state}
                    onChange={(next) => onChange(row, next)}
                    featureLabel={row.label}
                    labelKeys={labelKeys}
                    hintKeys={hintKeys}
                    disabled={!canManage || savingId === row.id}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

/**
 * คำอธิบายจาก generator ส่วนใหญ่คือ `"View " + ชื่อแถว` ("View adjustment type" ใต้
 * "Adjustment Type") — บรรทัดที่สามที่พูดซ้ำบรรทัดแรกในทุกแถวของทั้งแค็ตตาล็อก
 * ทำให้หน้าสูงขึ้นหนึ่งในสามโดยไม่เพิ่มข้อมูลสักตัว จึงแสดงเฉพาะคำอธิบายที่พูดอะไรใหม่จริง ๆ
 *
 * เทียบแบบตัดช่องว่างและไม่สนตัวพิมพ์ เพราะ label เป็น Title Case ส่วนคำอธิบายเป็นตัวเล็ก
 */
function informativeDescription(row: LicenseFeatureAdminRow, moduleKey: string): boolean {
  if (!row.description) return false;
  const normalise = (s: string) => s.toLowerCase().replace(/[\s_-]/g, '');
  let desc = normalise(row.description.replace(/^view\s+/i, ''));
  // บางคำอธิบายเติมชื่อโมดูลนำหน้าด้วย ("View dashboard dataset" ใต้ Dashboard → "Dataset")
  // ชื่อโมดูลคือหัวชั้นที่แถวนี้อยู่ใต้อยู่แล้ว การพูดซ้ำจึงไม่ใช่ข้อมูลใหม่เช่นกัน
  const module = normalise(moduleKey);
  if (desc.startsWith(module)) desc = desc.slice(module.length);
  return desc !== normalise(row.label);
}

/**
 * น้ำหนักของการกด: มีกี่ BU ที่จะเสียเมนูนี้ไปถ้าตั้งเป็น `hide`
 *
 * ตัวเลขนี้มากับทุกแถวอยู่แล้วแต่หน้าเดิมไม่แสดงเลย — มันโผล่ครั้งเดียวในกล่องยืนยัน
 * คือ **หลัง**ผู้ดูแลกดไปแล้ว ทั้งที่มันคือข้อมูลที่ควรมีอยู่ตอนกำลังเลือกว่าจะกดตัวไหน
 *
 * `undefined` (gateway รุ่นเก่าไม่ส่ง) ≠ 0 — เว้นว่างไว้ ไม่พิมพ์ "0 BU" ซึ่งจะเป็นการยืนยัน
 * ว่าไม่มีใครถือคีย์นี้ ทั้งที่เราไม่รู้
 */
const AffectedBuCount: React.FC<{ count?: number }> = ({ count }) => {
  const { t } = useI18n();
  if (count === undefined) return null;
  return (
    <span
      className={cn(
        // ความกว้างคงที่มีไว้ให้ตัวเลขเรียงตรงกันเป็นคอลัมน์ ซึ่งมีความหมายเฉพาะตอนที่แถว
        // เป็นแถวจริง ๆ · ใต้ lg แถวถูก stack อยู่แล้ว 80px ที่ตายตัวจึงเหลือแค่ผลข้างเคียง
        // คือดันกลุ่มปุ่มตกไปอีกบรรทัดในทุกแถวของทั้งหน้า
        'shrink-0 text-xs tabular-nums lg:w-20 lg:text-right',
        count === 0 ? 'text-muted-foreground/60' : 'text-muted-foreground',
      )}
      title={t(
        count === 1
          ? 'pages.licenseFeatures.affectedBuTooltipOne'
          : 'pages.licenseFeatures.affectedBuTooltipMany',
        { count },
      )}
    >
      {t('pages.licenseFeatures.affectedBu', { count })}
    </span>
  );
};
