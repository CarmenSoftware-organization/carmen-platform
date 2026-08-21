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
import { fmtDate, daysLeft, toIsoStartOfDay, toIsoEndOfDay } from '../licenses/licenseDates';
import type { BusinessUnitLicense, BuLicenseStatus } from '../../types';

interface BusinessUnitLicensesCardProps {
  licenses: BusinessUnitLicense[];
  loading: boolean;
  saving: boolean;
  /** pool ระดับ cluster ไม่ใช่ของ BU นี้ — การ์ดต้องพูดให้ชัดว่าเป็นของทั้ง cluster */
  clusterSeat?: { used: number; cap: number };
  /** หน้าที่ไม่มีทางแก้ license ได้เลย ไม่ว่าใครเปิด — ดูหมายเหตุเหนือคอมโพเนนต์ */
  readOnly?: boolean;
  /** ไม่บังคับ เพราะหน้าที่ส่ง readOnly ไม่ควรมีสายเขียนต่ออยู่เลย */
  onCreate?: (data: Omit<BusinessUnitLicense, 'id' | 'business_unit_id' | 'doc_version'>) => void;
  onUpdate?: (id: string, data: Partial<BusinessUnitLicense> & { doc_version: number }) => void;
  onRemove?: (id: string) => void;
  /** ฉีดเวลาให้เทสต์เท่านั้น — production ไม่ส่ง */
  now?: Date;
}

const STATUS_BADGE: Record<BuLicenseStatus, { variant: 'success' | 'secondary' | 'destructive'; label: string }> = {
  active: { variant: 'success', label: 'Active' },
  scheduled: { variant: 'secondary', label: 'Scheduled' },
  expired: { variant: 'destructive', label: 'Expired' },
};

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

const canSubmitDraft = (d: LicenseDraft): boolean =>
  d.licensed_users !== '' && Number(d.licensed_users) > 0 && !!d.start_date && !!d.end_date;

/**
 * ไม่มี prop `canEdit` โดยตั้งใจ — *สิทธิ์* คุมด้วย `<Can permission="subscription.manage">` ที่เดียว
 * การมีทั้ง prop และ `<Can>` แปลว่ามีแหล่งความจริงสองแห่งที่เพี้ยนจากกันได้ และเทสต์ที่ส่ง
 * `canEdit={false}` จะผ่านทั้งที่ปุ่มยังโผล่จริงในเบราว์เซอร์
 *
 * `readOnly` ไม่ใช่ข้อยกเว้นของกฎนั้น เพราะมันตอบคนละคำถาม: `<Can>` ตอบว่า "ผู้ใช้คนนี้มีสิทธิ์ไหม"
 * ส่วน `readOnly` ตอบว่า "หน้านี้เป็นพื้นผิวสำหรับเขียนไหม" — มุม cluster admin ตอบว่าไม่ ไม่ว่าใครเปิด
 * (platform admin ที่ถือ subscription.manage ก็เปิดหน้านั้นได้ และเคยเห็นปุ่มครบทั้งที่หน้านั้น
 * ไม่ควรมีทางเขียน) จึงไม่ใช่การสะท้อนสิทธิ์ซ้ำ และไม่มีทางเพี้ยนจาก `<Can>` เพราะมันไม่ได้อ่านสิทธิ์เลย
 * เทียบได้กับ `canEditCalculationMethod={false}` ที่หน้าเดียวกันส่งให้ CalculationSettingsSection อยู่แล้ว
 * หน้าที่ส่ง `readOnly` ต้องไม่ส่ง onCreate/onUpdate/onRemove ด้วย — ทำให้ "เขียนไม่ได้" เป็นข้อจริง
 * เชิงโครงสร้าง ไม่ใช่แค่ปุ่มที่ถูกซ่อน
 */
