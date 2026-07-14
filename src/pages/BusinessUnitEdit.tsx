import React, { useState, useEffect } from 'react';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import businessUnitService from '../services/businessUnitService';
import clusterService from '../services/clusterService';
import currencyService from '../services/currencyService';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { Save, X, Loader2, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { validateField } from '../utils/validation';
import { getErrorDetail, devLog } from '../utils/errorParser';
import { getDocVersion, isVersionConflict, notifyVersionConflict } from '../utils/docVersion';
import { objectToDbFields, dbFieldsToObject } from '../utils/dbConnection';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { Skeleton } from '../components/ui/skeleton';
import type { Cluster, BusinessUnitConfig, TenantCurrency } from '../types';
import { useAuth } from '../context/AuthContext';
import TenantMigrationCard from '../components/TenantMigrationCard';
import TenantSeedCard from '../components/TenantSeedCard';
import { initialFormData } from './businessUnitEdit/types';
import type { DefaultCurrency, BusinessUnitFormData } from './businessUnitEdit/types';
import { useBusinessUnitUsers } from './businessUnitEdit/useBusinessUnitUsers';
import BusinessUnitBrandingCard from './businessUnitEdit/BusinessUnitBrandingCard';
import BusinessUnitUsersCard from './businessUnitEdit/BusinessUnitUsersCard';
import BusinessUnitDebugSheet from './businessUnitEdit/BusinessUnitDebugSheet';
import BusinessUnitDocument from './businessUnitEdit/BusinessUnitDocument';

const BusinessUnitEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isNew = !id;
  const { isSuperAdmin, hasPermission } = useAuth();

  const [formData, setFormData] = useState<BusinessUnitFormData>({
    ...initialFormData,
    cluster_id: searchParams.get('cluster_id') || '',
  });
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [defaultCurrency, setDefaultCurrency] = useState<DefaultCurrency | null>(null);
  const [currencies, setCurrencies] = useState<TenantCurrency[] | null>(null);
  const [currenciesLoading, setCurrenciesLoading] = useState(false);
  const [currenciesFailed, setCurrenciesFailed] = useState(false);
  const [currenciesLoadedFor, setCurrenciesLoadedFor] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [logoUrl, setLogoUrl] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [savedFormData, setSavedFormData] = useState<BusinessUnitFormData>({
    ...initialFormData,
    cluster_id: searchParams.get('cluster_id') || '',
  });
  const [docVersion, setDocVersion] = useState<number | undefined>(undefined);

  const users = useBusinessUnitUsers(id, formData.cluster_id, isNew);

  // One-document surface: everything is editable in place (no read/edit toggle),
  // gated by permission. Create needs cluster.create; edit needs cluster.update.
  const canEdit = isNew
    ? hasPermission('cluster.create')
    : hasPermission('cluster.update', formData.cluster_id ? { clusterId: formData.cluster_id } : undefined);

  const hasChanges = JSON.stringify(formData) !== JSON.stringify(savedFormData);
  useUnsavedChanges(hasChanges);

  useGlobalShortcuts({
    onSave: () => { if (!saving && (isNew || hasChanges)) handleSave(); },
    onCancel: () => { if (!isNew && hasChanges) handleCancelEdit(); },
  });

  // Discard reverts the whole document back to the last-saved snapshot.
  const handleCancelEdit = () => {
    setFormData(savedFormData);
    setError('');
  };

  // Edit-in-place commits from InlineField / toggles.
  const handleInlineCommit = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError('');
  };
  const handleInlineToggle = (name: string, value: boolean) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError('');
  };
  const handleInlineValidate = (name: string, value: string) => {
    setFieldErrors((prev) => ({ ...prev, [name]: validateField(name, value) }));
  };

  const loadCurrencies = async (buCode: string) => {
    setCurrenciesLoading(true);
    setCurrenciesFailed(false);
    try {
      const list = await currencyService.getForBu(buCode);
      setCurrencies(list);
      setCurrenciesLoadedFor(buCode);
    } catch (err) {
      setCurrenciesFailed(true);
      if (process.env.NODE_ENV === 'development') console.error('loadCurrencies', err);
    } finally {
      setCurrenciesLoading(false);
    }
  };

  useEffect(() => {
    fetchClusters();
    if (!isNew) {
      fetchBusinessUnit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Load the tenant currency list once the existing BU's code is known (fields are
  // always editable now, so the currency dropdown must be ready on load).
  useEffect(() => {
    const buCode = formData.code;
    if (!isNew && buCode && currenciesLoadedFor !== buCode && !currenciesLoading) {
      loadCurrencies(buCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.code, isNew]);

  const fetchClusters = async () => {
    try {
      const data = await clusterService.getAll({ perpage: -1 });
      const items = data.data || data;
      setClusters(Array.isArray(items) ? items : []);
    } catch (err) {
      devLog('Failed to load clusters:', err);
    }
  };

  const toJsonString = (val: unknown, fallback: string): string => {
    if (val === null || val === undefined) return fallback;
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val) || fallback;
  };

  const fetchBusinessUnit = async () => {
    try {
      setLoading(true);
      const data = await businessUnitService.getById(id!);
      setRawResponse(data);
      const bu = data.data || data;
      const defaultFormat = '{"locales":"th-TH","minimumIntegerDigits":2}';
      const loaded: BusinessUnitFormData = {
        cluster_id: bu.cluster_id || '',
        code: bu.code || '',
        name: bu.name || '',
        alias_name: bu.alias_name || '',
        description: bu.description || '',
        is_hq: bu.is_hq ?? false,
        is_active: bu.is_active ?? true,
        max_license_users: bu.max_license_users != null ? String(bu.max_license_users) : '',
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
        db_connection: objectToDbFields(bu.db_connection),
        config: Array.isArray(bu.config) ? bu.config : [],
      };
      setFormData(loaded);
      setSavedFormData(loaded);
      setDocVersion(getDocVersion(bu));
      setLogoUrl(bu.logo?.url || '');
      setAvatarUrl(bu.avatar?.url || '');
      setDefaultCurrency(bu.default_currency || null);
      users.setBuUsers(Array.isArray(bu.users) ? bu.users : []);
    } catch (err: unknown) {
      setError('Failed to load business unit: ' + getErrorDetail(err));
    } finally {
      setLoading(false);
    }
  };

  // Logo/avatar upload via dedicated endpoints; use the returned presigned URL so we
  // don't refetch (which would clobber unsaved form edits).
  const handleUploadLogo = async (file: File) => {
    const res = await businessUnitService.uploadLogo(id!, file);
    setLogoUrl((res?.data?.url ?? res?.url ?? '') as string);
  };

  const handleUploadAvatar = async (file: File) => {
    const res = await businessUnitService.uploadAvatar(id!, file);
    setAvatarUrl((res?.data?.url ?? res?.url ?? '') as string);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
    setError('');
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const error = validateField(name, value);
    setFieldErrors(prev => ({ ...prev, [name]: error }));
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setFieldErrors(prev => ({ ...prev, [e.target.name]: '' }));
  };

  const handleConfigChange = (index: number, field: keyof BusinessUnitConfig, value: string) => {
    setFormData(prev => {
      const updated = [...prev.config];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, config: updated };
    });
  };

  const addConfigRow = () => {
    setFormData(prev => ({
      ...prev,
      config: [...prev.config, { key: '', label: '', datatype: '', value: '' }],
    }));
  };

  const removeConfigRow = (index: number) => {
    setFormData(prev => ({
      ...prev,
      config: prev.config.filter((_, i) => i !== index),
    }));
  };

  const handleDbFieldChange = (key: string, value: string) => {
    setFormData(prev => {
      const fields = [...prev.db_connection];
      const idx = fields.findIndex(f => f.key === key);
      if (idx >= 0) fields[idx] = { ...fields[idx], value };
      else fields.push({ key, value });
      return { ...prev, db_connection: fields };
    });
  };

  const handleDbExtraChange = (index: number, field: 'key' | 'value', value: string) => {
    setFormData(prev => {
      const fields = [...prev.db_connection];
      fields[index] = { ...fields[index], [field]: value };
      return { ...prev, db_connection: fields };
    });
  };

  const addDbExtraRow = () => {
    setFormData(prev => ({ ...prev, db_connection: [...prev.db_connection, { key: '', value: '' }] }));
  };

  const removeDbExtraRow = (index: number) => {
    setFormData(prev => ({ ...prev, db_connection: prev.db_connection.filter((_, i) => i !== index) }));
  };

  const buildPayload = (data: BusinessUnitFormData) => {
    const tryParseJson = (val: string): unknown => {
      if (!val) return undefined;
      try { return JSON.parse(val); } catch { return val; }
    };

    const payload: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(data)) {
      // Always include booleans; skip empty strings
      if (typeof val === 'boolean') {
        payload[key] = val;
      } else if (val !== '' && val !== undefined && val !== null) {
        payload[key] = val;
      }
    }

    // Convert max_license_users to number
    if (data.max_license_users) {
      payload.max_license_users = Number(data.max_license_users);
    } else {
      delete payload.max_license_users;
    }

    // Parse number format fields from JSON strings to objects
    for (const key of ['perpage_format', 'amount_format', 'quantity_format', 'recipe_format'] as const) {
      if (data[key]) {
        payload[key] = tryParseJson(data[key]);
      }
    }

    // db_connection is held as editable fields; serialize back to an object.
    // Omit it entirely when empty (matches the other optional fields).
    const dbConnObj = dbFieldsToObject(data.db_connection);
    if (Object.keys(dbConnObj).length > 0) {
      payload.db_connection = dbConnObj;
    } else {
      delete payload.db_connection;
    }

    // Include config array (filter out empty rows)
    const validConfig = data.config.filter(c => c.key && c.label);
    if (validConfig.length > 0) {
      payload.config = validConfig;
    }

    return payload;
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');

    try {
      const payload = buildPayload(formData);
      if (isNew) {
        // Check cluster license limit before creating
        if (formData.cluster_id) {
          const clusterData = await clusterService.getById(formData.cluster_id);
          const cluster = clusterData.data || clusterData;
          if (cluster.max_license_bu != null) {
            const buData = await businessUnitService.getAll({ perpage: -1, advance: JSON.stringify({ where: { cluster_id: formData.cluster_id } }) });
            const currentCount = (Array.isArray(buData.data) ? buData.data : []).length;
            if (currentCount >= cluster.max_license_bu) {
              setError(`Cannot create business unit: cluster has reached its license limit (${currentCount}/${cluster.max_license_bu})`);
              setSaving(false);
              return;
            }
          }
        }
        const result = await businessUnitService.create(payload);
        const created = result.data || result;
        toast.success('Business unit created successfully');
        if (created?.id) {
          navigate(`/business-units/${created.id}`, { replace: true });
        } else {
          navigate('/business-units');
        }
      } else {
        await businessUnitService.update(id!, { ...payload, ...(docVersion != null ? { doc_version: docVersion } : {}) });
        toast.success('Changes saved successfully');
        await fetchBusinessUnit();
      }
    } catch (err: unknown) {
      if (isVersionConflict(err)) {
        notifyVersionConflict();
        await fetchBusinessUnit();
      } else {
        setError('Failed to save business unit: ' + getErrorDetail(err));
      }
    } finally {
      setSaving(false);
    }
  };

  // Helper to get cluster name from clusters array
  const getClusterName = (clusterId: string): string => {
    const cluster = clusters.find(c => c.id === clusterId);
    return cluster ? cluster.name : clusterId || '-';
  };

  // Helper to get calculation method label
  const getCalculationMethodLabel = (method: string): string => {
    switch (method) {
      case 'average': return 'Average';
      case 'fifo': return 'FIFO';
      default: return '-';
    }
  };

  if (loading) {
    const FieldSkeleton = () => (
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
    const SectionSkeleton: React.FC<{ fields?: number; twoCol?: boolean }> = ({ fields = 4, twoCol = false }) => (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-52 mt-1" />
        </CardHeader>
        <CardContent className="space-y-4">
          {twoCol ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: fields }).map((_, i) => (
                <FieldSkeleton key={i} />
              ))}
            </div>
          ) : (
            Array.from({ length: fields }).map((_, i) => (
              <FieldSkeleton key={i} />
            ))
          )}
        </CardContent>
      </Card>
    );

    return (
      <Layout>
        <div className="space-y-4 sm:space-y-6">
          {/* Header skeleton */}
          <div className="flex items-center gap-3 sm:gap-4">
            <Skeleton className="h-9 w-9 rounded-md" />
            <div className="flex-1">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-64 mt-2" />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[200px_1fr] lg:gap-6">
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
            <div className="space-y-6">
              <SectionSkeleton fields={5} />
              <SectionSkeleton fields={4} twoCol />
              <SectionSkeleton fields={4} twoCol />
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6 pb-24">
        <Link
          to="/business-units"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Business units
        </Link>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">{error}</div>
        )}

        <BusinessUnitDocument
          formData={formData}
          fieldErrors={fieldErrors}
          clusterName={getClusterName(formData.cluster_id)}
          logoUrl={logoUrl}
          avatarUrl={avatarUrl}
          clusters={clusters}
          defaultCurrency={defaultCurrency}
          currencies={currencies}
          currenciesLoading={currenciesLoading}
          currenciesFailed={currenciesFailed}
          getCalculationMethodLabel={getCalculationMethodLabel}
          canEdit={canEdit}
          onCommit={handleInlineCommit}
          onToggle={handleInlineToggle}
          onValidate={handleInlineValidate}
          onChange={handleChange}
          onBlur={handleBlur}
          onFocus={handleFocus}
          onConfigChange={handleConfigChange}
          onAddConfigRow={addConfigRow}
          onRemoveConfigRow={removeConfigRow}
          onDbFieldChange={handleDbFieldChange}
          onDbExtraChange={handleDbExtraChange}
          onAddDbExtraRow={addDbExtraRow}
          onRemoveDbExtraRow={removeDbExtraRow}
          brandingSlot={
            !isNew ? (
              <BusinessUnitBrandingCard
                logoUrl={logoUrl}
                avatarUrl={avatarUrl}
                editing
                onUploadLogo={handleUploadLogo}
                onUploadAvatar={handleUploadAvatar}
              />
            ) : null
          }
          advancedExtraSlot={
            !isNew ? (
              <>
                <TenantMigrationCard
                  key={id}
                  buId={id!}
                  buCode={formData.code}
                  buName={formData.name}
                  hasDbConnection={formData.db_connection.length > 0}
                  isSuperAdmin={isSuperAdmin}
                />
                <TenantSeedCard
                  key={`seed-${id}`}
                  buId={id!}
                  buCode={formData.code}
                  buName={formData.name}
                  hasDbConnection={formData.db_connection.length > 0}
                  isSuperAdmin={isSuperAdmin}
                />
              </>
            ) : null
          }
          usersSlot={!isNew ? <BusinessUnitUsersCard users={users} /> : null}
        />
      </div>

      {(hasChanges || isNew) && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background md:left-16 lg:left-60">
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              {hasChanges ? (
                <>
                  <span className="h-2 w-2 animate-pulse rounded-full bg-warning" />
                  <span>Unsaved changes</span>
                </>
              ) : (
                <span className="text-muted-foreground">No changes</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={isNew ? () => navigate('/business-units') : handleCancelEdit}
                disabled={saving}
              >
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={saving || (!isNew && !hasChanges)}
                onClick={handleSave}
              >
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {saving ? 'Saving...' : isNew ? 'Create Business Unit' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Debug Sheet - Development Only */}
      {!isNew && (
        <BusinessUnitDebugSheet
          rawResponse={rawResponse}
          rawClusterUsersResponse={users.rawClusterUsersResponse}
          id={id}
          clusterId={formData.cluster_id}
          fabClassName={hasChanges || isNew ? 'bottom-20' : undefined}
        />
      )}
    </Layout>
  );
};

export default BusinessUnitEdit;
