import { Link } from 'react-router-dom';
import { FileText, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import Can from '../../components/Can';
import { useI18n } from '../../hooks/useI18n';
import { cn } from '../../lib/utils';
import type { LicenseFeatureGroup } from '../../types';

/**
 * แถบส่วนประกอบของชุดสิทธิ์ — เศษของแค็ตตาล็อกทั้งหมดที่ชุดนี้กินไป
 *
 * ตัวหารมาจากผู้เรียกโดยตั้งใจ ไม่คำนวณเองจาก `count` ที่มากที่สุดในหน้า: ถ้าแต่ละใบย่อ/ขยาย
 * แกนตามข้อมูลของตัวเอง แถบสองแถบที่ยาวเท่ากันจะหมายถึงคนละจำนวน ซึ่งแย่กว่าไม่มีแถบเลย
 * (บทเรียนเดียวกับ `windowStart`/`windowEnd` ของ LicenseCoverageBar)
 *
 * ตัวหารเป็น `null` ได้ = แค็ตตาล็อกโหลดไม่สำเร็จ ผู้เรียกต้องไม่วาดแถบเลย ไม่ใช่เปลี่ยนไปใช้
 * ตัวหารสำรอง เพราะนั่นทำให้ความยาวของแถบเปลี่ยนความหมายไปเงียบ ๆ
 */
function FeatureCompositionBar({ count, total, label }: { count: number; total: number; label: string }) {
  const pct = total > 0 ? Math.min(100, (count / total) * 100) : 0;
  return (
    <div
      className="bg-foreground/10 h-2 w-full overflow-hidden rounded-full"
      role="img"
      aria-label={label}
      title={label}
    >
      <div
        className="bg-primary h-full rounded-full"
        // ชุดที่มีสิทธิ์เดียวจากร้อยกว่าตัวจะได้แถบ <1% ซึ่งมองไม่เห็น — ยกพื้นไว้ที่ 1.5%
        // "มีนิดเดียว" กับ "ไม่มีเลย" ต้องอ่านต่างกัน
        style={{ width: count > 0 ? `${Math.max(pct, 1.5)}%` : '0%' }}
      />
    </div>
  );
}

export interface FeatureGroupCardProps {
  group: LicenseFeatureGroup;
  /** ขนาดแค็ตตาล็อกทั้งหมด — `null` = โหลดไม่ได้ ให้ซ่อนแถบแล้วเหลือแต่ตัวเลข */
  catalogTotal: number | null;
  /**
   * มีกลุ่มอื่นถือ `sort_order` ค่าเดียวกันอยู่ — คำนวณจากแค็ตตาล็อก **ทั้งชุด** ไม่ใช่ผลกรอง
   * ที่เห็นอยู่ เพราะการชนกันของลำดับเป็นสมบัติของแค็ตตาล็อก ไม่ใช่ของมุมมองปัจจุบัน
   */
  duplicateOrder: boolean;
  onDelete: (group: LicenseFeatureGroup) => void;
}

/**
 * ชุดสิทธิ์หนึ่งชุดบนชั้นวาง — แทนแถวในตาราง
 *
 * ที่ต้องเป็นการ์ดไม่ใช่แถว: จำนวนชุดมีเพดานเชิงโครงสร้าง (คนตั้งเอง ไม่งอกตามการใช้งาน) และ
 * สิ่งที่คนดูหน้านี้ต้องตอบมีสามข้อ — *ในชุดมีอะไร* · *แก้แล้วกระทบสัญญากี่ฉบับ* · *ยังขายอยู่ไหม*
 * ตารางตอบข้อแรกด้วยจำนวนเต็มลอย ๆ ที่เทียบข้ามแถวไม่ได้ และวาดข้อที่สองด้วยน้ำหนักเท่ากับ
 * เลขนับธรรมดา ทั้งที่มันคือรัศมีความเสียหายของการกดแก้
 *
 * แถบส่วนประกอบเรียงชิดซ้ายตรงกันทุกใบ (`pl-9` = ความกว้างป้ายลำดับ + gap) — นั่นคือเหตุผลที่
 * ชั้นวางนี้ยังเป็นคอลัมน์เดียวไม่ใช่กริด: มันมีไว้ให้เทียบชุดกัน ไม่ใช่ให้ไล่อ่านทีละใบ
 */
export function FeatureGroupCard({
  group, catalogTotal, duplicateOrder, onDelete,
}: FeatureGroupCardProps) {
  const { t } = useI18n();
  const editPath = `/license-feature-groups/${group.id}/edit`;
  const inUse = group.subscription_count > 0;

  const countLabel = catalogTotal !== null
    ? t('pages.licenseFeatureGroups.featuresOfTotal', {
        count: group.feature_count,
        total: catalogTotal,
      })
    : t('pages.licenseFeatureGroups.featuresOnly', { count: group.feature_count });

  return (
    <Card className={cn(!group.is_active && 'bg-muted/40')}>
      <CardContent className="space-y-3 py-4">
        <div className="flex items-start gap-3">
          {/* ค่า `sort_order` จริง ไม่ใช่เลขแถว — คอลัมน์ `#` ของ DataTable แสดงลำดับตอน fetch
              ซึ่งเป็นคนละค่ากันและอ่านเหมือนการเรียงที่พัง

              ลำดับที่ชนกันถูกทำให้เห็น ไม่ใช่ทำให้เนียน: ถ้าสองกลุ่มถือเลขเดียวกัน ลำดับบนฟอร์มขาย
              ตกไปอยู่กับ tie-break ของ backend ซึ่งไม่มีใครตั้งใจ — การวาดชิปให้เท่ากันหมดจะทำให้
              หน้านี้รับรองลำดับที่ตัวเองไม่รู้ */}
          <span
            title={
              duplicateOrder
                ? t('pages.licenseFeatureGroups.ordinalDuplicateHint', { n: group.sort_order })
                : t('pages.licenseFeatureGroups.ordinalHint', { n: group.sort_order })
            }
            className={cn(
              'mt-0.5 inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md border bg-background px-1.5 font-mono text-xs tabular-nums',
              duplicateOrder ? 'border-warning text-warning' : 'text-muted-foreground',
            )}
          >
            {group.sort_order}
          </span>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link
                to={editPath}
                className="font-mono text-xs text-primary hover:underline"
                title={group.code}
              >
                {group.code}
              </Link>
              <span className="text-sm font-medium">{group.name}</span>
              <Badge variant={group.is_active ? 'success' : 'secondary'}>
                {group.is_active ? t('common.status.active') : t('common.status.inactive')}
              </Badge>
            </div>
            {group.description && (
              // ไม่ truncate บรรทัดเดียวเหมือนในตาราง — คำอธิบายคือสิ่งที่บอกว่าชุดนี้ขายให้ใคร
              <p className="line-clamp-2 text-xs text-muted-foreground">{group.description}</p>
            )}
          </div>

          <Can permission="license_feature_group.manage">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="-mt-1 shrink-0"
                  aria-label={t('common.action.rowActions', { name: group.name })}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link to={editPath}>
                    <Pencil className="mr-2 h-4 w-4" />
                    {t('common.action.edit')}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => onDelete(group)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t('common.action.delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </Can>
        </div>

        <div className="flex items-center gap-3 pl-9">
          {catalogTotal !== null && (
            <FeatureCompositionBar
              count={group.feature_count}
              total={catalogTotal}
              label={countLabel}
            />
          )}
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{countLabel}</span>
        </div>

        <div className="pl-9">
          {/* บนหน้ารายการเลขนี้คือ "รู้ไว้" — มันกลายเป็นคำเตือนสีส้มบนหน้าแก้ไข ซึ่งเป็นจุดที่
              การกระทำเกิดจริง ถ้าเตือนตั้งแต่หน้ารายการ ทุกชุดที่ขายได้ก็จะเป็นสีเตือนตลอดเวลา */}
          <Badge variant={inUse ? 'info' : 'secondary'} className="gap-1.5 font-normal">
            <FileText className="h-3 w-3" />
            {/* คีย์เอกพจน์แยกต่างหาก — `translate()` เป็นการแทนที่ {{}} ล้วน ไม่มีกลไก plural
                ป้ายที่คนอ่านทุกครั้งจึงไม่ควรขึ้นว่า "Used by 1 contracts" */}
            {!inUse
              ? t('pages.licenseFeatureGroups.inUseNone')
              : group.subscription_count === 1
                ? t('pages.licenseFeatureGroups.inUseCountOne')
                : t('pages.licenseFeatureGroups.inUseCount', { count: group.subscription_count })}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
