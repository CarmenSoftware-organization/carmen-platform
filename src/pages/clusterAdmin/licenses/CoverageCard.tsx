import { Link } from 'react-router-dom';
import { ChevronRight, RefreshCw, type LucideIcon } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { Skeleton } from '../../../components/ui/skeleton';
import { LicenseTimeline, useCoverageWindow } from '../../businessUnitEdit/LicenseTimeline';
import { fmtCoverageRange, daysLeft, isPerpetual } from '../../licenses/licenseDates';
import { useI18n } from '../../../hooks/useI18n';

export interface CoverageRowItem {
  id: string;
  start_date: string;
  end_date: string;
  /** ใบที่คุ้มครองอยู่จริง — ป้ายนับถอยหลังและ "หมดเร็วสุด" นับจากใบเหล่านี้เท่านั้น */
  live: boolean;
  /** บรรทัดบน monospace — เลขที่ใบ */
  primary: React.ReactNode;
  /** บรรทัดล่าง — BU · กลุ่ม · ช่วงวัน ผู้เรียกประกอบเองเพราะรู้บริบท */
  secondary: React.ReactNode;
  /** ป้ายสถานะจาก backend — การ์ดไม่คำนวณสถานะเอง */
  badge: React.ReactNode;
  /** ปลายทางเมื่อกดแถว — ไม่ส่ง = แถวไม่เป็นลิงก์ (ผู้เรียกตัดสินตามสิทธิ์ของ shell) */
  href?: string;
  ariaLabel?: string;
  /** กลุ่มที่แถวนี้สังกัด (BU) — แถวที่ `group.key` เท่ากันถูกวางใต้หัวกลุ่มเดียวกัน */
  group: { key: string; label: string };
}

export interface CoverageCardProps {
  icon: LucideIcon;
  label: string;
  /** แถวที่จะวาด — ผู้เรียกกรองมาแล้ว (หน้านี้แสดงเฉพาะใบที่คุ้มครองอยู่) */
  items: CoverageRowItem[];
  /** จำนวนใบทั้งหมดก่อนกรอง — หัวการ์ดใช้บอกว่ามีใบที่ไม่ได้วาดอยู่กี่ใบ ไม่ส่ง = เท่า `items.length` */
  totalCount?: number;
  loading: boolean;
  /** โหลดล้มทั้งก้อน — ต่างจาก `items.length === 0` */
  failed?: boolean;
  /** ข้อความเมื่อ `failed` — ผู้เรียกประกอบ */
  failedText?: string;
  /** โหลดล้มบางส่วน (ราย BU) — ขึ้นเป็นบรรทัดเตือนใต้หัว ไม่ใช่แทนที่รายการ */
  partialFailText?: string;
  emptyText: string;
  onRetry?: () => void;
  /** วันนับถอยหลัง (จาก ExpiryThresholdContext) — ใบ live ที่เหลือน้อยกว่านี้ขึ้นป้ายเตือน */
  soonDays: number;
  now?: Date;
}

/**
 * การ์ดช่วงคุ้มครองระดับ cluster — สัญญาและใบ interface ใช้การ์ดเดียวกัน ต่างกันแค่ข้อมูล
 *
 * หัวการ์ดตอบสามคำถามโดยไม่ต้องอ่านรายการ: ใช้ได้กี่ใบ · หมดเร็วสุดเมื่อไร (แถบซ้อนทุกใบ) ·
 * มีกี่ใบที่ต้องต่อเร็ว ๆ นี้ รายการจัดกลุ่มตาม BU (หัวกลุ่มเล็ก ๆ ต่อหน่วย) และเรียงตามวันหมดอายุ
 * ใบที่ไม่คุ้มครอง (หมด/ถูกครอบ/ยังไม่เริ่ม) วาดจางบนแถบ ผู้อ่านจึงเห็นช่องโหว่ระหว่างใบก่อนจะเห็นตัวเลข
 *
 * ป้ายหัวกลุ่มเป็นตัวพิมพ์ใหญ่แบบเดียวกับ `CollapsibleGroupCard`/`CapacityStrip` — หน้านี้ทั้งหน้า
 * ต้องอ่านเป็นแอปเดียว ไม่ใช่ CardTitle ของหน้า platform
 */
