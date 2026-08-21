import { useState } from 'react';
import { Plus, Loader2, Ticket } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { ConfirmDialog } from '../../../components/ui/confirm-dialog';
import { EmptyState } from '../../../components/EmptyState';
import { TableSkeleton } from '../../../components/TableSkeleton';
import clusterLicenseService from '../../../services/clusterLicenseService';
import { useLicenseLedger } from '../../licenses/useLicenseLedger';
import { activeLicense, licenseStatus, isPerpetual, isExpiringSoon, PERPETUAL_END_DATE } from '../../../utils/clusterLicense';
import { fmtDate, daysLeft, toIsoStartOfDay, toIsoEndOfDay } from '../../licenses/licenseDates';
import type { ClusterLicense, ClusterLicenseStatus } from '../../../types';

type ClusterLicenseCreate = Omit<ClusterLicense, 'id' | 'cluster_id' | 'doc_version'>;

export interface LicensesSectionProps {
  clusterId: string;
  /** ควบคุมทั้งปุ่ม Add/Edit/Remove — เพจแม่ (ClusterEdit) เป็นแหล่งความจริงเดียวของสิทธิ์นี้
   *  (มาจาก `cluster.update`) จึงไม่ผูก `<Can>` ซ้ำที่นี่ ไม่งั้นจะมีสองแหล่งที่เพี้ยนจากกันได้ */
  canManage: boolean;
  /** จำนวน BU ที่ใช้ไปแล้วของ cluster (รวม inactive) — มาจาก `clusterMeta.bu_used` ของเพจแม่
   *  (ฟิลด์ `bu_used` บน response ของ cluster, Task 7) ไม่ใช่ query แยกของการ์ดนี้เอง */
  buUsed: number;
}

const STATUS_BADGE: Record<ClusterLicenseStatus, { variant: 'success' | 'secondary' | 'destructive'; label: string }> = {
  active: { variant: 'success', label: 'Active' },
  scheduled: { variant: 'secondary', label: 'Scheduled' },
  expired: { variant: 'destructive', label: 'Expired' },
};

interface LicenseDraft {
  licensed_bus: string;
  start_date: string; // yyyy-mm-dd — ค่าดิบของ <input type="date">
  end_date: string;
  reference_no: string;
  note: string;
}

const emptyDraft = (now: Date): LicenseDraft => ({
  licensed_bus: '',
  start_date: fmtDate(now.toISOString()),
  end_date: '',
  reference_no: '',
  note: '',
});

const draftFromLicense = (l: ClusterLicense): LicenseDraft => ({
  licensed_bus: String(l.licensed_bus),
  start_date: fmtDate(l.start_date),
  end_date: isPerpetual(l.end_date) ? '' : fmtDate(l.end_date),
  reference_no: l.reference_no || '',
  note: l.note || '',
});

const canSubmitDraft = (d: LicenseDraft, noExpiry: boolean): boolean =>
  d.licensed_bus !== '' && Number(d.licensed_bus) > 0 && !!d.start_date && (noExpiry || !!d.end_date);

/**
 * การ์ดจัดการใบซื้อโควตา BU ของ cluster (tb_cluster_license) — โควตาที่มีผลคือ **ใบที่ชนะใบเดียว**
 * (`activeLicense`) ไม่ใช่ผลรวมของทุกใบเหมือน User Licenses ของ BU ดังนั้นหัวการ์ดและตัวเลขทุกจุด
 * ในไฟล์นี้ต้องอ่านจากใบที่ชนะเท่านั้น ห้าม sum `licensed_bus` เด็ดขาด
 *
 * ดึงข้อมูลเอง (เหมือน `SubscriptionCard`) แทนที่จะรับ props จากเพจแม่เหมือน
 * `BusinessUnitLicensesCard` — เพจแม่ส่งแค่ `clusterId` + `canManage`
 */
