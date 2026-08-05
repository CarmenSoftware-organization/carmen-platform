import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Pencil, Save, X, Loader2, Copy } from 'lucide-react';
import ClusterAdminLayout from '../../components/ClusterAdminLayout';
import ClusterAccessLost from './ClusterAccessLost';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';
import { DevDebugSheet } from '../../components/ui/dev-debug-sheet';
import businessUnitService from '../../services/businessUnitService';
import { validateField } from '../../utils/validation';
import { getErrorDetail, parseApiError } from '../../utils/errorParser';
import { getDocVersion, isVersionConflict, notifyVersionConflict } from '../../utils/docVersion';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { useGlobalShortcuts } from '../../components/KeyboardShortcuts';
import { cn } from '../../lib/utils';
import { ReadOnlyText, ReadOnlyTextarea, AddrField } from '../businessUnitEdit/shared';
import { initialFormData, type BusinessUnitFormData, type DefaultCurrency } from '../businessUnitEdit/types';
import CalculationSettingsSection from '../businessUnitEdit/sections/CalculationSettingsSection';
import NumberFormatsSection from '../businessUnitEdit/sections/NumberFormatsSection';
import ConfigurationSection from '../businessUnitEdit/sections/ConfigurationSection';
import BusinessUnitBrandingCard from '../businessUnitEdit/BusinessUnitBrandingCard';
import type { BusinessUnitConfig } from '../../types';

// Text-valued fields eligible for the generic edit/read-only field renderer below.
// Booleans (is_hq/is_active), arrays (db_connection/config), and the fields this narrowed
// page never exposes (cluster_id comes from the URL only; max_license_users is a platform
// decision; code is a system identifier this view no longer surfaces — it still loads from
// the API and still ships in the save payload, see fetchBusinessUnit/buildPayload below,
// it just never renders) are excluded so the compiler — not just convention — stops any of
// them from being wired into a text input here.
type TextFieldName = Exclude<
  keyof BusinessUnitFormData,
  'is_hq' | 'is_active' | 'db_connection' | 'config' | 'cluster_id' | 'max_license_users' | 'code'
>;

/**
 * A cluster administrator's reach into one business unit — a narrowed Edit-only page (see
 * ClusterProfile.tsx for the canonical orchestration this mirrors, and BusinessUnitEdit.tsx +
 * businessUnitEdit/sections/ for the full platform-admin form this is scoped down from).
 * There is no create path here: `buId` is always present (the route only matches
 * `/cluster-admin/:clusterId/business-units/:buId/edit`), and creating a BU consumes
 * `max_license_bu`, which is a platform decision — see the 2026-08-05 cluster-admin-layout
 * spec's B5 and the 2026-08-06 addendum removing BU create from this view.
 *
 * Three things are deliberately absent:
 * - The DB-connection section: `GET .../reveal-db-connection` is gated on a platform
 *   permission and 403s here, so the page never reads or writes `db_connection`.
 * - `max_license_users`: a platform decision, consistent with licensing being read-only
 *   on the cluster page.
 * - The BU-users card: membership is managed on the Users page, not here.
 */
