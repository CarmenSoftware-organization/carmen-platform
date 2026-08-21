import type { ReactNode } from 'react';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { Loader2 } from 'lucide-react';
import { fmtDate } from './licenseDates';

/**
 * แถวกรอกของ "ใบ" หนึ่งใบ — ใช้ร่วมทั้งใบที่นั่งและใบโควตา BU
 *
 * ฟิลด์จำนวนชื่อกลาง ๆ ว่า `amount` เพราะสองชนิดเรียกคนละอย่างบนสาย (`licensed_users`
 * กับ `licensed_bus`) ผู้เรียกเป็นคนแปลงกลับเป็นชื่อจริงตอนประกอบ payload
 */
export interface LicenseDraft {
  amount: string;
  start_date: string; // yyyy-mm-dd — ค่าดิบของ <input type="date">
  end_date: string;
  reference_no: string;
  note: string;
}

export const emptyDraft = (now: Date): LicenseDraft => ({
  amount: '',
  start_date: fmtDate(now.toISOString()),
  end_date: '',
  reference_no: '',
  note: '',
});

export const draftFromLicense = (l: {
  amount: number;
  start_date: string;
  end_date: string;
  reference_no?: string | null;
  note?: string | null;
}): LicenseDraft => ({
  amount: String(l.amount),
  start_date: fmtDate(l.start_date),
  end_date: fmtDate(l.end_date),
  reference_no: l.reference_no || '',
  note: l.note || '',
});

/** ใบกรอกครบพอที่จะบันทึกไหม — ใบไม่มีวันหมดอายุไม่ต้องมี end_date */
export const canSubmitDraft = (d: LicenseDraft, noExpiry = false): boolean =>
  d.amount !== '' && Number(d.amount) > 0 && !!d.start_date && (noExpiry || !!d.end_date);

interface LicenseDraftFormProps {
  draft: LicenseDraft;
  onChange: (next: LicenseDraft) => void;
  /** ป้ายของช่องจำนวน — `"Seats"` (SeatSection) หรือ `"Quota"` (BuQuotaSection) */
  amountLabel: string;
  /** แสดงสวิตช์ "ไม่มีวันหมดอายุ" ไหม — มีเฉพาะใบโควตา BU */
  showNoExpiry?: boolean;
  noExpiry?: boolean;
  onNoExpiryChange?: (v: boolean) => void;
  /** แสดงช่อง note ไหม — ใบที่นั่งวันนี้ไม่มีช่องนี้ */
  showNote?: boolean;
  /**
   * เซลล์คอลัมน์ Status — แถวสร้างใหม่ส่งข้อความ "New" ส่วนแถวแก้ใบเดิมส่ง <Badge> สถานะจริงของใบนั้น
   * ใบที่ active อยู่ต้องไม่กลายเป็น "New" ระหว่างผู้ใช้กรอก
   */
  statusCell: ReactNode;
  saving: boolean;
  submitLabel: string;
  onSubmit: () => void;
  onCancel: () => void;
}

/**
 * คืนเป็น <td> หลายอันเพื่อวางในแถวตารางของผู้เรียก — ไม่ห่อ <tr> เอง เพราะสองการ์ดมี
 * จำนวนคอลัมน์ไม่เท่ากัน (ใบโควตา BU มีคอลัมน์ note เพิ่ม)
 */
export function LicenseDraftForm({
  draft, onChange, amountLabel, showNoExpiry = false, noExpiry = false,
  onNoExpiryChange, showNote = false, statusCell, saving, submitLabel, onSubmit, onCancel,
}: LicenseDraftFormProps) {
  const set = (patch: Partial<LicenseDraft>) => onChange({ ...draft, ...patch });

  return (
    <>
      <td className="px-2 py-1">
        <Input
          type="number"
          min={1}
          value={draft.amount}
          onChange={(e) => set({ amount: e.target.value })}
          aria-label={amountLabel}
          className="h-8 w-20"
        />
      </td>
      <td className="px-2 py-1">
        <Input
          type="date"
          value={draft.start_date}
          onChange={(e) => set({ start_date: e.target.value })}
          aria-label="Start date"
          className="h-8"
        />
      </td>
      <td className="px-2 py-1">
        {showNoExpiry && (
          <label className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
            <input
              type="checkbox"
              checked={noExpiry}
              onChange={(e) => onNoExpiryChange?.(e.target.checked)}
              aria-label="No expiry"
              className="h-4 w-4 rounded border-input"
            />
            No expiry
          </label>
        )}
        {!noExpiry && (
          <Input
            type="date"
            value={draft.end_date}
            onChange={(e) => set({ end_date: e.target.value })}
            aria-label="End date"
            className="h-8"
          />
        )}
      </td>
      <td className="px-2 py-1">{statusCell}</td>
      <td className="px-2 py-1">
        <Input
          value={draft.reference_no}
          onChange={(e) => set({ reference_no: e.target.value })}
          aria-label="Reference"
          className="h-8"
        />
      </td>
      {showNote && (
        <td className="px-2 py-1">
          <Input
            value={draft.note}
            onChange={(e) => set({ note: e.target.value })}
            aria-label="Note"
            className="h-8"
          />
        </td>
      )}
      <td className="px-2 py-1 text-right whitespace-nowrap">
        <Button size="sm" onClick={onSubmit} disabled={saving || !canSubmitDraft(draft, noExpiry)}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {saving ? 'Saving...' : submitLabel}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>Cancel</Button>
      </td>
    </>
  );
}
