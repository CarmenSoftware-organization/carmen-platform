import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import type { BusinessUnitFormData, DefaultCurrency } from './types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = (v?: string) => {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

const clean = (v?: string | null) => {
  const t = (v ?? '').trim();
  return t.length ? t : null;
};

const CALC: Record<string, string> = { average: 'Average', fifo: 'FIFO' };

function localeOf(amountFormat: string): string | null {
  try {
    const l = JSON.parse(amountFormat)?.locales;
    return typeof l === 'string' && l ? l : null;
  } catch {
    return null;
  }
}

interface BusinessUnitProfileProps {
  formData: BusinessUnitFormData;
  clusterName: string;
  logoUrl?: string;
  avatarUrl?: string;
  currency?: DefaultCurrency | null;
  userCount: number;
  meta: { created_at?: string; created_by_name?: string; updated_at?: string; updated_by_name?: string };
  onNavigate: (sectionId: string) => void;
  editAction?: React.ReactNode;
}

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  const empty = value == null || value === '';
  return (
    <>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd
        className={
          empty
            ? 'text-muted-foreground/70 text-[13px] italic'
            : mono
              ? 'text-foreground/90 font-mono text-[12.5px] tabular-nums'
              : 'text-foreground/90 text-[13px]'
        }
      >
        {empty ? 'Not set' : value}
      </dd>
    </>
  );
}

function Group({
  label,
  section,
  onNavigate,
  children,
}: {
  label: string;
  section: string;
  onNavigate: (id: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="group/field border-border relative border-b border-r p-4 last:border-b-0 sm:p-5 [&:nth-child(even)]:border-r-0">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-muted-foreground text-[10.5px] font-bold uppercase tracking-[0.13em]">{label}</span>
        <button
          type="button"
          onClick={() => onNavigate(section)}
          className="text-primary text-[11.5px] font-medium opacity-0 transition-opacity hover:underline focus-visible:opacity-100 group-hover/field:opacity-100"
        >
          Edit →
        </button>
      </div>
      <dl className="grid grid-cols-[minmax(84px,auto)_1fr] gap-x-3.5 gap-y-2">{children}</dl>
    </div>
  );
}

export default function BusinessUnitProfile({
  formData: f,
  clusterName,
  logoUrl,
  avatarUrl,
  currency,
  userCount,
  meta,
  onNavigate,
  editAction,
}: BusinessUnitProfileProps) {
  const addrLine1 = [clean(f.hotel_address_line1), clean(f.hotel_address_line2)].filter(Boolean).join(', ');
  const addrLine2 = [clean(f.hotel_sub_district), clean(f.hotel_district)].filter(Boolean).join(', ');
  const addrLine3 = [clean(f.hotel_city), clean(f.hotel_province), clean(f.hotel_postal_code)].filter(Boolean).join(' ');
  const address = [addrLine1, addrLine2, addrLine3].filter(Boolean).join('\n') || null;
  const coords = clean(f.hotel_latitude) && clean(f.hotel_longitude) ? `${f.hotel_latitude}, ${f.hotel_longitude}` : null;

  const currencyText = currency
    ? `${currency.code} — ${currency.name}`
    : clean(f.default_currency_id);
  const dateText = [clean(f.date_format), clean(f.time_format)].filter(Boolean).join(' · ') || null;
  const maxUsers = clean(f.max_license_users);
  const usersText = maxUsers ? `${userCount} of ${maxUsers} licensed` : `${userCount} user${userCount === 1 ? '' : 's'} · no cap`;
  const connected = f.db_connection.length > 0;

  const created = fmtDate(meta.created_at);
  const updated = fmtDate(meta.updated_at);

  return (
    <Card className="overflow-hidden p-0">
      {/* identity hero */}
      <div className="flex flex-wrap items-start gap-4 border-b p-5 sm:p-6">
        <div className="flex shrink-0 gap-2.5">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-11 w-16 rounded-lg border object-cover" />
          ) : (
            <div className="from-primary to-info grid h-11 w-16 place-items-center rounded-lg bg-gradient-to-br text-[11px] font-bold text-white">
              {f.code.slice(0, 8).toUpperCase() || 'BU'}
            </div>
          )}
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="size-11 rounded-lg border object-cover" />
          ) : (
            <div className="bg-primary/90 grid size-11 place-items-center rounded-lg text-lg font-bold text-white">
              {(f.name || f.code || '?').slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{clean(f.name) ?? '(unnamed business unit)'}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-primary bg-primary/10 rounded px-1.5 py-0.5 font-mono text-xs font-semibold">{f.code}</span>
            {clean(f.alias_name) && (
              <span className="text-muted-foreground rounded border px-1.5 py-0.5 font-mono text-xs">{f.alias_name}</span>
            )}
            {clean(clusterName) && clusterName !== '-' && <span className="text-foreground/80">{clusterName}</span>}
            <Badge variant={f.is_active ? 'success' : 'secondary'}>{f.is_active ? 'Active' : 'Inactive'}</Badge>
            {f.is_hq && <Badge variant="secondary">HQ</Badge>}
          </div>
        </div>
        {editAction && <div className="shrink-0">{editAction}</div>}
      </div>

      {/* fact groups */}
      <div className="grid sm:grid-cols-2">
        <Group label="Location" section="address" onNavigate={onNavigate}>
          <Field label="Address" value={address ? <span className="whitespace-pre-line">{address}</span> : null} />
          <Field label="Country" value={clean(f.hotel_country)} />
          <Field label="Coordinates" value={coords} mono />
        </Group>

        <Group label="Contact" section="address" onNavigate={onNavigate}>
          <Field label="Phone" value={clean(f.hotel_tel)} mono />
          <Field label="Email" value={clean(f.hotel_email)} />
        </Group>

        <Group label="Company & tax" section="address" onNavigate={onNavigate}>
          <Field label="Company" value={clean(f.company_name)} />
          <Field label="Tax ID" value={clean(f.tax_no)} mono />
          <Field label="Branch" value={clean(f.branch_no)} mono />
        </Group>

        <Group label="Localization" section="localization" onNavigate={onNavigate}>
          <Field label="Currency" value={currencyText} />
          <Field label="Timezone" value={clean(f.timezone)} />
          <Field label="Date & time" value={dateText} mono />
          <Field label="Numbers" value={localeOf(f.amount_format)} mono />
          <Field label="Costing" value={CALC[f.calculation_method] ?? clean(f.calculation_method)} />
        </Group>

        <Group label="Licensing & users" section="general" onNavigate={onNavigate}>
          <Field label="Users" value={<span className="tabular-nums">{usersText}</span>} />
          <Field label="Head office" value={f.is_hq ? 'Yes' : 'No'} />
          <Field label="Description" value={clean(f.description)} />
        </Group>

        <Group label="Database & record" section="advanced" onNavigate={onNavigate}>
          <dt className="text-muted-foreground text-xs">Connection</dt>
          <dd className="flex items-center gap-2 text-[13px]">
            <span className={connected ? 'bg-success size-2 rounded-full' : 'bg-muted-foreground/50 size-2 rounded-full'} />
            {connected ? 'Connected' : 'Not connected'}
          </dd>
          <Field label="Created" value={created ? `${created}${meta.created_by_name ? ` · ${meta.created_by_name}` : ''}` : null} />
          <Field label="Updated" value={updated ? `${updated}${meta.updated_by_name ? ` · ${meta.updated_by_name}` : ''}` : null} />
        </Group>
      </div>
    </Card>
  );
}
