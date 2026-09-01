import { FileText } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { Card } from '../../../components/ui/card';
import { cn } from '../../../lib/utils';
import { useI18n } from '../../../hooks/useI18n';
import type { TFunction, TKey } from '../../../i18n/types';
import type { SubscriptionState, SubscriptionStatus } from '../../../types';
import { IdentityRow, TermRail } from '../plate/plateParts';
import { termLabel } from '../subscriptionCreate/SubscriptionDraftPlate';
import { contractTerm } from '../subscriptionCreate/subscriptionTerm';

const DAY_MS = 86_400_000;

interface Remaining {
  text: string;
  tone: 'muted' | 'warning' | 'destructive';
}

const TONE_CLASS: Record<Remaining['tone'], string> = {
  muted: 'text-muted-foreground',
  warning: 'text-warning',
  destructive: 'text-destructive',
};

/**
 * "เหลืออีก N วัน" / "หมดอายุมาแล้ว N วัน" — คำตอบของคำถามแรกที่คนเปิดหน้านี้ถาม ซึ่งกล่องวันที่
 * สองกล่องไม่เคยตอบ
 *
 * นับจาก `state` ที่ backend คำนวณมา ไม่ใช่จาก `status` ดิบ: ใบที่ status ยัง 'active' แต่เลย
 * วันหมดอายุแล้วต้องอ่านว่าหมดอายุ ไม่ใช่ "เหลืออีก -12 วัน" — และห้ามคำนวณสถานะเองฝั่ง frontend
 * (`src/utils/subscriptionState.ts` อธิบายข้อห้ามนี้ไว้)
 *
 * ต่างจากใบอนุญาต (`IssuedLicensePlate`) ตรงที่ไม่บวก 1 วัน: payload ของสัญญาเขียน end_date เป็น
 * `T00:00:00.000Z` (ดู `fromYmd` ใน `SubscriptionForm`) ไม่ใช่สิ้นวันแบบ `toIsoEndOfDay` ของใบอนุญาต
 * จุดอ้างอิงจึงต้องเป็นเที่ยงคืนของวันนั้นตรง ๆ เพื่อให้ตรงกับ `isExpiringSoon` ที่ตารางใช้
 *
 * 'inactive' ไม่คืนอะไรเลย — "เหลืออีก 3,640 วัน" บนสัญญาที่ถูกปิดใช้งานคือคำโกหกที่อ่านเหมือน
 * ความจริง ป้ายสถานะข้าง ๆ พูดเรื่องนี้จบไปแล้ว
 */
function remainingOf(
  state: SubscriptionState,
  endDate: string,
  thresholdDays: number,
  now: number,
  t: TFunction,
): Remaining | null {
  if (state === 'inactive') return null;
  const endMs = Date.parse(endDate);
  if (!Number.isFinite(endMs)) return null;
  if (state === 'expired') {
    return {
      text: t('pages.licenses.expiredDaysAgo', { count: Math.ceil((now - endMs) / DAY_MS) }),
      tone: 'destructive',
    };
  }
  const days = Math.ceil((endMs - now) / DAY_MS);
  return { text: t('common.state.daysLeft', { count: days }), tone: days <= thresholdDays ? 'warning' : 'muted' };
}

export interface IssuedSubscriptionPlateProps {
  /** ค่าดิบจากฟอร์ม — แผ่นสะท้อนสิ่งที่กำลังจะบันทึก ไม่ใช่สิ่งที่บันทึกไว้แล้ว */
  startDate: string;
  endDate: string;
  /** สถานะที่แก้ได้ในฟอร์ม (ค่าใน DB) */
  status: SubscriptionStatus;
  /** สถานะที่มีผลจริง คำนวณโดย backend จาก status + end_date — ห้ามคำนวณเองฝั่งนี้ */
  state?: SubscriptionState;
  /** เกณฑ์ "ใกล้หมดอายุ" เป็นวัน จาก `thresholds.subscription_days` */
  thresholdDays: number;
  /** BU เดียวของสัญญา — `null` เฉพาะข้อมูลผิดรูปจากยุคก่อน migration */
  bu: { id: string; code: string; name: string } | null;
  cluster: { id: string; code: string; name: string };
}

