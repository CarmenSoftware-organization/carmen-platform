import { seatUtilization } from '../../../utils/capacity';
import { cn } from '../../../lib/utils';

interface SeatMeterProps {
  used: number;
  cap: number;
  /** ที่นั่งที่ซื้อไว้ = ผลรวมใบ license ที่ยังคุ้มครองอยู่ */
  licensed?: number;
}

const BAR_BY_LEVEL: Record<string, string> = {
  ok: 'bg-primary',
  warn: 'bg-warning',
  over: 'bg-destructive',
};

/**
 * เพดานที่นั่งของทั้ง cluster — ตัวเลขที่มีผลมากที่สุดบนหน้านี้ เพราะเกินแล้ว
 * เขียนอะไรไม่ได้ทั้ง cluster และ cluster admin คือคนเดียวที่แก้ได้
 *
 * สัดส่วนและเกณฑ์ทั้งหมดมาจาก seatUtilization() — ห้ามคำนวณเอง มันถือกฎ warn ที่ 90%
 * และกฎ "cap = 0 คือศูนย์ที่นั่ง ไม่ใช่ไม่จำกัด" ไว้ให้แล้ว
 *
 * แถบเป็นของแถม ตัวเลขเป็นตัวหลัก: แถบ aria-hidden, บรรทัดตัวเลข role="status"
 * คนที่อ่านด้วย screen reader จึงได้ข้อมูลเท่ากันทุกอย่าง
 */
export function SeatMeter({ used, cap, licensed }: SeatMeterProps) {
  const u = seatUtilization(used, cap);
  const overBy = Math.max(0, u.used - u.cap);
  const seatsLeft = Math.max(0, u.cap - u.used);
  // ส่วนที่ล้นวาดต่อท้ายโดยมีเส้นคั่น ไม่ใช่แถบเต็มสีแดง — ต้องเห็นว่าล้น *เท่าไร*
  const fillPct = u.cap === 0 ? 0 : Math.min(100, (Math.min(u.used, u.cap) / u.cap) * 100);
  const overPct = u.cap === 0 ? 0 : Math.min(40, (overBy / u.cap) * 100);

  return (
    <div className="space-y-1.5">
      <div className="bg-muted flex h-2 w-full overflow-hidden rounded-full" aria-hidden="true">
        <div className={cn('h-full', BAR_BY_LEVEL[u.level] ?? 'bg-primary')} style={{ width: `${fillPct}%` }} />
        {overBy > 0 && (
          <div className="bg-destructive border-background h-full border-l-2" style={{ width: `${overPct}%` }} />
        )}
      </div>
      <p
        className={cn('text-sm', u.level === 'over' ? 'text-destructive' : u.level === 'warn' ? 'text-warning' : '')}
        role="status"
      >
        <span className="font-semibold tabular-nums">{u.used} / {u.cap}</span> seats
      </p>
      <p className={cn('text-xs', u.level === 'over' ? 'text-destructive' : 'text-muted-foreground')}>
        {overBy > 0
          ? `over by ${overBy} — deactivate ${overBy} ${overBy === 1 ? 'user' : 'users'} to save`
          : u.level === 'over'
            ? 'at capacity — deactivate a user before adding another'
            : u.level === 'warn'
              ? `nearing capacity — ${seatsLeft} ${seatsLeft === 1 ? 'seat' : 'seats'} left`
              : `${licensed != null ? `licensed ${licensed} · ` : ''}used ${u.used} · cluster cap ${u.cap}`}
      </p>
    </div>
  );
}
