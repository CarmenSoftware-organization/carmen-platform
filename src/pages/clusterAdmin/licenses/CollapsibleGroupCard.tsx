import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Card } from '../../../components/ui/card';
import { cn } from '../../../lib/utils';

interface CollapsibleGroupCardProps {
  label: string;
  /** ค่าที่บอกได้ว่าข้างในมีอะไร โดยไม่ต้องกางออก */
  summary: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

/**
 * การ์ดที่ยุบไว้ ใช้ป้ายหัวกลุ่มแบบเดียวกับส่วนที่เหลือของเชลล์ cluster-admin
 * (`businessUnitEdit/shared` → `Group`) ไม่ใช่ CardTitle + CardDescription แบบ
 * `CollapsibleSection` ของหน้า platform — สองแบบบนจอเดียวอ่านเหมือนคนละแอป
 *
 * `summary` ไม่ใช่ของประดับ: หัวข้อเปล่า ๆ บังคับให้กางทุกใบเพื่อรู้ว่าข้างในว่างหรือมีของ
 */
export function CollapsibleGroupCard({ label, summary, defaultOpen = false, children }: CollapsibleGroupCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <Card className="p-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((o) => !o)}
        className="focus-visible:ring-ring flex w-full items-center gap-3 rounded-md p-4 text-left focus-visible:ring-1 focus-visible:outline-hidden sm:px-6 sm:py-5"
      >
        <span className="text-muted-foreground shrink-0 text-[11px] font-bold tracking-[0.13em] uppercase">
          {label}
        </span>
        <span className="text-muted-foreground min-w-0 flex-1 truncate text-sm">{summary}</span>
        <ChevronDown
          className={cn('text-muted-foreground size-4 shrink-0 transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div id={contentId} className="border-t p-4 sm:px-6 sm:py-5">
          {children}
        </div>
      )}
    </Card>
  );
}