/**
 * สัญญาที่ออกไปแล้ว วาดเป็นสิ่งที่มันเป็น
 *
 * หน้าแก้ไขสัญญาเคยเป็นตาราง 6 ช่องที่มี 3 ช่องแก้ไม่ได้ (คลัสเตอร์ · หน่วยธุรกิจ · เลขที่สัญญา)
 * แต่ถูกวาดเป็นกล่องมีขอบเหมือนช่องกรอกทุกประการ — หน้าจึงอ่านว่า "มี 6 อย่างให้แก้" ทั้งที่แก้ได้
 * จริง 3 อย่าง และค่าที่ตัดสินว่าสัญญานี้มีค่าแค่ไหน (ยาวแค่ไหน เหลืออีกเท่าไร) ไม่เคยถูกพูดออกมา:
 * 18/08/2026 กับ 18/08/2036 เป็นกล่องสองกล่องที่ไม่รู้จักกัน ไม่มีที่ไหนบอกว่า "10 ปี"
 *
 * แผ่นนี้รับส่วนที่แก้ไม่ได้ไปทั้งหมด เหลือการ์ดข้างล่างไว้เฉพาะช่องที่พิมพ์ได้จริง — ของที่มีขอบ
 * คือของที่แก้ได้ ท่าเดียวกับ `IssuedLicensePlate` (#230) และ `SubscriptionDraftPlate` (#229)
 *
 * ไม่มี `<h1>` ที่นี่: เลขที่สัญญากับคลัสเตอร์อยู่บน `PageHeader` แล้ว บรรทัดใหญ่สุดของแผ่นจึงเป็น
 * หน่วยธุรกิจ — ตัวตนที่สัญญาใบนี้ออกให้ และเป็นบรรทัดใหญ่สุดของใบร่างด้วย สร้างกับแก้จึงอ่าน
 * เป็นวัตถุเดียวกันก่อนและหลังออกเลข
 */
export function IssuedSubscriptionPlate({
  startDate, endDate, status, state, thresholdDays, bu, cluster,
}: IssuedSubscriptionPlateProps) {
  const { t } = useI18n();
  const term = contractTerm(startDate, endDate);
  const remaining = state ? remainingOf(state, endDate, thresholdDays, Date.now(), t) : null;
  // ทั้งสองค่ามาจาก union สามสมาชิกชุดเดียวกัน จึงผ่าน lookup เดียวกัน — สองสถานะที่หมายถึงสิ่ง
  // เดียวกันจะเรียกชื่อต่างกันในภาษาไทยไม่ได้
  const statusLabel = (s: string) => t(`common.status.${s}` as TKey) || s;

  return (
    <Card aria-label={t('pages.subscriptions.issuedPlateAria')}>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-md">
            <FileText className="size-5" />
          </div>
          <div className="min-w-0">
            <p
              className={cn(
                'truncate text-xl leading-tight font-semibold tracking-tight',
                !bu && 'text-muted-foreground',
              )}
            >
              {bu ? bu.name : t('pages.subscriptions.noBusinessUnitOnRecord')}
            </p>
            <p className="text-muted-foreground truncate text-xs">{t('entity.businessUnit.title')}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={status === 'active' ? 'success' : 'secondary'}>{statusLabel(status)}</Badge>
          {/* พูดเรื่อง "สถานะที่มีผลจริง" เฉพาะตอนที่มันไม่ตรงกับค่าใน DB — หน้าเดิมวางป้ายสอง
           *  ป้ายที่เขียนว่า Active เหมือนกันซ้อนกัน ซึ่งเป็นคำเตือนที่ไม่เคยเตือนอะไร */}
          {state && state !== status && (
            <span className="text-muted-foreground text-xs whitespace-nowrap">
              {t('pages.subscriptions.effectiveState')}{' '}
              <span className="text-foreground">{statusLabel(state)}</span>
            </span>
          )}
          {remaining && (
            <span className={cn('text-xs whitespace-nowrap', TONE_CLASS[remaining.tone])}>{remaining.text}</span>
          )}
        </div>
      </div>

      <TermRail
        className="max-w-xl"
        startDate={startDate}
        endDate={endDate}
        label={term ? termLabel(term, t) : t('pages.subscriptions.noPeriodYet')}
        labelMuted={!term}
      />

      <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
        {bu && (
          <IdentityRow label={t('entity.businessUnit.title')} value={`${bu.code} - ${bu.name}`} id={bu.id} />
        )}
        <IdentityRow label={t('common.label.cluster')} value={`${cluster.code} - ${cluster.name}`} id={cluster.id} />
      </div>
    </Card>
  );
}
