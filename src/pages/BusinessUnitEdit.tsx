import React, { useState, useEffect, useRef } from 'react';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';
import businessUnitService from '../services/businessUnitService';
import clusterService from '../services/clusterService';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { Pencil } from 'lucide-react';
import { toast } from 'sonner';
import Can from '../components/Can';
import { validateField } from '../utils/validation';
import { getErrorDetail, devLog } from '../utils/errorParser';
import { getDocVersion, isVersionConflict, notifyVersionConflict } from '../utils/docVersion';
import { objectToDbFields, dbFieldsToObject } from '../utils/dbConnection';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { Skeleton } from '../components/ui/skeleton';
import type { Cluster, BusinessUnitConfig } from '../types';
import { useAuth } from '../context/AuthContext';
import TenantMigrationCard from '../components/TenantMigrationCard';
import TenantSeedCard from '../components/TenantSeedCard';
import { initialFormData } from './businessUnitEdit/types';
import type { DefaultCurrency, BusinessUnitFormData } from './businessUnitEdit/types';
import { useBusinessUnitUsers } from './businessUnitEdit/useBusinessUnitUsers';
import BusinessUnitBrandingCard from './businessUnitEdit/BusinessUnitBrandingCard';
import BusinessUnitUsersCard from './businessUnitEdit/BusinessUnitUsersCard';
import BusinessUnitDebugSheet from './businessUnitEdit/BusinessUnitDebugSheet';
import BusinessUnitFormFields from './businessUnitEdit/BusinessUnitFormFields';

const BusinessUnitEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isNew = !id;
  const { isSuperAdmin } = useAuth();

  const [formData, setFormData] = useState<BusinessUnitFormData>({
    ...initialFormData,
    cluster_id: searchParams.get('cluster_id') || '',
  });
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [editing, setEditing] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [defaultCurrency, setDefaultCurrency] = useState<DefaultCurrency | null>(null);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [logoUrl, setLogoUrl] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [savedFormData, setSavedFormData] = useState<BusinessUnitFormData>({
    ...initialFormData,
    cluster_id: searchParams.get('cluster_id') || '',
  });
  const [docVersion, setDocVersion] = useState<number | undefined>(undefined);
  const formRef = useRef<HTMLFormElement>(null);

  const users = useBusinessUnitUsers(id, formData.cluster_id, isNew);

  const hasChanges = editing && JSON.stringify(formData) !== JSON.stringify(savedFormData);
  useUnsavedChanges(hasChanges);

  useGlobalShortcuts({
    onSave: () => { if (editing && !saving) formRef.current?.requestSubmit(); },
    onCancel: () => { if (editing && !isNew) handleCancelEdit(); },
  });

  const handleEditToggle = () => {
    setSavedFormData(formData);
    setEditing(true);
  };

  const handleCancelEdit = () => {
    setFormData(savedFormData);
    setEditing(false);
    setError('');
  };

  useEffect(() => {
    fetchClusters();
    if (!isNew) {
      fetchBusinessUnit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
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
        setEditing(false);
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
            {/* Basic Information */}
            <SectionSkeleton fields={5} />
            {/* Hotel Information */}
            <SectionSkeleton fields={5} />
            {/* Company Information */}
            <SectionSkeleton fields={5} />
            {/* Tax Information */}
            <SectionSkeleton fields={2} twoCol />
            {/* Date/Time Formats */}
            <SectionSkeleton fields={6} twoCol />
            {/* Number Formats */}
            <SectionSkeleton fields={4} twoCol />
            {/* Calculation Settings */}
            <SectionSkeleton fields={2} twoCol />
            {/* Configuration */}
            <SectionSkeleton fields={3} />
            {/* Database Connection */}
            <Card>
              <CardHeader>
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-56 mt-1" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-28 mb-2" />
                <Skeleton className="h-[4.5rem] w-full" />
              </CardContent>
            </Card>
          </div>

          {/* Users Card */}
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-4 w-36 mt-1" />
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <div className="w-full">
                  <div className="border-b">
                    <div className="flex gap-4 px-4 py-3">
                      {Array.from({ length: 7 }).map((_, i) => (
                        <Skeleton key={i} className="h-4 flex-1" />
                      ))}
                    </div>
                  </div>
                  {Array.from({ length: 3 }).map((_, rowIdx) => (
                    <div key={rowIdx} className="flex gap-4 px-4 py-3 border-b last:border-0">
                      {Array.from({ length: 7 }).map((_, colIdx) => (
                        <Skeleton key={colIdx} className="h-4 flex-1" />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          backTo="/business-units"
          title={isNew ? 'Add Business Unit' : editing ? 'Edit Business Unit' : 'Business Unit Details'}
          subtitle={isNew ? 'Create a new business unit' : editing ? 'Update business unit information' : 'View business unit information'}
          actions={!isNew && !editing && (
            <Can permission="cluster.update" clusterId={formData.cluster_id || undefined}>
              <Button variant="outline" size="sm" onClick={handleEditToggle}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Button>
            </Can>
          )}
        />

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">{error}</div>
        )}

        <BusinessUnitFormFields
          formData={formData}
          editing={editing}
          fieldErrors={fieldErrors}
          onChange={handleChange}
          onBlur={handleBlur}
          onFocus={handleFocus}
          clusters={clusters}
          getClusterName={getClusterName}
          defaultCurrency={defaultCurrency}
          getCalculationMethodLabel={getCalculationMethodLabel}
          onConfigChange={handleConfigChange}
          onAddConfigRow={addConfigRow}
          onRemoveConfigRow={removeConfigRow}
          onDbFieldChange={handleDbFieldChange}
          onDbExtraChange={handleDbExtraChange}
          onAddDbExtraRow={addDbExtraRow}
          onRemoveDbExtraRow={removeDbExtraRow}
          formRef={formRef}
          onSubmit={handleSubmit}
          saving={saving}
          isNew={isNew}
          onCancel={isNew ? () => navigate('/business-units') : handleCancelEdit}
        />

        {/* Tenant database migrations (existing BU only; super-admin action) */}
        {!isNew && (
          <TenantMigrationCard
            key={id}
            buId={id!}
            buCode={formData.code}
            buName={formData.name}
            hasDbConnection={formData.db_connection.length > 0}
            isSuperAdmin={isSuperAdmin}
          />
        )}

        {/* Tenant default-data seeding (existing BU only; super-admin action) */}
        {!isNew && (
          <TenantSeedCard
            key={`seed-${id}`}
            buId={id!}
            buCode={formData.code}
            buName={formData.name}
            hasDbConnection={formData.db_connection.length > 0}
            isSuperAdmin={isSuperAdmin}
          />
        )}

        {/* Branding: logo / avatar (existing BU only — uploaded via dedicated endpoints) */}
        {!isNew && (
          <BusinessUnitBrandingCard
            logoUrl={logoUrl}
            avatarUrl={avatarUrl}
            editing={editing}
            onUploadLogo={handleUploadLogo}
            onUploadAvatar={handleUploadAvatar}
          />
        )}

        {/* Users in this Business Unit */}
        {!isNew && <BusinessUnitUsersCard users={users} />}
      </div>

      {/* Debug Sheet - Development Only */}
      {!isNew && (
        <BusinessUnitDebugSheet
          rawResponse={rawResponse}
          rawClusterUsersResponse={users.rawClusterUsersResponse}
          id={id}
          clusterId={formData.cluster_id}
        />
      )}
    </Layout>
  );
};

export default BusinessUnitEdit;
