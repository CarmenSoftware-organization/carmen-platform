import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { seatUtilization } from '../../../utils/capacity';
import { cn } from '../../../lib/utils';
import { AllocationTicks } from '../AllocationTicks';
import { GAUGE_TEXT } from '../../clusterManagement/CapacityGauge';
import { useI18n } from '../../../hooks/useI18n';

interface SeatMeterProps {
  used: number;
  cap: number;
  /** License Center ของ cluster นี้ — ทางออกเดียวเมื่อที่นั่งตึง */
  licensesTo: string;
}

/**
 * เพดานที่นั่งของทั้ง cluster — ตัวเลขที่มีผลมากที่สุดบนหน้านี้ เพราะเกินแล้ว
 * เขียนอะไรไม่ได้ทั้ง cluster และ cluster admin คือคนเดียวที่แก้ได้ จึงอยู่บนแผ่นป้าย
 * ด้านบนสุด เห็นจากทุก tab ไม่ใช่รอให้เลื่อนไปเจอ
 *
 * สัดส่วนและเกณฑ์ทั้งหมดมาจาก seatUtilization() — ห้ามคำนวณเอง มันถือกฎ warn ที่ 90%
 * และกฎ "cap = 0 คือศูนย์ที่นั่ง ไม่ใช่ไม่จำกัด" ไว้ให้แล้ว
 *
 * ที่นี่ไม่พูดถึงใบอนุญาตของ BU นี้เลยโดยตั้งใจ — "15 licensed" คือเพดานของทั้ง cluster
 * ส่วนใบที่ BU นี้ซื้อเป็นคนละ pool การวางสองตัวเลขไว้ในบล็อกเดียวทำให้คำว่า licensed
 * มีสองความหมายพร้อมกัน ตัวเลขของ BU อยู่ที่ BusinessUnitLicensesCard ใน tab People แล้ว
 *
 * แถบเป็นของแถม ตัวเลขเป็นตัวหลัก: AllocationTicks เป็น role="img" มี label ของตัวเอง
 * ส่วนบรรทัดตัวเลขเป็น role="status" คนที่อ่านด้วย screen reader จึงได้ข้อมูลเท่ากันทุกอย่าง
 */
export function SeatMeter({ used, cap, licensesTo }: SeatMeterProps) {
  const { t } = useI18n();
  const u = seatUtilization(used, cap);
  const overBy = Math.max(0, u.used - u.cap);
  const seatsLeft = Math.max(0, u.cap - u.used);
  const pressured = u.level === 'warn' || u.level === 'over';

  // สิ่งที่ cluster admin ต้องทำต่อในแต่ละสถานะ ไม่ใช่คำบรรยายว่าแถบยาวเท่าไร —
  // ตัวเลขข้างบนบอกไปแล้ว บรรทัดนี้จึงเป็นของ "แล้วยังไงต่อ" อย่างเดียว
  const note =
    overBy > 0
      ? t(overBy === 1 ? 'pages.clusterAdmin.overBySeatsOne' : 'pages.clusterAdmin.overBySeatsMany', { overBy })
      : u.level === 'over'
        ? t('pages.clusterAdmin.atCapacityDeactivateUser')
        : seatsLeft === 0
          ? t('pages.clusterAdmin.noSeatsOpen')
          : u.level === 'warn'
            ? // 90% ขึ้นไปแต่ยังไม่เต็ม — เตือนล่วงหน้าเพื่อให้ซื้อที่นั่งเพิ่มทันก่อนจะเขียนอะไร
              // ไม่ได้ทั้ง cluster ลิงก์ View licenses ด้านล่างขึ้นเองแล้วเพราะ pressured เป็นจริง
              t(seatsLeft === 1 ? 'pages.clusterAdmin.nearingCapacitySeatOne' : 'pages.clusterAdmin.nearingCapacitySeatMany', { seatsLeft })
            : t(seatsLeft === 1 ? 'pages.clusterAdmin.seatsOpenOne' : 'pages.clusterAdmin.seatsOpenMany', { seatsLeft });

  return (
    <div className="sm:min-w-56">
      <div className="text-muted-foreground text-[11px] font-bold tracking-[0.13em] uppercase">
        {t('pages.clusterAdmin.clusterSeatsHeading')}
      </div>

      <div className="mt-1.5 flex items-baseline gap-1.5 font-mono tabular-nums">
        <span className={cn('text-2xl font-semibold', pressured ? GAUGE_TEXT[u.level] : 'text-foreground')}>
          {u.used.toLocaleString()}
        </span>
        <span className="text-muted-foreground text-sm">
          {t('pages.clusterAdmin.capLicensedSuffix', { cap: u.cap.toLocaleString() })}
        </span>
      </div>

      <AllocationTicks
        className="mt-2.5"
        used={u.used}
        cap={u.cap}
        level={u.level}
        label={t('pages.clusterAdmin.clusterSeatsAriaLabel', { used: u.used, cap: u.cap })}
      />

      <p className={cn('mt-2 text-xs', pressured ? GAUGE_TEXT[u.level] : 'text-muted-foreground')} role="status">
        {note}
      </p>

      {pressured && (
        <Link
          to={licensesTo}
          className="text-primary mt-1.5 inline-flex items-center gap-1 text-xs font-medium hover:underline"
        >
          {t('pages.clusterAdmin.viewLicenses')}
          <ArrowRight className="size-3" />
        </Link>
      )}
    </div>
  );
}