export function LicensesSection({ clusterId, canManage, buUsed }: LicensesSectionProps) {
  const { licenses, loading, saving, create, update, remove } =
    useLicenseLedger<ClusterLicense, ClusterLicenseCreate>(clusterId, clusterLicenseService);
  const now = new Date();

  const [showExpired, setShowExpired] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<LicenseDraft>(() => emptyDraft(now));
  // state ของฟอร์ม — noExpiry คุมทั้งการซ่อนช่องและค่าที่ส่ง
  const [noExpiry, setNoExpiry] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<ClusterLicense | null>(null);

  // ใบที่ชนะ — ตัวเดียวกับที่ backend ใช้ตัดสิน ไม่ใช่ "ใบล่าสุดในรายการ"
  const winning = activeLicense(licenses, now);
  const expired = licenses.filter((l) => licenseStatus(l, now) === 'expired');
  const visible = showExpired ? licenses : licenses.filter((l) => licenseStatus(l, now) !== 'expired');

  // ประตูเดียวที่เข้าโหมดแก้ไขได้ — ปิดที่นี่แปลว่าไม่มี state path ไหนเปิดแถวกรอกได้เลย ต่อให้มี
  // ปุ่มหลุดมาในอนาคต
  const startAdd = () => {
    if (!canManage) return;
    setDraft(emptyDraft(now));
    setNoExpiry(false);
    setEditingId('new');
  };
  const startEdit = (l: ClusterLicense) => {
    if (!canManage) return;
    setDraft(draftFromLicense(l));
    setNoExpiry(isPerpetual(l.end_date));
    setEditingId(l.id);
  };
  const cancelEdit = () => setEditingId(null);

  const buildPayload = () => ({
    licensed_bus: Number(draft.licensed_bus),
    start_date: toIsoStartOfDay(draft.start_date),
    end_date: noExpiry ? PERPETUAL_END_DATE : toIsoEndOfDay(draft.end_date),
    reference_no: draft.reference_no || undefined,
    note: draft.note || undefined,
  });

  const submitCreate = async () => {
    if (!canSubmitDraft(draft, noExpiry)) return;
    await create(buildPayload());
    setEditingId(null);
  };

  const submitUpdate = async (l: ClusterLicense) => {
    if (!canSubmitDraft(draft, noExpiry)) return;
    await update(l.id, { ...buildPayload(), doc_version: l.doc_version });
    setEditingId(null);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5" />
            BU Quota Licenses
          </CardTitle>
          <CardDescription>
            {winning
              ? `Quota: ${winning.licensed_bus} business units${
                  isPerpetual(winning.end_date) ? ' · no expiry' : ` · expires ${fmtDate(winning.end_date)}`
                }`
              : 'No licence in force — this cluster cannot create business units'}
          </CardDescription>
          {winning && (
            <p className="text-xs text-muted-foreground">
              Business units in use: {buUsed} / {winning.licensed_bus}
              {buUsed > winning.licensed_bus && (
                <span className="ml-2 text-destructive">
                  {buUsed - winning.licensed_bus} over limit — those units are read-only
                </span>
              )}
            </p>
          )}
        </div>
        {canManage && (
          <Button size="sm" onClick={startAdd} disabled={saving || editingId !== null}>
            <Plus className="mr-2 h-4 w-4" />
            Add license
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {loading && licenses.length === 0 ? (
          <TableSkeleton columns={6} rows={3} />
        ) : licenses.length === 0 && editingId !== 'new' ? (
          <EmptyState
            icon={Ticket}
            title="No licences yet"
            description="The platform team has not issued a BU quota licence for this cluster."
            action={
              canManage ? (
                <Button size="sm" onClick={startAdd}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add license
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="text-left px-2 py-1 whitespace-nowrap">Quota</th>
                  <th className="text-left px-2 py-1 whitespace-nowrap">Start</th>
                  <th className="text-left px-2 py-1 whitespace-nowrap">End</th>
                  <th className="text-left px-2 py-1 whitespace-nowrap">Status</th>
                  <th className="text-left px-2 py-1 whitespace-nowrap">Reference</th>
                  <th className="text-left px-2 py-1">Note</th>
                  {canManage && <th className="px-2 py-1" />}
                </tr>
              </thead>
              <tbody>
                {editingId === 'new' && (
                  <tr className="border-b">
                    <td className="px-2 py-1">
                      <Input
                        type="number"
                        min={1}
                        value={draft.licensed_bus}
                        onChange={(e) => setDraft((d) => ({ ...d, licensed_bus: e.target.value }))}
                        aria-label="Quota"
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
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 text-xs whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={noExpiry}
                            onChange={(e) => setNoExpiry(e.target.checked)}
                            aria-label="No expiry"
                            className="h-4 w-4 rounded border-input"
                          />
                          No expiry
                        </label>
                        {!noExpiry && (
                          <Input
                            type="date"
                            value={draft.end_date}
                            onChange={(e) => setDraft((d) => ({ ...d, end_date: e.target.value }))}
                            aria-label="End date"
                            className="h-8"
                          />
                        )}
                      </div>
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
                    <td className="px-2 py-1">
                      <Input
                        value={draft.note}
                        onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
                        aria-label="Note"
                        className="h-8"
                      />
                    </td>
                    <td className="px-2 py-1 text-right whitespace-nowrap">
                      <Button size="sm" onClick={submitCreate} disabled={saving || !canSubmitDraft(draft, noExpiry)}>
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
                              value={draft.licensed_bus}
                              onChange={(e) => setDraft((d) => ({ ...d, licensed_bus: e.target.value }))}
                              aria-label="Quota"
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
                            <div className="space-y-2">
                              <label className="flex items-center gap-2 text-xs whitespace-nowrap">
                                <input
                                  type="checkbox"
                                  checked={noExpiry}
                                  onChange={(e) => setNoExpiry(e.target.checked)}
                                  aria-label="No expiry"
                                  className="h-4 w-4 rounded border-input"
                                />
                                No expiry
                              </label>
                              {!noExpiry && (
                                <Input
                                  type="date"
                                  value={draft.end_date}
                                  onChange={(e) => setDraft((d) => ({ ...d, end_date: e.target.value }))}
                                  aria-label="End date"
                                  className="h-8"
                                />
                              )}
                            </div>
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
                          <td className="px-2 py-1">
                            <Input
                              value={draft.note}
                              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
                              aria-label="Note"
                              className="h-8"
                            />
                          </td>
                          <td className="px-2 py-1 text-right whitespace-nowrap">
                            <Button size="sm" onClick={() => submitUpdate(l)} disabled={saving || !canSubmitDraft(draft, noExpiry)}>
                              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                              {saving ? 'Saving...' : 'Save'}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={saving}>Cancel</Button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-2 py-1 font-mono whitespace-nowrap">{l.licensed_bus}</td>
                          <td className="px-2 py-1 whitespace-nowrap">{fmtDate(l.start_date)}</td>
                          <td className="px-2 py-1 whitespace-nowrap">
                            {isPerpetual(l.end_date) ? <span className="text-muted-foreground">No expiry</span> : fmtDate(l.end_date)}
                          </td>
                          <td className="px-2 py-1 space-x-1 whitespace-nowrap">
                            <Badge variant={badge.variant}>{badge.label}</Badge>
                            {isExpiringSoon(l, now) && (
                              <Badge variant="warning">{daysLeft(l.end_date, now)} days left</Badge>
                            )}
                          </td>
                          <td className="px-2 py-1 text-xs text-muted-foreground">{l.reference_no || '-'}</td>
                          <td className="px-2 py-1 text-xs text-muted-foreground max-w-[200px] truncate" title={l.note || undefined}>
                            {l.note || '-'}
                          </td>
                          {canManage && (
                            <td className="px-2 py-1 text-right whitespace-nowrap">
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

      {canManage && (
        <ConfirmDialog
          open={!!removeTarget}
          onOpenChange={(o) => !o && setRemoveTarget(null)}
          title="Remove license"
          description={`Remove the ${removeTarget?.licensed_bus}-BU license. If it is still in force, this cluster immediately loses the ability to create new business units until another licence takes over.`}
          confirmVariant="destructive"
          onConfirm={async () => {
            if (removeTarget) await remove(removeTarget.id);
            setRemoveTarget(null);
          }}
        />
      )}
    </Card>
  );
}