export default function BusinessUnitLicensesCard({
  licenses, loading, saving, clusterSeat, readOnly = false,
  onCreate, onUpdate, onRemove, now = new Date(),
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

  // ประตูเดียวที่เข้าโหมดแก้ไขได้ — ปิดที่นี่แปลว่าไม่มี state path ไหนเปิดแถวกรอกได้เลย
  // ต่อให้มีปุ่มหลุดมาในอนาคต
  const startAdd = () => {
    if (readOnly) return;
    setDraft(emptyDraft(now));
    setEditingId('new');
  };
  const startEdit = (l: BusinessUnitLicense) => {
    if (readOnly) return;
    setDraft(draftFromLicense(l));
    setEditingId(l.id);
  };
  const cancelEdit = () => setEditingId(null);

  const submitCreate = async () => {
    if (!canSubmitDraft(draft)) return;
    await onCreate?.({
      licensed_users: Number(draft.licensed_users),
      start_date: toIsoStartOfDay(draft.start_date),
      end_date: toIsoEndOfDay(draft.end_date),
      reference_no: draft.reference_no || null,
    });
    setEditingId(null);
  };

  const submitUpdate = async (l: BusinessUnitLicense) => {
    if (!canSubmitDraft(draft)) return;
    await onUpdate?.(l.id, {
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
            {activeSeats} seats from {activeCount} active {activeCount === 1 ? 'license' : 'licenses'}
          </p>
          {clusterSeat && (
            <p className={`text-xs ${over ? 'text-destructive' : 'text-muted-foreground'}`}>
              {/* ติดป้ายว่านี่คือ pool ไม่ใช่เลขของ BU นี้ — การ์ด Users ข้างบนแสดงตัวเลขชุดเดียวกัน
                  ในบทบาท "ใช้ไปเท่าไร" ส่วนที่นี่คือเพดานที่บีบ license ด้านบนอีกที */}
              Cluster pool: {clusterSeat.used} / {clusterSeat.cap} seats used
            </p>
          )}
          {/* บอกครั้งเดียวว่าใครเป็นเจ้าของเรื่องนี้ — ปุ่มที่หายไปเฉยๆ อ่านเหมือนหน้าพัง
              ส่วนประโยคนี้บอกด้วยว่าถ้าอยากได้ที่นั่งเพิ่มต้องไปหาใคร */}
          {readOnly && (
            <p className="text-xs text-muted-foreground">
              Seats are set by the platform team. This page is read-only.
            </p>
          )}
        </div>
        {!readOnly && (
          <Can permission="subscription.manage">
            <Button size="sm" onClick={startAdd} disabled={saving || editingId !== null}>
              <Plus className="mr-2 h-4 w-4" />
              Add license
            </Button>
          </Can>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {loading && licenses.length === 0 ? (
          <TableSkeleton columns={6} rows={3} />
        ) : licenses.length === 0 && editingId !== 'new' ? (
          // หน้าอ่านอย่างเดียวต้องเล่าสถานะ ไม่ใช่ชวนให้ลงมือ — คำเชิญที่กดไม่ได้แย่กว่าไม่มีคำเชิญ
          <EmptyState
            icon={Ticket}
            title="No licenses yet"
            description={
              readOnly
                ? 'The platform team has not assigned seats to this business unit.'
                : 'Add the first license to set how many users this business unit has bought.'
            }
            action={
              readOnly ? undefined : (
                <Can permission="subscription.manage">
                  <Button size="sm" onClick={startAdd}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add license
                  </Button>
                </Can>
              )
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="text-left px-2 py-1 whitespace-nowrap">Seats</th>
                  <th className="text-left px-2 py-1 whitespace-nowrap">Start</th>
                  <th className="text-left px-2 py-1 whitespace-nowrap">End</th>
                  <th className="text-left px-2 py-1 whitespace-nowrap">Status</th>
                  {/* readOnly ให้ "อ้างอิง" ดูดที่ว่างที่คอลัมน์ปุ่มเคยกินไว้ (w-full บนเซลล์ = ขอพื้นที่
                      ที่เหลือทั้งหมด) คอลัมน์อื่นจึงหดชิดกันทางซ้ายแทนที่จะกระจายจนอ่านเหมือนตารางเพี้ยน */}
                  <th className={`text-left px-2 py-1${readOnly ? ' w-full' : ''}`}>Reference</th>
                  {/* ตัดทั้งคอลัมน์ ไม่ใช่แค่ปุ่มข้างใน — คอลัมน์ที่ว่างตลอดกาลคือที่ว่างเปล่าประโยชน์ */}
                  {!readOnly && <th className="px-2 py-1" />}
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
                        aria-label="Seats"
                        className="h-8 w-20"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        type="date"
                        value={draft.start_date}
                        onChange={(e) => setDraft((d) => ({ ...d, start_date: e.target.value }))}
                        aria-label="Start date"
                        className="h-8"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        type="date"
                        value={draft.end_date}
                        onChange={(e) => setDraft((d) => ({ ...d, end_date: e.target.value }))}
                        aria-label="End date"
                        className="h-8"
                      />
                    </td>
                    <td className="px-2 py-1 text-xs text-muted-foreground">New</td>
                    <td className="px-2 py-1">
                      <Input
                        value={draft.reference_no}
                        onChange={(e) => setDraft((d) => ({ ...d, reference_no: e.target.value }))}
                        aria-label="Reference"
                        className="h-8"
                      />
                    </td>
                    <td className="px-2 py-1 text-right whitespace-nowrap">
                      <Button size="sm" onClick={submitCreate} disabled={saving || !canSubmitDraft(draft)}>
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {saving ? 'Saving...' : 'Add'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={saving}>Cancel</Button>
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
                              aria-label="Seats"
                              className="h-8 w-20"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <Input
                              type="date"
                              value={draft.start_date}
                              onChange={(e) => setDraft((d) => ({ ...d, start_date: e.target.value }))}
                              aria-label="Start date"
                              className="h-8"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <Input
                              type="date"
                              value={draft.end_date}
                              onChange={(e) => setDraft((d) => ({ ...d, end_date: e.target.value }))}
                              aria-label="End date"
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
                              aria-label="Reference"
                              className="h-8"
                            />
                          </td>
                          <td className="px-2 py-1 text-right whitespace-nowrap">
                            <Button size="sm" onClick={() => submitUpdate(l)} disabled={saving || !canSubmitDraft(draft)}>
                              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                              {saving ? 'Saving...' : 'Save'}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={saving}>Cancel</Button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-2 py-1 font-mono whitespace-nowrap">{l.licensed_users}</td>
                          <td className="px-2 py-1 whitespace-nowrap">{fmtDate(l.start_date)}</td>
                          <td className="px-2 py-1 whitespace-nowrap">{fmtDate(l.end_date)}</td>
                          <td className="px-2 py-1 space-x-1 whitespace-nowrap">
                            <Badge variant={badge.variant}>{badge.label}</Badge>
                            {isExpiringSoon(l, now) && (
                              <Badge variant="warning">{daysLeft(l.end_date, now)} days left</Badge>
                            )}
                            {isMigratedPlaceholder(l) && <Badge variant="warning">End date required</Badge>}
                          </td>
                          <td className={`px-2 py-1 text-xs text-muted-foreground${readOnly ? ' w-full' : ''}`}>
                            {l.reference_no || '-'}
                          </td>
                          {!readOnly && (
                            <td className="px-2 py-1 text-right whitespace-nowrap">
                              <Can permission="subscription.manage">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => startEdit(l)}
                                  disabled={saving || (editingId !== null && editingId !== l.id)}
                                >
                                  Edit
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setRemoveTarget(l)}
                                  disabled={saving}
                                >
                                  Remove
                                </Button>
                              </Can>
                            </td>
                          )}
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
            Show expired ({expired.length})
          </Button>
        )}
      </CardContent>

      {/* กันทั้ง dialog ไว้หลัง readOnly ตามแบบเดียวกับ BusinessUnitUsersCard — ไม่เหลือ state path ไหน
          ที่ทำให้กล่องยืนยันการลบโผล่ขึ้นมาได้ */}
      {!readOnly && (
        <ConfirmDialog
          open={!!removeTarget}
          onOpenChange={(o) => !o && setRemoveTarget(null)}
          title="Remove license"
          description={`Remove the ${removeTarget?.licensed_users}-seat license. If it is still in force, those seats leave the cluster pool immediately.`}
          confirmVariant="destructive"
          onConfirm={async () => {
            if (removeTarget) onRemove?.(removeTarget.id);
            setRemoveTarget(null);
          }}
        />
      )}
    </Card>
  );
}