const BusinessUnitForm: React.FC = () => {
  const { clusterId, buId } = useParams<{ clusterId: string; buId: string }>();
  const navigate = useNavigate();

  const [formData, setFormData] = useState<BusinessUnitFormData>({ ...initialFormData, cluster_id: clusterId ?? '' });
  const [savedFormData, setSavedFormData] = useState<BusinessUnitFormData>({ ...initialFormData, cluster_id: clusterId ?? '' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [logoUrl, setLogoUrl] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [defaultCurrency, setDefaultCurrency] = useState<DefaultCurrency | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [accessLost, setAccessLost] = useState(false);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [docVersion, setDocVersion] = useState<number | undefined>(undefined);

  const hasChanges = editing && JSON.stringify(formData) !== JSON.stringify(savedFormData);
  useUnsavedChanges(hasChanges);

  useGlobalShortcuts({
    onSave: () => { if (!saving && hasChanges) void handleSave(); },
    onCancel: () => { if (editing) handleCancel(); },
  });

  useEffect(() => {
    fetchBusinessUnit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buId]);

  const toJsonString = (val: unknown, fallback: string): string => {
    if (val === null || val === undefined) return fallback;
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val) || fallback;
  };

  const fetchBusinessUnit = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await businessUnitService.getById(buId!);
      setRawResponse(data);
      const bu = data.data || data;
      // A stale bookmark or hand-edited URL can name the wrong cluster for this BU
      // (/cluster-admin/<A>/business-units/<B's BU>/edit). Every piece of chrome — sidebar,
      // ClusterSwitcher label, breadcrumbs — keys off the URL's :clusterId, not the loaded
      // record, so leaving the URL as-is renders this BU under the wrong cluster's shell.
      // Correct the URL in place; the rest of this function still runs so the page has data
      // to show immediately instead of sitting on a stale loading state.
      if (bu.cluster_id && bu.cluster_id !== clusterId) {
        navigate(`/cluster-admin/${bu.cluster_id}/business-units/${buId}/edit`, { replace: true });
      }
      const defaultFormat = '{"locales":"th-TH","minimumIntegerDigits":2}';
      const loaded: BusinessUnitFormData = {
        ...initialFormData,
        cluster_id: bu.cluster_id || clusterId || '',
        code: bu.code || '',
        name: bu.name || '',
        alias_name: bu.alias_name || '',
        description: bu.description || '',
        is_hq: bu.is_hq ?? false,
        is_active: bu.is_active ?? true,
        hotel_name: bu.hotel_name || '',
        hotel_tel: bu.hotel_tel || '',
        hotel_email: bu.hotel_email || '',
        hotel_address_line1: bu.hotel_address_line1 || '',
        hotel_address_line2: bu.hotel_address_line2 || '',
        hotel_sub_district: bu.hotel_sub_district || '',
        hotel_district: bu.hotel_district || '',
        hotel_city: bu.hotel_city || '',
        hotel_province: bu.hotel_province || '',
        hotel_postal_code: bu.hotel_postal_code || '',
        hotel_country: bu.hotel_country || '',
        hotel_latitude: bu.hotel_latitude || '',
        hotel_longitude: bu.hotel_longitude || '',
        company_name: bu.company_name || '',
        company_tel: bu.company_tel || '',
        company_email: bu.company_email || '',
        company_address_line1: bu.company_address_line1 || '',
        company_address_line2: bu.company_address_line2 || '',
        company_sub_district: bu.company_sub_district || '',
        company_district: bu.company_district || '',
        company_city: bu.company_city || '',
        company_province: bu.company_province || '',
        company_postal_code: bu.company_postal_code || '',
        company_country: bu.company_country || '',
        company_latitude: bu.company_latitude || '',
        company_longitude: bu.company_longitude || '',
        tax_no: bu.tax_no || '',
        branch_no: bu.branch_no || '',
        date_format: bu.date_format || '',
        date_time_format: bu.date_time_format || '',
        time_format: bu.time_format || '',
        long_time_format: bu.long_time_format || '',
        short_time_format: bu.short_time_format || '',
        timezone: bu.timezone || '',
        perpage_format: toJsonString(bu.perpage_format, defaultFormat),
        amount_format: toJsonString(bu.amount_format, defaultFormat),
        quantity_format: toJsonString(bu.quantity_format, defaultFormat),
        recipe_format: toJsonString(bu.recipe_format, defaultFormat),
        calculation_method: bu.calculation_method || '',
        default_currency_id: bu.default_currency_id || '',
        config: Array.isArray(bu.config) ? bu.config : [],
        // max_license_users / db_connection intentionally left at their initialFormData
        // defaults ('' / []) — this page never reads or writes either.
      };
      setFormData(loaded);
      setSavedFormData(loaded);
      setDocVersion(getDocVersion(bu));
      setLogoUrl(bu.logo?.url || '');
      setAvatarUrl(bu.avatar?.url || '');
      setDefaultCurrency(bu.default_currency || null);
      setAccessLost(false);
    } catch (err: unknown) {
      // A 403 here means the admin membership was revoked while this page was open. Same guard
      // as BusinessUnitList.tsx / ClusterUsers.tsx.
      if ((err as { response?: { status?: number } })?.response?.status === 403) {
        setError('');
        setAccessLost(true);
        return;
      }
      setError('Failed to load business unit: ' + getErrorDetail(err));
    } finally {
      setLoading(false);
    }
  };

  const handleUploadLogo = async (file: File) => {
    const res = await businessUnitService.uploadLogo(buId!, file);
    setLogoUrl((res?.data?.url ?? res?.url ?? '') as string);
  };

  const handleUploadAvatar = async (file: File) => {
    const res = await businessUnitService.uploadAvatar(buId!, file);
    setAvatarUrl((res?.data?.url ?? res?.url ?? '') as string);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
    setError('');
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFieldErrors((prev) => ({ ...prev, [name]: validateField(name, value) }));
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFieldErrors((prev) => ({ ...prev, [e.target.name]: '' }));
  };

  const handleConfigChange = (index: number, field: keyof BusinessUnitConfig, value: string) => {
    setFormData((prev) => {
      const updated = [...prev.config];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, config: updated };
    });
  };

  const addConfigRow = () => {
    setFormData((prev) => ({ ...prev, config: [...prev.config, { key: '', label: '', datatype: '', value: '' }] }));
  };

  const removeConfigRow = (index: number) => {
    setFormData((prev) => ({ ...prev, config: prev.config.filter((_, i) => i !== index) }));
  };

  // One-way copy: hotel address -> company address, same as the platform page.
  const copyHotelAddressToCompany = () => {
    setFormData((prev) => ({
      ...prev,
      company_address_line1: prev.hotel_address_line1,
      company_address_line2: prev.hotel_address_line2,
      company_sub_district: prev.hotel_sub_district,
      company_district: prev.hotel_district,
      company_city: prev.hotel_city,
      company_province: prev.hotel_province,
      company_postal_code: prev.hotel_postal_code,
      company_country: prev.hotel_country,
      company_latitude: prev.hotel_latitude,
      company_longitude: prev.hotel_longitude,
    }));
    toast.success('Copied hotel address to company address');
  };

  const getCalculationMethodLabel = (method: string): string => {
    switch (method) {
      case 'average': return 'Average';
      case 'fifo': return 'FIFO';
      default: return '-';
    }
  };

  const handleEditToggle = () => {
    setSavedFormData(formData);
    setEditing(true);
  };

  // Discard edits and drop back to view mode.
  const handleCancel = () => {
    setFormData(savedFormData);
    setFieldErrors({});
    setError('');
    setEditing(false);
  };

  // Backend requires code + name; cluster_id is guaranteed by the route guard, not a
  // form field, so it needs no client-side check here.
  //
  // The code check below is kept even though this page no longer renders a Code field —
  // formData.code is populated only from the API response now, never by a user, so in
  // practice this branch is unreachable today. It stays as a defensive guard rather than
  // being deleted: buildPayload() below drops any '' value from the save payload, so a
  // blank code (a malformed load, or a future change to fetchBusinessUnit) would otherwise
  // omit a backend-required field from update() silently and surface as an opaque 400
  // instead of this page's normal inline-validation toast.
  const validateRequired = (): boolean => {
    const errs: Record<string, string> = {};
    if (!formData.code.trim()) errs.code = 'Code is required';
    else errs.code = validateField('code', formData.code);
    if (!formData.name.trim()) errs.name = 'Name is required';
    const active = Object.fromEntries(Object.entries(errs).filter(([, v]) => v));
    setFieldErrors((prev) => ({ ...prev, ...errs }));
    if (Object.keys(active).length > 0) {
      toast.error('Please fix the highlighted fields', { description: Object.values(active).join(', ') });
      return false;
    }
    return true;
  };

  // cluster_id, max_license_users, and db_connection are never sent to the backend:
  // the first is immutable on update (the record's cluster is fixed), the other two are
  // platform-only concerns this page does not expose.
  const buildPayload = (data: BusinessUnitFormData): Record<string, unknown> => {
    const tryParseJson = (val: string): unknown => {
      if (!val) return undefined;
      try { return JSON.parse(val); } catch { return val; }
    };

    const payload: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(data)) {
      if (key === 'cluster_id' || key === 'max_license_users' || key === 'db_connection') continue;
      if (typeof val === 'boolean') {
        payload[key] = val;
      } else if (val !== '' && val !== undefined && val !== null) {
        payload[key] = val;
      }
    }

    for (const key of ['perpage_format', 'amount_format', 'quantity_format', 'recipe_format'] as const) {
      if (data[key]) payload[key] = tryParseJson(data[key]);
    }

    const validConfig = data.config.filter((c) => c.key && c.label);
    if (validConfig.length > 0) payload.config = validConfig;
    else delete payload.config;

    return payload;
  };

  const handleSave = async () => {
    if (!validateRequired()) return;
    setSaving(true);
    try {
      const payload = buildPayload(formData);
      await businessUnitService.update(buId!, {
        ...payload,
        ...(docVersion != null ? { doc_version: docVersion } : {}),
      });
      toast.success('Changes saved successfully');
      setEditing(false);
      await fetchBusinessUnit();
    } catch (err: unknown) {
      if (isVersionConflict(err)) {
        notifyVersionConflict();
        await fetchBusinessUnit();
      } else {
        const { message, fields } = parseApiError(err);
        toast.error('Failed to update business unit', { description: message });
        if (fields) setFieldErrors(fields);
      }
    } finally {
      setSaving(false);
    }
  };

  const sectionField = { formData, editing, fieldErrors, onChange: handleChange, onBlur: handleBlur, onFocus: handleFocus };

  // Generic edit/read-only renderer for the plain text fields (Form Field Pattern).
  const textField = (
    name: TextFieldName,
    label: string,
    opts?: { type?: 'text' | 'email'; mono?: boolean; required?: boolean; textarea?: boolean },
  ) => {
    const value = formData[name];
    const err = fieldErrors[name];
    return (
      <div className="space-y-2">
        <Label htmlFor={name}>
          {label}
          {opts?.required && editing && <span className="text-destructive ml-0.5">*</span>}
        </Label>
        {editing ? (
          opts?.textarea ? (
            <Textarea
              id={name}
              name={name}
              value={value}
              onChange={handleChange}
              onBlur={handleBlur}
              onFocus={handleFocus}
              rows={3}
              className={err ? 'border-destructive' : ''}
            />
          ) : (
            <Input
              type={opts?.type ?? 'text'}
              id={name}
              name={name}
              value={value}
              onChange={handleChange}
              onBlur={handleBlur}
              onFocus={handleFocus}
              className={cn(err && 'border-destructive', opts?.mono && 'font-mono')}
            />
          )
        ) : opts?.textarea ? (
          <ReadOnlyTextarea value={value} />
        ) : (
          <ReadOnlyText value={value} />
        )}
        {err && <p className="text-xs text-destructive">{err}</p>}
      </div>
    );
  };

  const addrField = (id: TextFieldName, label: string) => (
    <AddrField id={id} label={label} placeholder={label} value={formData[id]} editing={editing} onChange={handleChange} />
  );

  const isHqField = (
    <div className="space-y-2">
      <Label htmlFor="is_hq">Headquarters</Label>
      {editing ? (
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" id="is_hq" name="is_hq" checked={formData.is_hq} onChange={handleChange} className="h-4 w-4 rounded border-input" />
          <span className="text-sm">This is the HQ business unit</span>
        </label>
      ) : (
        <div>
          <Badge variant={formData.is_hq ? 'default' : 'secondary'}>{formData.is_hq ? 'HQ' : 'Not HQ'}</Badge>
        </div>
      )}
    </div>
  );

  const isActiveField = (
    <div className="space-y-2">
      <Label htmlFor="is_active">Status</Label>
      {editing ? (
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" id="is_active" name="is_active" checked={formData.is_active} onChange={handleChange} className="h-4 w-4 rounded border-input" />
          <span className="text-sm">Active</span>
        </label>
      ) : (
        <div>
          <Badge variant={formData.is_active ? 'success' : 'secondary'}>{formData.is_active ? 'Active' : 'Inactive'}</Badge>
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <ClusterAdminLayout>
        <div className="space-y-4 sm:space-y-6" role="status" aria-label="Loading business unit">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-64 mt-2" />
            </div>
            <Skeleton className="h-9 w-20" />
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-48 mt-1" />
              </CardHeader>
              <CardContent className="space-y-4">
                {Array.from({ length: 4 }).map((_, j) => (
                  <div key={j} className="space-y-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-9 w-full" />
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </ClusterAdminLayout>
    );
  }

  return (
    <ClusterAdminLayout>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          backTo={`/cluster-admin/${clusterId}/business-units`}
          title={formData.name || '(unnamed business unit)'}
          subtitle="Manage this business unit's details"
          actions={
            editing ? (
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={handleCancel} disabled={saving}>
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
                <Button type="button" size="sm" onClick={() => void handleSave()} disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            ) : (
              <Button type="button" size="sm" onClick={handleEditToggle}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Button>
            )
          }
        />

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">{error}</div>
        )}

        {!error && (accessLost ? <ClusterAccessLost /> : (
          <>
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
            <CardDescription>Identity for this business unit</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {textField('name', 'Name', { required: true })}
              {textField('alias_name', 'Alias', { mono: true })}
            </div>
            {textField('description', 'Description', { textarea: true })}
            <div className="grid gap-4 sm:grid-cols-2">
              {isHqField}
              {isActiveField}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hotel information</CardTitle>
            <CardDescription>Property details and address</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {textField('hotel_name', 'Hotel name')}
              {textField('hotel_tel', 'Phone', { mono: true })}
              {textField('hotel_email', 'Email', { type: 'email' })}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {addrField('hotel_address_line1', 'Address line 1')}
              {addrField('hotel_address_line2', 'Address line 2')}
              {addrField('hotel_sub_district', 'Sub-district')}
              {addrField('hotel_district', 'District')}
              {addrField('hotel_city', 'City')}
              {addrField('hotel_province', 'Province')}
              {addrField('hotel_postal_code', 'Postal code')}
              {addrField('hotel_country', 'Country')}
              {addrField('hotel_latitude', 'Latitude')}
              {addrField('hotel_longitude', 'Longitude')}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div>
              <CardTitle>Company information</CardTitle>
              <CardDescription>Billing entity, tax details, and address</CardDescription>
            </div>
            {editing && (
              <Button type="button" variant="ghost" size="sm" onClick={copyHotelAddressToCompany}>
                <Copy className="mr-2 h-4 w-4" />
                Copy from hotel address
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {textField('company_name', 'Company name')}
              {textField('company_tel', 'Phone', { mono: true })}
              {textField('company_email', 'Email', { type: 'email' })}
              {textField('tax_no', 'Tax ID', { mono: true })}
              {textField('branch_no', 'Branch', { mono: true })}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {addrField('company_address_line1', 'Address line 1')}
              {addrField('company_address_line2', 'Address line 2')}
              {addrField('company_sub_district', 'Sub-district')}
              {addrField('company_district', 'District')}
              {addrField('company_city', 'City')}
              {addrField('company_province', 'Province')}
              {addrField('company_postal_code', 'Postal code')}
              {addrField('company_country', 'Country')}
              {addrField('company_latitude', 'Latitude')}
              {addrField('company_longitude', 'Longitude')}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Date & time</CardTitle>
            <CardDescription>Locale formatting for this business unit</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {textField('timezone', 'Timezone')}
              {textField('date_format', 'Date format', { mono: true })}
              {textField('date_time_format', 'Date-time format', { mono: true })}
              {textField('time_format', 'Time format', { mono: true })}
              {textField('long_time_format', 'Long time format', { mono: true })}
              {textField('short_time_format', 'Short time format', { mono: true })}
            </div>
          </CardContent>
        </Card>

        <CalculationSettingsSection
          {...sectionField}
          defaultCurrency={defaultCurrency}
          getCalculationMethodLabel={getCalculationMethodLabel}
          showCurrencyField={false}
          canEditCalculationMethod={false}
        />
        <NumberFormatsSection {...sectionField} />
        <ConfigurationSection
          {...sectionField}
          onConfigChange={handleConfigChange}
          onAddConfigRow={addConfigRow}
          onRemoveConfigRow={removeConfigRow}
        />
        <BusinessUnitBrandingCard
          logoUrl={logoUrl}
          avatarUrl={avatarUrl}
          editing={editing}
          onUploadLogo={handleUploadLogo}
          onUploadAvatar={handleUploadAvatar}
        />
          </>
        ))}
      </div>

      <DevDebugSheet
        title="Business Unit Debug"
        tabs={[
          { key: 'bu', label: 'Business Unit', data: rawResponse, endpoint: `GET /api-system/business-units/${buId}` },
        ]}
      />
    </ClusterAdminLayout>
  );
};

export default BusinessUnitForm;
