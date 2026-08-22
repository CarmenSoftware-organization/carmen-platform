import type { ColumnDef } from '@tanstack/react-table';
import { AuditMeta } from './AuditMeta';
import { normalizeAudit } from '../utils/audit';

interface AuditColumnsOptions {
  /** ซ่อนคอลัมน์ Updated บนการ์ดมือถือ (ต่ำกว่า lg) — การ์ดแคบ ใส่ครบสองอันแล้วเบียด */
  hideUpdatedOnCard?: boolean;
  /** ส่งเข้ามาเพื่อให้ผลลัพธ์คงที่ตอนทดสอบ */
  now?: Date;
}

/**
 * คืนคอลัมน์ Created / Updated สำเร็จรูปให้ spread เข้า `columns` array ของหน้า
 *
 * ใช้แทนการเขียน `fmt()` เองในแต่ละหน้า ซึ่งเดิมคัดลอกกันอยู่ 7 ชุดและไม่ตรงกัน
 * เรียก `normalizeAudit` ต่อแถวเพื่อให้รับได้ทั้ง response แบบ nested และแบบแบน
 *
 * ตัวอย่าง:
 * ```ts
 * const columns = useMemo<ColumnDef<Cluster, unknown>[]>(() => [
 *   ...myColumns,
 *   ...auditColumns<Cluster>({ hideUpdatedOnCard: true }),
 * ], []);
 * ```
 */
export function auditColumns<T>(opts: AuditColumnsOptions = {}): ColumnDef<T, unknown>[] {
  const { hideUpdatedOnCard = false, now } = opts;
  return [
    {
      id: 'created_at',
      accessorKey: 'created_at',
      header: 'Created',
      cell: ({ row }) => (
        <AuditMeta variant="cell" actor={normalizeAudit(row.original).created} now={now} />
      ),
    },
    {
      id: 'updated_at',
      accessorKey: 'updated_at',
      header: 'Updated',
      ...(hideUpdatedOnCard ? { meta: { card: 'hidden' } } : {}),
      cell: ({ row }) => (
        <AuditMeta variant="cell" actor={normalizeAudit(row.original).updated} now={now} />
      ),
    },
  ];
}