export function CoverageCard({
  icon: Icon, label, items, totalCount, loading, failed = false, failedText, partialFailText, emptyText,
  onRetry, soonDays, now = new Date(),
}: CoverageCardProps) {
  const { t } = useI18n();
  const window = useCoverageWindow(now);
  const soonMs = soonDays * 24 * 60 * 60 * 1000;
  const nowMs = now.getTime();
  const live = items.filter((i) => i.live);
  const total = totalCount ?? items.length;
  const isSoon = (i: CoverageRowItem) =>
    i.live && !isPerpetual(i.end_date) && Date.parse(i.end_date) - nowMs <= soonMs;
  const soonCount = items.filter(isSoon).length;
  const showList = !loading && !failed;

  // จัดกลุ่มตาม BU โดยรักษาลำดับที่ผู้เรียกเรียงมา (ตามวันหมดอายุ): กลุ่มที่มีใบหมดเร็วสุดขึ้นก่อน
  // และในกลุ่มก็ยังเรียงตามวันหมดอายุ — คำถามของ cluster admin คือ "BU ไหนต้องต่อก่อน"
  const groups: { key: string; label: string; rows: CoverageRowItem[] }[] = [];
  for (const i of items) {
    const g = groups.find((x) => x.key === i.group.key);
    if (g) g.rows.push(i);
    else groups.push({ key: i.group.key, label: i.group.label, rows: [i] });
  }

  return (
    <Card className="flex h-full flex-col p-0">
      <div className="space-y-2 p-4 sm:px-6 sm:py-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1.5 text-[11px] font-bold tracking-[0.13em] uppercase">
            <Icon className="size-3.5" aria-hidden="true" />
            {label}
          </span>
          {showList && total > 0 && (
            <span className="text-muted-foreground text-xs tabular-nums">
              {t('pages.clusterAdmin.coverageLiveCount', { count: live.length, total })}
            </span>
          )}
          {showList && soonCount > 0 && (
            <Badge variant="warning">{t('pages.clusterAdmin.coverageExpiringSoonCount', { count: soonCount })}</Badge>
          )}
          {onRetry && (failed || partialFailText) && (
            <Button variant="outline" size="sm" className="ml-auto" onClick={onRetry} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {t('common.action.retry')}
            </Button>
          )}
        </div>

        {loading && (
          <div className="space-y-2" role="status" aria-label={t('common.busy.loadingEllipsis')}>
            <Skeleton className="h-2.5 w-full max-w-sm" />
            <Skeleton className="h-3 w-40" />
          </div>
        )}
        {showList && items.length > 0 && (
          <LicenseTimeline variant="group" items={items} window={window} now={now} />
        )}
        {!loading && partialFailText && (
          <p className="text-destructive text-xs">{partialFailText}</p>
        )}
      </div>

      <div className="flex-1 space-y-2 border-t p-4 sm:px-6 sm:py-4">
        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
          </div>
        )}
        {!loading && failed && (
          <p className="text-destructive text-xs">{failedText}</p>
        )}
        {showList && items.length === 0 && (
          <p className="text-muted-foreground text-xs">{emptyText}</p>
        )}
        {showList && groups.map((g) => (
          <section key={g.key} aria-label={g.label} className="space-y-1.5">
            <h4 className="text-muted-foreground px-1 pt-1 text-[11px] font-medium tracking-wide uppercase">
              {g.label}
            </h4>
            {g.rows.map((i) => {
              const soon = isSoon(i);
              const rowClass = 'flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs';
              const body = (
                <>
                  <div className="min-w-0 space-y-0.5">
                    <div className={`font-mono ${i.href ? 'group-hover:underline' : ''}`}>{i.primary}</div>
                    <div className="text-muted-foreground">{i.secondary}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <LicenseTimeline
                      variant="item"
                      items={[i]}
                      window={window}
                      now={now}
                      label={t('pages.licenses.coverageBarLabel', { text: fmtCoverageRange(i.start_date, i.end_date, t('common.state.noExpiry')) })}
                    />
                    {soon && <Badge variant="warning">{t('common.state.daysLeft', { count: daysLeft(i.end_date, now) })}</Badge>}
                    {i.badge}
                    {i.href && (
                      <ChevronRight className="text-muted-foreground h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    )}
                  </div>
                </>
              );
              // ทั้งแถวเป็นลิงก์จริง (<a>) รูปเดียวกับแถวบนแท็บ Licenses ของ BU — เปิดแท็บใหม่/คลิกกลางได้
              return i.href ? (
                <Link
                  key={i.id}
                  to={i.href}
                  aria-label={i.ariaLabel}
                  className={`group ${rowClass} hover:bg-muted/50 focus-visible:ring-ring transition-colors focus-visible:ring-2 focus-visible:outline-none`}
                >
                  {body}
                </Link>
              ) : (
                <div key={i.id} className={rowClass}>{body}</div>
              );
            })}
          </section>
        ))}
      </div>
    </Card>
  );
}
