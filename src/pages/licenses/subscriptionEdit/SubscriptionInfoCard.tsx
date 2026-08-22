import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Badge } from '../../../components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { ReadOnlyField } from '../../../components/ReadOnlyField';
import type { BusinessUnit, Cluster, SubscriptionState, SubscriptionStatus } from '../../../types';

export interface SubscriptionFormData {
  cluster_id: string;
  /** BU ที่ออกสัญญาให้ — เลือกได้ตอนสร้างเท่านั้น แก้ทีหลังไม่ได้ เหมือน `cluster_id` */
  business_unit_id: string;
  /** ระบบออกให้ (`SUB-YYMM-####`) — แสดงอย่างเดียว ว่างตอนสร้างเพราะยังไม่มีเลข */
  subscription_number: string;
  /** 'YYYY-MM-DD' — the raw <input type="date"> value, converted to/from ISO Z at the page level. */
  start_date: string;
  end_date: string;
  status: SubscriptionStatus;
}

const STATUS_OPTIONS: SubscriptionStatus[] = ['active', 'inactive', 'expired'];

const selectClassName =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring';

export interface SubscriptionInfoCardProps {
  formData: SubscriptionFormData;
  fieldErrors: Record<string, string>;
  /** false ⇒ every field renders its read-only mode (no separate Edit toggle on this page). */
  editing: boolean;
  isNew: boolean;
  /** Read-only display for the cluster field on an existing subscription (`"name (code)"`). */
  clusterLabel?: string;
  /** Backend-computed display state (list/detail `state`) — undefined until an existing
   * subscription has loaded. Never recompute this from status/end_date on the frontend. */
  state?: SubscriptionState;
  /** Candidate clusters for the picker — only rendered when `isNew`. */
  clusters: Cluster[];
  clustersLoading?: boolean;
  /** BU ของ cluster ที่เลือก — ตัวเลือกของ picker ตอนสร้าง */
  clusterBus: BusinessUnit[];
  clusterBusLoading?: boolean;
  /** Read-only display for the BU field on an existing subscription (`"CODE - name"`). */
  buLabel?: string;
  /** Why the cluster list is empty, when it failed to load — shown under the picker so the
   * user isn't left staring at a dropdown with nothing in it and no explanation (M7). */
  clustersError?: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onBlur: (e: React.FocusEvent<HTMLInputElement>) => void;
  onFocus: (e: React.FocusEvent<HTMLInputElement>) => void;
}

/**
 * Contract details — subscription number, period, status. Every field renders two modes
 * (edit control + `ReadOnlyField`) per CLAUDE.md's Form Field Pattern, gated on `editing`
 * (== `subscription.manage`), not a page-level Edit toggle.
 *
 * Cluster and business unit are the exceptions: both are only ever editable when `isNew` — an
 * existing contract's cluster and BU are fixed, regardless of permission. Reissuing to another
 * BU means deleting the contract and creating a new one, which keeps the paper trail honest.
 *
 * Subscription number is never editable at all: the server issues it (`SUB-YYMM-####`).
 */
