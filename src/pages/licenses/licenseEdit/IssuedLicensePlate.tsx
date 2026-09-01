import { FileText } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { Card } from '../../../components/ui/card';
import { cn } from '../../../lib/utils';
import { useI18n } from '../../../hooks/useI18n';
import type { TFunction } from '../../../i18n/types';
import type { BuLicenseStatus, ClusterLicenseStatus } from '../../../types';
import { IdentityRow, TermRail } from '../plate/plateParts';
import { termLabel } from '../subscriptionCreate/SubscriptionDraftPlate';
import { contractTerm } from '../subscriptionCreate/subscriptionTerm';

const DAY_MS = 86_400_000;

export type LicenseStatus = BuLicenseStatus | ClusterLicenseStatus;

/**
 * ป้ายสถานะที่หน้าเป็นคนคิดมาแล้ว — ตัวแปรสีกับข้อความมาจาก `STATUS_VARIANT`/`STATUS_LABEL_KEYS`
 * ใน `LicensePurchaseForm.tsx` แผ่นนี้แค่วาด ไม่ตัดสินสถานะเอง
 */
export interface StatusBadgeInfo {
  variant: 'success' | 'secondary' | 'destructive';
  label: string;
}

interface Remaining {
  text: string;
  tone: 'muted' | 'warning' | 'destructive';
}

/**
 * "เหลืออีก N วัน" / "หมดอายุมาแล้ว N วัน" / "เริ่มในอีก N วัน" — คำเดียวที่ตอบคำถามแรกของคน
 * ที่เปิดหน้านี้ ซึ่งกล่องวันที่สองกล่องไม่เคยตอบ
 *
 * เกณฑ์สีเหลืองมาจาก `useExpiryThresholds()` ไม่ใช่ค่าคงที่ 30 ในโค้ด — เกณฑ์นั้นตั้งค่าได้จาก
 * หน้าจอตั้งแต่ #227 และหน้าที่ระบายสีด้วยเลขของตัวเองจะขัดกับป้ายในตารางที่มาจากใบเดียวกัน
 *
 * ใบที่ถูกแทนที่/ยกเลิกไม่คืนอะไรเลย — "เหลืออีก 3,640 วัน" บนใบที่ไม่ให้สิทธิ์แล้วคือคำโกหก
 * ที่อ่านเหมือนความจริง ป้ายสถานะข้าง ๆ พูดเรื่องนี้จบไปแล้ว
 */
function remainingOf(
  status: LicenseStatus,
  endMs: number,
  startMs: number,
  thresholdDays: number,
  now: number,
  t: TFunction,
): Remaining | null {
  if (status === 'superseded' || status === 'cancelled') return null;
  if (status === 'scheduled') {
    if (!Number.isFinite(startMs)) return null;
    return { text: t('pages.licenses.startsInDays', { count: Math.ceil((startMs - now) / DAY_MS) }), tone: 'muted' };
  }
  if (!Number.isFinite(endMs)) return null;
  if (status === 'expired') {
    return { text: t('pages.licenses.expiredDaysAgo', { count: Math.ceil((now - endMs) / DAY_MS) }), tone: 'destructive' };
  }
  const days = Math.ceil((endMs - now) / DAY_MS);
  return { text: t('common.state.daysLeft', { count: days }), tone: days <= thresholdDays ? 'warning' : 'muted' };
}

const TONE_CLASS: Record<Remaining['tone'], string> = {
  muted: 'text-muted-foreground',
  warning: 'text-warning',
  destructive: 'text-destructive',
};

export interface IssuedLicensePlateProps {
  /** 'Seats' / 'BU quota' — แปลแล้วจาก `AMOUNT_LABEL_KEYS` ของหน้า */
  amountLabel: string;
  /** ค่าดิบจากช่องกรอก — แผ่นนี้สะท้อนสิ่งที่กำลังจะบันทึก ไม่ใช่สิ่งที่บันทึกไว้แล้ว */
  amount: string;
  /** 'YYYY-MM-DD' ตรงจากฟอร์ม */
  startDate: string;
  endDate: string;
  noExpiry: boolean;
  status: LicenseStatus;
  statusBadge: StatusBadgeInfo;
  /** เกณฑ์ "ใกล้หมดอายุ" เป็นวัน จาก `useExpiryThresholds()` ของหน้า */
  thresholdDays: number;
  ownerTypeLabel: string;
  owner: { id: string; label: string };
  cluster: { id: string; label: string } | null;
}

