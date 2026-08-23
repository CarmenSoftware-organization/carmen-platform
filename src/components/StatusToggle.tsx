import { badgeVariants } from './ui/badge';

export interface StatusToggleProps {
  on: boolean;
  onLabel: string;
  offLabel: string;
  variant: 'success' | 'default';
  disabled: boolean;
  onClick: () => void;
}

/**
 * สถานะที่สลับได้ด้วยการคลิกป้ายเอง ไม่ต้องเข้าโหมดแก้
 *
 * ป้ายที่อ่านกับตัวคุมที่กดเป็นชิ้นเดียวกัน — แผ่นป้ายของเอกสารจึงไม่ต้องมีทั้ง badge ไว้ดู
 * และแถวฟอร์มไว้แก้ ซึ่งเป็นความซ้ำที่ทำให้หน้ายาวขึ้นโดยไม่ได้ข้อมูลเพิ่ม
 * ใช้ร่วมกันระหว่างแผ่นป้าย BU ของ cluster admin กับแผ่นป้าย cluster ของฝั่ง platform
 */
export function StatusToggle({ on, onLabel, offLabel, variant, disabled, onClick }: StatusToggleProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={on}
      onClick={onClick}
      className="focus-visible:ring-ring relative -my-2 rounded-full py-2 before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2 before:content-[''] focus-visible:ring-1 focus-visible:outline-hidden"
    >
      {/* <span>, not <Badge> (a <div>) — a <button> may only contain phrasing content. */}
      <span className={badgeVariants({ variant: on ? variant : 'secondary' })}>
        {on ? onLabel : offLabel}
      </span>
    </button>
  );
}