export function SubscriptionInfoCard({
  formData,
  fieldErrors,
  editing,
  isNew,
  clusterLabel,
  state,
  clusters,
  clustersLoading,
  clustersError,
  clusterBus,
  clusterBusLoading,
  buLabel,
  onChange,
  onBlur,
  onFocus,
}: SubscriptionInfoCardProps) {
  const clusterEditable = editing && isNew;
  const buEditable = editing && isNew;
  const selectedCluster = clusters.find((c) => c.id === formData.cluster_id);
  // A cluster the caller pre-selected (e.g. ?cluster_id=… from Cluster Edit) may not be in
  // `clusters` yet while the picker list is still loading — synthesize a placeholder option
  // so <select value=…> doesn't silently fall back to the first real option instead.
  const missingCurrentClusterId =
    !selectedCluster && formData.cluster_id ? formData.cluster_id : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>ข้อมูลสัญญา</CardTitle>
        <CardDescription>Contract identity, period, and status</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="cluster_id">Cluster{clusterEditable && ' *'}</Label>
            {clusterEditable ? (
              <>
                <select
                  id="cluster_id"
                  name="cluster_id"
                  value={formData.cluster_id}
                  onChange={onChange}
                  className={selectClassName}
                >
                  <option value="">Select a cluster</option>
                  {missingCurrentClusterId && (
                    <option value={missingCurrentClusterId}>
                      {clustersLoading ? 'Loading…' : missingCurrentClusterId}
                    </option>
                  )}
                  {clusters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} - {c.name}
                    </option>
                  ))}
                </select>
                {fieldErrors.cluster_id && (
                  <p className="text-destructive text-xs">{fieldErrors.cluster_id}</p>
                )}
                {clustersError && (
                  <p className="text-destructive text-xs" role="alert">{clustersError}</p>
                )}
              </>
            ) : (
              <ReadOnlyField value={clusterLabel} />
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="business_unit_id">Business Unit{buEditable && ' *'}</Label>
            {buEditable ? (
              <>
                <select
                  id="business_unit_id"
                  name="business_unit_id"
                  value={formData.business_unit_id}
                  onChange={onChange}
                  disabled={!formData.cluster_id || clusterBusLoading}
                  className={selectClassName}
                >
                  <option value="">
                    {!formData.cluster_id
                      ? 'เลือกคลัสเตอร์ก่อน'
                      : clusterBusLoading
                        ? 'Loading…'
                        : 'Select a business unit'}
                  </option>
                  {clusterBus.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.code} - {b.name}
                    </option>
                  ))}
                </select>
                {fieldErrors.business_unit_id && (
                  <p className="text-destructive text-xs">{fieldErrors.business_unit_id}</p>
                )}
                {/* คลัสเตอร์ที่ไม่มี BU เลยสร้างสัญญาไม่ได้ — บอกตรงนี้ ดีกว่าปล่อยให้กด Create
                    แล้วเจอ 400 จาก backend โดยไม่รู้ว่าติดอะไร */}
                {formData.cluster_id && !clusterBusLoading && clusterBus.length === 0 && (
                  <p className="text-destructive text-xs" role="alert">
                    คลัสเตอร์นี้ยังไม่มีหน่วยธุรกิจ — สร้างหน่วยธุรกิจก่อนจึงจะออกสัญญาได้
                  </p>
                )}
              </>
            ) : (
              <ReadOnlyField value={buLabel} />
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="subscription_number">Subscription Number</Label>
            {/* ไม่มีโหมดแก้ — ระบบออกเลขให้ตอนสร้าง (`SUB-YYMM-####` เลขวิ่งทั่วระบบต่อเดือน)
                และเลขนั้นอาจถูกอ้างในเอกสารที่ส่งออกไปแล้ว */}
            <ReadOnlyField
              value={isNew ? undefined : formData.subscription_number}
              className="font-mono"
            />
            {isNew && (
              <p className="text-muted-foreground text-xs">ระบบจะออกเลขให้อัตโนมัติเมื่อบันทึก</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="start_date">Start Date{editing && ' *'}</Label>
            {editing ? (
              <>
                <Input
                  type="date"
                  id="start_date"
                  name="start_date"
                  value={formData.start_date}
                  onChange={onChange}
                  onBlur={onBlur}
                  onFocus={onFocus}
                  className={fieldErrors.start_date ? 'border-destructive' : ''}
                />
                {fieldErrors.start_date && (
                  <p className="text-destructive text-xs">{fieldErrors.start_date}</p>
                )}
              </>
            ) : (
              <ReadOnlyField value={formData.start_date} />
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="end_date">End Date{editing && ' *'}</Label>
            {editing ? (
              <>
                <Input
                  type="date"
                  id="end_date"
                  name="end_date"
                  value={formData.end_date}
                  onChange={onChange}
                  onBlur={onBlur}
                  onFocus={onFocus}
                  className={fieldErrors.end_date ? 'border-destructive' : ''}
                />
                {fieldErrors.end_date && (
                  <p className="text-destructive text-xs">{fieldErrors.end_date}</p>
                )}
              </>
            ) : (
              <ReadOnlyField value={formData.end_date} />
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            {editing ? (
              <select
                id="status"
                name="status"
                value={formData.status}
                onChange={onChange}
                className={selectClassName}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            ) : (
              <div>
                <Badge variant={formData.status === 'active' ? 'success' : 'secondary'} className="capitalize">
                  {formData.status}
                </Badge>
              </div>
            )}
            {/* status is the raw DB value; state is what backend computed from status + end_date.
                Always show both so "status=active but already expired" is visible at a glance —
                never recompute state on the frontend (swagger: use the field as-is). */}
            {!isNew && state && (
              <div className="text-xs text-muted-foreground">
                Effective state:{' '}
                <Badge variant={state === 'active' ? 'success' : 'secondary'} className="ml-1 capitalize">
                  {state}
                </Badge>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