/**
 * ใบที่ออกไปแล้ว วาดเป็นสิ่งที่มันเป็น
 *
 * หน้าแก้ไขใบเคยเป็นตาราง 7 ช่องที่มี 4 ช่องแก้ไม่ได้ แต่ถูกวาดเป็นกล่องมีขอบเหมือนช่องกรอก
 * ทั้งหมด — หน้าจึงอ่านว่า "มี 7 อย่างให้แก้" ทั้งที่แก้ได้จริง 3 อย่าง และค่าที่ตัดสินว่าใบนี้
 * มีค่าแค่ไหน (ยาวแค่ไหน เหลืออีกเท่าไร) ไม่เคยถูกพูดออกมาเลย: 19/08/2026 กับ 18/08/2036
 * เป็นกล่องสองกล่องที่ไม่รู้จักกัน ไม่มีที่ไหนบอกว่า "10 ปี"
 *
 * แผ่นนี้รับส่วนที่แก้ไม่ได้ไปทั้งหมด แล้วเหลือการ์ดข้างล่างไว้เฉพาะช่องที่พิมพ์ได้จริง —
 * ของที่มีขอบคือของที่แก้ได้ ท่าเดียวกับ `SubscriptionDraftPlate` ที่หน้าสร้างสัญญาใช้ (#229)
 * ต่างกันที่ใบนี้ออกไปแล้ว จึงมีสถานะและวันคงเหลือให้บอก ส่วนใบร่างมีแต่สิ่งที่จะเกิดขึ้น
 *
 * ไม่มี `<h1>` ที่นี่: เลขที่ใบกับเจ้าของอยู่บน `PageHeader` แล้ว การพูดซ้ำด้วยขนาดใหญ่กว่าเดิม
 * คือการแข่งกับหัวหน้าเอง บรรทัดใหญ่สุดของแผ่นจึงเป็น "จำนวน" — ค่าที่ใบนี้ให้จริง ๆ
 */
export function IssuedLicensePlate({
  amountLabel, amount, startDate, endDate, noExpiry, status, statusBadge, thresholdDays,
  ownerTypeLabel, owner, cluster,
}: IssuedLicensePlateProps) {
  const { t } = useI18n();
  const now = Date.now();
  const term = noExpiry ? null : contractTerm(startDate, endDate);
  // Date.parse ของ 'YYYY-MM-DD' คือเที่ยงคืน UTC — วันสิ้นสุดคุ้มครองทั้งวัน จึงบวกอีกหนึ่งวัน
  // ให้ตรงกับ `toIsoEndOfDay` ที่ payload ใช้จริง ไม่งั้นใบที่หมดวันนี้จะถูกนับว่าหมดไปแล้ว
  const endMs = noExpiry ? Number.POSITIVE_INFINITY : Date.parse(endDate) + DAY_MS;
  const remaining = remainingOf(status, endMs, Date.parse(startDate), thresholdDays, now, t);

  return (
    <Card aria-label={t('pages.licenses.issuedPlateAria')}>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-md">
            <FileText className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-2xl leading-tight font-semibold tabular-nums tracking-tight">{amount || '—'}</p>
            <p className="text-muted-foreground truncate text-xs">{amountLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
          {remaining && (
            <span className={cn('text-xs whitespace-nowrap', TONE_CLASS[remaining.tone])}>{remaining.text}</span>
          )}
        </div>
      </div>

      {/* รางถูกจำกัดความกว้าง — บนจอกว้างการยืดเต็มการ์ด (~800px) ทำให้มันอ่านเป็นเส้นคั่น
       *  ไม่ใช่ช่วงเวลา และดันความยาวตรงกลางออกห่างจากปลายทั้งสองจนไม่เห็นว่าเกี่ยวกัน */}
      <TermRail
        className="max-w-xl"
        startDate={startDate}
        endDate={noExpiry ? null : endDate}
        label={
          noExpiry
            ? t('common.state.noExpiry')
            : term
              ? termLabel(term, t)
              : t('pages.subscriptions.noPeriodYet')
        }
        labelMuted={!noExpiry && !term}
      />

      <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
        <IdentityRow label={ownerTypeLabel} value={owner.label} id={owner.id} />
        {cluster && <IdentityRow label={t('common.label.cluster')} value={cluster.label} id={cluster.id} />}
      </div>
    </Card>
  );
}
