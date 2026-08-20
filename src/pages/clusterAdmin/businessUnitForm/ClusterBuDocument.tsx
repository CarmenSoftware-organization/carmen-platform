import { Card } from '../../../components/ui/card';
import { badgeVariants } from '../../../components/ui/badge';
import { InlineField, Group } from '../../businessUnitEdit/shared';
import { AddressBlock } from './AddressBlock';
import type { BusinessUnitFormData } from '../../businessUnitEdit/types';
import { BU_ALIAS_MAX } from '../../businessUnitEdit/types';

export interface ClusterBuDocumentProps {
  formData: BusinessUnitFormData;
  fieldErrors: Record<string, string>;
  logoUrl?: string;
  avatarUrl?: string;
  canEdit: boolean;
  onCommit: (name: string, value: string) => void;
  onToggle: (name: string, value: boolean) => void;
  onValidate: (name: string, value: string) => void;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  /** BusinessUnitBrandingCard — the hero's logo/avatar stay display-only; this is
   *  the real upload surface, same split as the platform BusinessUnitDocument.tsx. */
  brandingSlot?: React.ReactNode;
  /** People & seats — task 5 */
  seatsSlot?: React.ReactNode;
  /** Billing entity + System settings — task 6 */
  collapsedSlot?: React.ReactNode;
}

export function ClusterBuDocument({
  formData: f, fieldErrors, logoUrl, avatarUrl, canEdit,
  onCommit, onToggle, onValidate, onChange, brandingSlot, seatsSlot, collapsedSlot,
}: ClusterBuDocumentProps) {
  const inline = (
    name: keyof BusinessUnitFormData,
    label: string,
    opts?: { type?: 'text' | 'email' | 'textarea'; mono?: boolean; validate?: boolean; maxLength?: number },
  ) => (
    <InlineField
      key={name}
      name={name}
      label={label}
      value={String(f[name] ?? '')}
      type={opts?.type}
      mono={opts?.mono}
      maxLength={opts?.maxLength}
      error={fieldErrors[name]}
      disabled={!canEdit}
      onCommit={onCommit}
      onValidate={opts?.validate ? onValidate : undefined}
    />
  );

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden p-0">
        {/* hero — logo/avatar เป็น display-only แค่ให้เห็นเร็วๆ อัปโหลดจริงยังอยู่ที่
            BusinessUnitBrandingCard (brandingSlot) เหมือนหน้า platform BusinessUnitDocument.tsx
            ทุกประการ — สเปกเดิมของงานนี้เข้าใจผิดว่า hero ทำให้การ์ด Branding ซ้ำซ้อน ไม่ใช่
            badge คลิกเพื่อสลับ */}
        <div className="flex flex-wrap items-center gap-4 p-5 sm:p-6">
          <div className="flex shrink-0 gap-2.5">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="h-11 w-16 rounded-lg border object-cover" />
            ) : (
              <div className="from-primary to-info grid h-11 w-16 place-items-center rounded-lg bg-linear-to-br text-[11px] font-bold text-white">
                {f.code.slice(0, 8).toUpperCase() || 'BU'}
              </div>
            )}
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="size-11 rounded-lg border object-cover" />
            ) : (
              <div className="bg-primary/90 grid size-11 place-items-center rounded-lg text-lg font-bold text-white">
                {(f.name || '?').slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          {/* ไม่มีชื่อ cluster ใน hero โดยตั้งใจ — ClusterAdminLayout แสดงไว้แล้วทั้งใน
              breadcrumb และ ClusterSwitcher ด้านบน การใส่ซ้ำคือ noise และจะต้องยิง API
              เพิ่มเพื่อข้อมูลที่อยู่บนจออยู่แล้ว */}
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
            <button
              type="button"
              disabled={!canEdit}
              aria-pressed={f.is_active}
              onClick={() => onToggle('is_active', !f.is_active)}
              className="focus-visible:ring-ring -my-2 rounded-full py-2 focus-visible:outline-hidden focus-visible:ring-1"
            >
              {/* <span>, not <Badge> (a <div>) — a <button> may only contain phrasing content. */}
              <span className={badgeVariants({ variant: f.is_active ? 'success' : 'secondary' })}>
                {f.is_active ? 'Active' : 'Inactive'}
              </span>
            </button>
            <button
              type="button"
              disabled={!canEdit}
              aria-pressed={f.is_hq}
              onClick={() => onToggle('is_hq', !f.is_hq)}
              className="focus-visible:ring-ring -my-2 rounded-full py-2 focus-visible:outline-hidden focus-visible:ring-1"
            >
              <span className={badgeVariants({ variant: f.is_hq ? 'default' : 'secondary' })}>
                {f.is_hq ? 'HQ' : 'Not HQ'}
              </span>
            </button>
          </div>
        </div>

        {/* ที่เหลือของการ์ด Details เดิม — name ขึ้นไปอยู่ title ของ PageHeader,
            is_hq/is_active อยู่ใน hero ข้างบน */}
        <Group label="Identity">
          {inline('alias_name', 'Alias', { mono: true, validate: true, maxLength: BU_ALIAS_MAX })}
          {inline('description', 'Description', { type: 'textarea' })}
        </Group>
      </Card>

      {brandingSlot}

      {seatsSlot}

      <Card className="overflow-hidden p-0">
        <Group label="Property">
          {inline('hotel_name', 'Hotel name')}
          {inline('hotel_tel', 'Phone', { mono: true, validate: true })}
          {inline('hotel_email', 'Email', { type: 'email', validate: true })}
          <div className="mt-2">
            <div className="text-muted-foreground mb-1 px-2 text-sm">Address</div>
            <AddressBlock prefix="hotel" formData={f} disabled={!canEdit} onChange={onChange} />
          </div>
        </Group>
      </Card>

      {collapsedSlot}
    </div>
  );
}
