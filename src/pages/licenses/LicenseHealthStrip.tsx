import { AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useI18n } from '../../hooks/useI18n';
import type { TKey } from '../../i18n/types';

export type LicenseTabId = 'quota' | 'seats' | 'subscriptions';

export interface LicenseHealthFacts {
  quota: {
    /** โควตา BU ของใบที่ชนะ — `null` = ไม่มีใบคุ้มครอง (โหลดไม่ได้ดูที่ `unavailable` แยก) */
    cap: number | null;
    used: number;
    /** เหลืออีกกี่วันใบโควตาจะหมด — `null` = ไม่มีใบ ใบเป็น perpetual หรือยังไม่ใกล้หมด */
    endsInDays: number | null;
    unavailable: boolean;
  };
  seats: { total: number; busWithoutSeats: number; unavailable: boolean };
  subscriptions: { total: number; expired: number; expiringSoon: number; unavailable: boolean };
}

interface HealthAlert {
  key: string;
  labelKey: TKey;
  count: number;
  tab: LicenseTabId;
  tone: 'destructive' | 'warning';
}

export interface LicenseHealthStripProps {
  facts: LicenseHealthFacts;
  loading: boolean;
  onJump: (tab: LicenseTabId) => void;
}

/**
 * บรรทัดเดียวใต้หัวหน้า — ตอบคำถามที่คนเปิดหน้านี้มาถามจริง ๆ ("มีอะไรกำลังจะพัง") ก่อนที่เขาจะ
 * ต้องเลื่อนอ่านทั้งสามชั้น
 *
 * เหตุผลที่มันเป็น **บรรทัด** ไม่ใช่การ์ดนับแบบหน้า `/licenses`: หน้ารายการมีหลาย cluster ให้เทียบกัน
 * การ์ดจึงคุ้มพื้นที่ ส่วนหน้านี้มี cluster เดียว ตัวเลขไม่ต้องเทียบกับอะไร — มันต้องหลีกทางให้บัญชีใบ
 * ซึ่งเป็นเนื้อหาจริงของหน้า
 *
 * ป้ายเตือนคลิกได้และพาไปยังแท็บที่แก้เรื่องนั้นได้ — ป้ายเตือนที่คลิกไม่ได้บังคับให้ผู้ใช้แปล
 * "1 หมดอายุ" กลับเป็น "อยู่แท็บไหน" เอง ซึ่งเป็นงานที่หน้าจอควรทำให้
 *
 * `unavailable` ของแต่ละชั้นแยกจาก "ศูนย์" เสมอ (เหตุผลเดียวกับ `useLicenseLedger.loadFailed`):
 * ชั้นที่โหลดไม่ได้จะ **ไม่** ถูกนับเป็น 0 และ **ไม่** สร้างป้ายเตือน — จะขึ้นหมายเหตุว่าตัวเลข
 * บางส่วนอ่านไม่ได้แทน การนับข้อมูลที่ไม่มีว่าเป็นศูนย์คือการรายงานว่า "ไม่มีปัญหา" ทั้งที่ไม่รู้
 */
export function LicenseHealthStrip({ facts, loading, onJump }: LicenseHealthStripProps) {
  const { t } = useI18n();
  const { quota, seats, subscriptions } = facts;

  // เรียงตามความรุนแรง: พังแล้ว → กำลังจะพัง — ป้ายซ้ายสุดคือป้ายที่ต้องลงมือก่อน
  const alerts: HealthAlert[] = [];
  if (!subscriptions.unavailable && subscriptions.expired > 0) {
    alerts.push({ key: 'subExpired', labelKey: 'pages.licenses.healthExpiredContracts', count: subscriptions.expired, tab: 'subscriptions', tone: 'destructive' });
  }
  if (!quota.unavailable && quota.cap !== null && quota.used > quota.cap) {
    alerts.push({ key: 'overQuota', labelKey: 'pages.licenses.healthOverQuota', count: quota.used - quota.cap, tab: 'quota', tone: 'destructive' });
  }
  if (!subscriptions.unavailable && subscriptions.expiringSoon > 0) {
    alerts.push({ key: 'subSoon', labelKey: 'pages.licenses.healthExpiringContracts', count: subscriptions.expiringSoon, tab: 'subscriptions', tone: 'warning' });
  }
  if (!quota.unavailable && quota.endsInDays !== null) {
    alerts.push({ key: 'quotaSoon', labelKey: 'pages.licenses.healthQuotaEndsIn', count: quota.endsInDays, tab: 'quota', tone: 'warning' });
  }
  if (!seats.unavailable && seats.busWithoutSeats > 0) {
    alerts.push({ key: 'noSeats', labelKey: 'pages.licenses.healthBuWithoutSeats', count: seats.busWithoutSeats, tab: 'seats', tone: 'warning' });
  }

  const anyUnavailable = quota.unavailable || seats.unavailable || subscriptions.unavailable;

  return (
    <div className="bg-card flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border px-3 py-2 text-sm">
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
        <Fact
          onClick={() => onJump('quota')}
          text={quota.unavailable
            ? t('pages.licenses.healthUnavailableShort')
            : quota.cap === null
              ? t('pages.licenses.healthBuNoQuota')
              : t('pages.licenses.healthBuUsage', { used: quota.used, cap: quota.cap })}
        />
        <Dot />
        <Fact
          onClick={() => onJump('seats')}
          text={seats.unavailable
            ? t('pages.licenses.healthUnavailableShort')
            : t('pages.licenses.healthSeatsCount', { count: seats.total })}
        />
        <Dot />
        <Fact
          onClick={() => onJump('subscriptions')}
          text={subscriptions.unavailable
            ? t('pages.licenses.healthUnavailableShort')
            : t('pages.licenses.healthContractsCount', { count: subscriptions.total })}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
        {loading ? (
          <span className="text-muted-foreground text-xs">{t('common.busy.loadingEllipsis')}</span>
        ) : (
          <>
            {alerts.length === 0 && !anyUnavailable && (
              <span className="text-muted-foreground text-xs">{t('pages.licenses.healthAllClear')}</span>
            )}
            {alerts.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={() => onJump(a.tab)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors',
                  a.tone === 'destructive'
                    ? 'border-destructive/30 text-destructive hover:bg-destructive/10'
                    : 'border-warning/40 bg-warning/10 text-warning hover:bg-warning/20',
                )}
              >
                <AlertTriangle className="h-3 w-3 shrink-0" />
                {t(a.labelKey, { count: a.count })}
              </button>
            ))}
            {anyUnavailable && (
              <span className="text-muted-foreground text-xs">{t('pages.licenses.healthSomeUnavailable')}</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** ตัวเลขข้อเท็จจริง — คลิกได้เพื่อไปยังแท็บของมัน แต่ไม่ทำตัวเป็นปุ่มทางสายตา (มันไม่ใช่คำเตือน) */
function Fact({ text, onClick }: { text: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="hover:text-foreground tabular-nums transition-colors">
      {text}
    </button>
  );
}

const Dot = () => <span aria-hidden className="text-muted-foreground/40">·</span>;
