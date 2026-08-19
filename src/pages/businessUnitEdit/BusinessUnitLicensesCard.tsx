import { useState } from 'react';
import { Plus, Loader2, Ticket } from 'lucide-react';
import { Card, CardHeader, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { EmptyState } from '../../components/EmptyState';
import { TableSkeleton } from '../../components/TableSkeleton';
import Can from '../../components/Can';
import { sumActiveLicenses, licenseStatus, isExpiringSoon, isMigratedPlaceholder } from '../../utils/buLicense';
import type { BusinessUnitLicense, BuLicenseStatus } from '../../types';

interface BusinessUnitLicensesCardProps {
  licenses: BusinessUnitLicense[];
  loading: boolean;
  saving: boolean;
  /** pool ระดับ cluster ไม่ใช่ของ BU นี้ — การ์ดต้องพูดให้ชัดว่าเป็นของทั้ง cluster */
  clusterSeat?: { used: number; cap: number };
  onCreate: (data: Omit<BusinessUnitLicense, 'id' | 'business_unit_id' | 'doc_version'>) => void;
  onUpdate: (id: string, data: Partial<BusinessUnitLicense> & { doc_version: number }) => void;
  onRemove: (id: string) => void;
  /** ฉีดเวลาให้เทสต์เท่านั้น — production ไม่ส่ง */
  now?: Date;
}

const STATUS_BADGE: Record<BuLicenseStatus, { variant: 'success' | 'secondary' | 'destructive'; label: string }> = {
  active: { variant: 'success', label: 'ใช้งาน' },
  scheduled: { variant: 'secondary', label: 'ยังไม่เริ่ม' },
  expired: { variant: 'destructive', label: 'หมดอายุ' },
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** ตามแบบ inline formatter ของ repo (ดูหมวด DateTime ใน CLAUDE.md) — วันที่ท้องถิ่นล้วน (yyyy-mm-dd)
 *  ค่านี้ใช้ได้ทั้งแสดงผลอ่านอย่างเดียวและเป็นค่าเริ่มต้นของ <Input type="date"> ตอนแก้ไข */
const fmtDate = (v?: string): string => {
  if (!v) return '-';
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const daysLeft = (end: string, now: Date): number =>
  Math.ceil((new Date(end).getTime() - now.getTime()) / DAY_MS);

interface LicenseDraft {
  licensed_users: string;
  start_date: string; // yyyy-mm-dd — ค่าดิบของ <input type="date">
  end_date: string;
  reference_no: string;
}

const emptyDraft = (now: Date): LicenseDraft => ({
  licensed_users: '',
  start_date: fmtDate(now.toISOString()),
  end_date: '',
  reference_no: '',
});

const draftFromLicense = (l: BusinessUnitLicense): LicenseDraft => ({
  licensed_users: String(l.licensed_users),
  start_date: fmtDate(l.start_date),
  end_date: fmtDate(l.end_date),
  reference_no: l.reference_no || '',
});

// วันที่จาก <input type="date"> (yyyy-mm-dd) แปลงเป็น ISO 8601 พร้อม Z — backend รับ-ส่ง UTC เท่านั้น
//
// ขอบเขตเป็น "ทั้งวันตามเวลาผู้ใช้": วันเริ่มนับจากต้นวัน วันหมดอายุคุ้มครองจนสิ้นวัน
// ใบที่กรอกว่าหมด 31 ธ.ค. จึงยังคุ้มครองถึง 23:59:59.999 ของวันนั้นตามเวลาเครื่องผู้ใช้
// ไม่ใช่ตายตั้งแต่ 07:00 เช้าแบบที่ `new Date('2026-12-31')` ให้ (JS ตีความสตริง yyyy-mm-dd
// ล้วนเป็นเที่ยงคืน **UTC** ตามสเปก ต่างจากสตริงที่มีเวลาซึ่งตีความเป็นเวลาท้องถิ่น)
// จึงต้องแยกส่วนประกอบเองแล้วสร้างผ่าน `new Date(y, m, d, ...)` ซึ่งเป็นเวลาท้องถิ่นเสมอ
//
// ผลพลอยได้: ใบที่เริ่มและหมดวันเดียวกันบันทึกได้แล้ว เดิมทั้งสองค่าเท่ากันเป๊ะจึงชน
// CHECK constraint `end_date > start_date` ของ DB
const localIso = (dateStr: string, h: number, m: number, s: number, ms: number): string => {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(y, mo - 1, d, h, m, s, ms).toISOString();
};
const toIsoStartOfDay = (dateStr: string): string => localIso(dateStr, 0, 0, 0, 0);
const toIsoEndOfDay = (dateStr: string): string => localIso(dateStr, 23, 59, 59, 999);

const canSubmitDraft = (d: LicenseDraft): boolean =>
  d.licensed_users !== '' && Number(d.licensed_users) > 0 && !!d.start_date && !!d.end_date;

/**
 * ไม่มี prop `canEdit` โดยตั้งใจ — สิทธิ์คุมด้วย `<Can permission="subscription.manage">` ที่เดียว
 * การมีทั้ง prop และ `<Can>` แปลว่ามีแหล่งความจริงสองแห่งที่เพี้ยนจากกันได้ และเทสต์ที่ส่ง
 * `canEdit={false}` จะผ่านทั้งที่ปุ่มยังโผล่จริงในเบราว์เซอร์
 */
export default function BusinessUnitLicensesCard({
  licenses, loading, saving, clusterSeat, onCreate, onUpdate, onRemove, now = new Date(),
}: BusinessUnitLicensesCardProps) {
  const [showExpired, setShowExpired] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<LicenseDraft>(() => emptyDraft(now));
  const [removeTarget, setRemoveTarget] = useState<BusinessUnitLicense | null>(null);

  const activeSeats = sumActiveLicenses(licenses, now);
  const activeCount = licenses.filter((l) => licenseStatus(l, now) === 'active').length;
  const expired = licenses.filter((l) => licenseStatus(l, now) === 'expired');
  const visible = showExpired ? licenses : licenses.filter((l) => licenseStatus(l, now) !== 'expired');
  const over = clusterSeat ? clusterSeat.used > clusterSeat.cap : false;

  const startAdd = () => {
    setDraft(emptyDraft(now));
    setEditingId('new');
  };
  const startEdit = (l: BusinessUnitLicense) => {
    setDraft(draftFromLicense(l));
    setEditingId(l.id);
  };
  const cancelEdit = () => setEditingId(null);

  const submitCreate = async () => {
    if (!canSubmitDraft(draft)) return;
    await onCreate({
      licensed_users: Number(draft.licensed_users),
      start_date: toIsoStartOfDay(draft.start_date),
      end_date: toIsoEndOfDay(draft.end_date),
      reference_no: draft.reference_no || null,
    });
    setEditingId(null);
  };

  const submitUpdate = async (l: BusinessUnitLicense) => {
    if (!canSubmitDraft(draft)) return;
    await onUpdate(l.id, {
      licensed_users: Number(draft.licensed_users),
      start_date: toIsoStartOfDay(draft.start_date),
      end_date: toIsoEndOfDay(draft.end_date),
      reference_no: draft.reference_no || null,
      doc_version: l.doc_version,
    });
    setEditingId(null);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">User Licenses</h3>
          <p className="text-xs text-muted-foreground">
            {activeSeats} ที่นั่ง (จาก {activeCount} ใบที่ใช้ได้)
          </p>
          {clusterSeat && (
            <p className={`text-xs ${over ? 'text-destructive' : 'text-muted-foreground'}`}>
              ใช้ {clusterSeat.used} / {clusterSeat.cap} ที่นั่ง ทั้ง cluster
            </p>
          )}
        </div>
        <Can permission="subscription.manage">
          <Button size="sm" onClick={startAdd} disabled={saving || editingId !== null}>
            <Plus className="mr-2 h-4 w-4" />
            เพิ่มใบ
          </Button>
        </Can>
      </CardHeader>

      <CardContent className="space-y-3">
        {loading && licenses.length === 0 ? (
          <TableSkeleton columns={6} rows={3} />
        ) : licenses.length === 0 && editingId !== 'new' ? (
          <EmptyState
            icon={Ticket}
            title="ยังไม่มีใบ license"
            description="เพิ่มใบแรกเพื่อกำหนดจำนวนผู้ใช้ที่ business unit นี้ซื้อไว้"
            action={
              <Can permission="subscription.manage">
                <Button size="sm" onClick={startAdd}>
                  <Plus className="mr-2 h-4 w-4" />
                  เพิ่มใบ
                </Button>
              </Can>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="text-left px-2 py-1">จำนวน</th>
                  <th className="text-left px-2 py-1">เริ่ม</th>
                  <th className="text-left px-2 py-1">หมดอายุ</th>
                  <th className="text-left px-2 py-1">สถานะ</th>
                  <th className="text-left px-2 py-1">อ้างอิง</th>
                  <th className="px-2 py-1" />
                </tr>
              </thead>
              <tbody>
                {editingId === 'new' && (
                  <tr className="border-b">
                    <td className="px-2 py-1">
                      <Input
                        type="number"
                        min={1}
                        value={draft.licensed_users}
                        onChange={(e) => setDraft((d) => ({ ...d, licensed_users: e.target.value }))}
                        aria-label="จำนวนที่นั่ง"
                        className="h-8 w-20"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        type="date"
                        value={draft.start_date}
                        onChange={(e) => setDraft((d) => ({ ...d, start_date: e.target.value }))}
                        aria-label="วันเริ่ม"
                        className="h-8"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        type="date"
                        value={draft.end_date}
                        onChange={(e) => setDraft((d) => ({ ...d, end_date: e.target.value }))}
                        aria-label="วันหมดอายุ"
                        className="h-8"
                      />
                    </td>
                    <td className="px-2 py-1 text-xs text-muted-foreground">ใหม่</td>
                    <td className="px-2 py-1">
                      <Input
                        value={draft.reference_no}
                        onChange={(e) => setDraft((d) => ({ ...d, reference_no: e.target.value }))}
                        aria-label="อ้างอิง"
                        className="h-8"
                      />
                    </td>
                    <td className="px-2 py-1 text-right whitespace-nowrap">
                      <Button size="sm" onClick={submitCreate} disabled={saving || !canSubmitDraft(draft)}>
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {saving ? 'กำลังบันทึก...' : 'เพิ่ม'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={saving}>ยกเลิก</Button>
                    </td>
                  </tr>
                )}
                {visible.map((l) => {
                  const status = licenseStatus(l, now);
                  const badge = STATUS_BADGE[status];
                  const editing = editingId === l.id;
                  return (
                    <tr key={l.id} className="border-b last:border-0">
                      {editing ? (
                        <>
                          <td className="px-2 py-1">
                            <Input
                              type="number"
                              min={1}
                              value={draft.licensed_users}
                              onChange={(e) => setDraft((d) => ({ ...d, licensed_users: e.target.value }))}
                              aria-label="จำนวนที่นั่ง"
                              className="h-8 w-20"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <Input
                              type="date"
                              value={draft.start_date}
                              onChange={(e) => setDraft((d) => ({ ...d, start_date: e.target.value }))}
                              aria-label="วันเริ่ม"
                              className="h-8"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <Input
                              type="date"
                              value={draft.end_date}
                              onChange={(e) => setDraft((d) => ({ ...d, end_date: e.target.value }))}
                              aria-label="วันหมดอายุ"
                              className="h-8"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <Badge variant={badge.variant}>{badge.label}</Badge>
                          </td>
                          <td className="px-2 py-1">
                            <Input
                              value={draft.reference_no}
                              onChange={(e) => setDraft((d) => ({ ...d, reference_no: e.target.value }))}
                              aria-label="อ้างอิง"
                              className="h-8"
                            />
                          </td>
                          <td className="px-2 py-1 text-right whitespace-nowrap">
                            <Button size="sm" onClick={() => submitUpdate(l)} disabled={saving || !canSubmitDraft(draft)}>
                              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={saving}>ยกเลิก</Button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-2 py-1 font-mono">{l.licensed_users}</td>
                          <td className="px-2 py-1">{fmtDate(l.start_date)}</td>
                          <td className="px-2 py-1">{fmtDate(l.end_date)}</td>
                          <td className="px-2 py-1 space-x-1">
                            <Badge variant={badge.variant}>{badge.label}</Badge>
                            {isExpiringSoon(l, now) && (
                              <Badge variant="warning">เหลือ {daysLeft(l.end_date, now)} วัน</Badge>
                            )}
                            {isMigratedPlaceholder(l) && <Badge variant="warning">ต้องระบุวันหมดอายุ</Badge>}
                          </td>
                          <td className="px-2 py-1 text-xs text-muted-foreground">{l.reference_no || '-'}</td>
                          <td className="px-2 py-1 text-right whitespace-nowrap">
                            <Can permission="subscription.manage">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => startEdit(l)}
                                disabled={saving || (editingId !== null && editingId !== l.id)}
                              >
                                แก้
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setRemoveTarget(l)}
                                disabled={saving}
                              >
                                ลบ
                              </Button>
                            </Can>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {expired.length > 0 && !showExpired && (
          <Button variant="ghost" size="sm" onClick={() => setShowExpired(true)}>
            แสดงใบที่หมดอายุแล้ว ({expired.length})
          </Button>
        )}
      </CardContent>

      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(o) => !o && setRemoveTarget(null)}
        title="ลบใบ license"
        description={`ลบใบ ${removeTarget?.licensed_users} ที่นั่ง — ที่นั่งจะหายจาก pool ทันทีถ้าใบนี้ยังคุ้มครองอยู่`}
        confirmVariant="destructive"
        onConfirm={async () => {
          if (removeTarget) onRemove(removeTarget.id);
          setRemoveTarget(null);
        }}
      />
    </Card>
  );
}
