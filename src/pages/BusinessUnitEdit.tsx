import React, { useState, useEffect, useRef } from 'react';
import { useGlobalShortcuts } from '../components/KeyboardShortcuts';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import businessUnitService from '../services/businessUnitService';
import clusterService from '../services/clusterService';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '../components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog';
import { ArrowLeft, Save, Code, Copy, Check, ChevronDown, Plus, Trash2, Pencil, X, UserPlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { validateField } from '../utils/validation';
import { getErrorDetail, devLog } from '../utils/errorParser';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { Skeleton } from '../components/ui/skeleton';
import type { Cluster, BusinessUnitConfig } from '../types';

const BU_ROLES = ['admin', 'user'] as const;

interface ClusterUser {
  user_id: string;
  username: string | null;
  email: string | null;
  role: string | null;
  userInfo?: {
    firstname?: string | null;
    lastname?: string | null;
    middlename?: string | null;
  } | null;
}

interface BUUser {
  id: string;
  user_id: string;
  role: string;
  is_default: boolean;
  is_active: boolean;
  username: string | null;
  email: string | null;
  platform_role: string | null;
  user_is_active: boolean | null;
  firstname: string | null;
  middlename: string | null;
  lastname: string | null;
}

interface DefaultCurrency {
  id: string;
  code: string;
  name: string;
  symbol: string;
  description?: string;
  decimal_places?: number;
  is_active?: boolean;
}

interface BusinessUnitFormData {
  cluster_id: string;
  code: string;
  name: string;
  alias_name: string;
  description: string;
  is_hq: boolean;
  is_active: boolean;
  // Hotel Information
  hotel_name: string;
  hotel_tel: string;
  hotel_email: string;
  hotel_address: string;
  hotel_zip_code: string;
  // Company Information
  company_name: string;
  company_tel: string;
  company_email: string;
  company_address: string;
  company_zip_code: string;
  // Tax Information
  tax_no: string;
  branch_no: string;
  // Date/Time Formats
  date_format: string;
  date_time_format: string;
  time_format: string;
  long_time_format: string;
  short_time_format: string;
  timezone: string;
  // Number Formats
  perpage_format: string;
  amount_format: string;
  quantity_format: string;
  recipe_format: string;
  // Calculation Settings
  calculation_method: string;
  default_currency_id: string;
  // Config & Connection
  db_connection: string;
  config: BusinessUnitConfig[];
}

const initialFormData: BusinessUnitFormData = {
  cluster_id: '',
  code: '',
  name: '',
  alias_name: '',
  description: '',
  is_hq: false,
  is_active: true,
  hotel_name: '',
  hotel_tel: '',
  hotel_email: '',
  hotel_address: '',
  hotel_zip_code: '',
  company_name: '',
  company_tel: '',
  company_email: '',
  company_address: '',
  company_zip_code: '',
  tax_no: '',
  branch_no: '',
  date_format: '',
  date_time_format: '',
  time_format: '',
  long_time_format: '',
  short_time_format: '',
  timezone: '',
  perpage_format: '{"default":10}',
  amount_format: '{"locales":"th-TH","minimumIntegerDigits":2}',
  quantity_format: '{"locales":"th-TH","minimumIntegerDigits":2}',
  recipe_format: '{"locales":"th-TH","minimumIntegerDigits":2}',
  calculation_method: '',
  default_currency_id: '',
  db_connection: '',
  config: [],
};

interface CollapsibleSectionProps {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  children: React.ReactNode;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, description, defaultOpen = false, forceOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  const isOpen = forceOpen || open;
  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="cursor-pointer select-none" onClick={() => setOpen(o => !o)}>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
          <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </CardHeader>
      {isOpen && <CardContent className="flex-1">{children}</CardContent>}
    </Card>
  );
};

const ReadOnlyText: React.FC<{ value: string }> = ({ value }) => (
  <div className="flex h-9 w-full rounded-md border border-input bg-muted/50 px-3 py-1 text-sm items-center">{value || '-'}</div>
);

const ReadOnlyTextarea: React.FC<{ value: string }> = ({ value }) => (
  <div className="flex w-full rounded-md border border-input bg-muted/50 px-3 py-2 text-sm min-h-[4.5rem] whitespace-pre-wrap">{value || '-'}</div>
);

const BusinessUnitEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isNew = !id;

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
  const [buUsers, setBuUsers] = useState<BUUser[]>([]);
  const [editingUser, setEditingUser] = useState<BUUser | null>(null);
  const [editUserForm, setEditUserForm] = useState<{ role: string; is_active: boolean }>({ role: '', is_active: true });
  const [savingUser, setSavingUser] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [clusterUsers, setClusterUsers] = useState<ClusterUser[]>([]);
  const [loadingClusterUsers, setLoadingClusterUsers] = useState(false);
  const [addUserRole, setAddUserRole] = useState('user');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [addingUser, setAddingUser] = useState(false);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [rawClusterUsersResponse, setRawClusterUsersResponse] = useState<unknown>(null);
  const [copied, setCopied] = useState(false);
  const [debugTab, setDebugTab] = useState<'bu' | 'users'>('bu');
  const [deleteUser, setDeleteUser] = useState<BUUser | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [savedFormData, setSavedFormData] = useState<BusinessUnitFormData>({
    ...initialFormData,
    cluster_id: searchParams.get('cluster_id') || '',
  });
  const formRef = useRef<HTMLFormElement>(null);

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

  const handleCopyJson = (data: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    fetchClusters();
    if (!isNew) {
      fetchBusinessUnit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Pre-fetch cluster users for debug tab
  useEffect(() => {
    if (!isNew && formData.cluster_id && !rawClusterUsersResponse) {
      clusterService.getClusterUsers(formData.cluster_id)
        .then(data => {
          setRawClusterUsersResponse(data);
          const items: ClusterUser[] = data.data || data;
          setClusterUsers(Array.isArray(items) ? items : []);
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.cluster_id]);

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
        hotel_name: bu.hotel_name || '',
        hotel_tel: bu.hotel_tel || '',
        hotel_email: bu.hotel_email || '',
        hotel_address: bu.hotel_address || '',
        hotel_zip_code: bu.hotel_zip_code || '',
        company_name: bu.company_name || '',
        company_tel: bu.company_tel || '',
        company_email: bu.company_email || '',
        company_address: bu.company_address || '',
        company_zip_code: bu.company_zip_code || '',
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
        db_connection: toJsonString(bu.db_connection, ''),
        config: Array.isArray(bu.config) ? bu.config : [],
      };
      setFormData(loaded);
      setSavedFormData(loaded);
      setDefaultCurrency(bu.default_currency || null);
      setBuUsers(Array.isArray(bu.users) ? bu.users : []);
    } catch (err: unknown) {
      setError('Failed to load business unit: ' + getErrorDetail(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = (user: BUUser) => {
    setDeleteUser(user);
  };

  const handleConfirmDeleteUser = async () => {
    if (!deleteUser) return;
    try {
      await businessUnitService.deleteUserBusinessUnit(deleteUser.id);
      toast.success('User removed from business unit');
      setBuUsers(prev => prev.filter(u => u.id !== deleteUser.id));
      setDeleteUser(null);
    } catch (err: unknown) {
      toast.error('Failed to remove user', { description: getErrorDetail(err) });
    }
  };

  const handleOpenEditUser = (user: BUUser) => {
    setEditingUser(user);
    setEditUserForm({ role: user.role || 'user', is_active: user.is_active });
  };

  const handleSaveEditUser = async () => {
    if (!editingUser) return;
    setSavingUser(true);
    try {
      await businessUnitService.updateUserBusinessUnit(editingUser.id, editUserForm);
      toast.success('User role updated successfully');
      setBuUsers(prev => prev.map(u => u.id === editingUser.id ? { ...u, ...editUserForm } : u));
      setEditingUser(null);
    } catch (err: unknown) {
      toast.error('Failed to update user', { description: getErrorDetail(err) });
    } finally {
      setSavingUser(false);
    }
  };

  const handleOpenAddUser = async () => {
    setShowAddUser(true);
    setSelectedUserId('');
    setAddUserRole('user');
    if (!formData.cluster_id) return;
    setLoadingClusterUsers(true);
    try {
      const data = await clusterService.getClusterUsers(formData.cluster_id);
      setRawClusterUsersResponse(data);
      const items: ClusterUser[] = data.data || data;
      setClusterUsers(Array.isArray(items) ? items : []);
    } catch {
      setClusterUsers([]);
    } finally {
      setLoadingClusterUsers(false);
    }
  };

  const availableClusterUsers = clusterUsers.filter(
    cu => cu.user_id && !buUsers.some(bu => bu.user_id === cu.user_id)
  );

  const handleAddUser = async () => {
    if (!selectedUserId || !id) return;
    setAddingUser(true);
    try {
      await businessUnitService.createUserBusinessUnit({
        user_id: selectedUserId,
        business_unit_id: id,
        role: addUserRole,
      });
      setShowAddUser(false);
      toast.success('User added to business unit');
      await fetchBusinessUnit();
    } catch (err: unknown) {
      toast.error('Failed to add user', { description: getErrorDetail(err) });
    } finally {
      setAddingUser(false);
    }
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

    // Parse number format fields from JSON strings to objects
    for (const key of ['perpage_format', 'amount_format', 'quantity_format', 'recipe_format'] as const) {
      if (data[key]) {
        payload[key] = tryParseJson(data[key]);
      }
    }

    // Parse db_connection from JSON string to object
    if (data.db_connection) {
      payload.db_connection = tryParseJson(data.db_connection);
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
        const result = await businessUnitService.create(payload);
        const created = result.data || result;
        toast.success('Business unit created successfully');
        if (created?.id) {
          navigate(`/business-units/${created.id}`, { replace: true });
        } else {
          navigate('/business-units');
        }
      } else {
        await businessUnitService.update(id!, payload);
        toast.success('Changes saved successfully');
        await fetchBusinessUnit();
        setEditing(false);
      }
    } catch (err: unknown) {
      setError('Failed to save business unit: ' + getErrorDetail(err));
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

  const selectClassName = "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex items-center gap-3 sm:gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/business-units')} aria-label="Back to business units">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {isNew ? 'Add Business Unit' : editing ? 'Edit Business Unit' : 'Business Unit Details'}
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
              {isNew ? 'Create a new business unit' : editing ? 'Update business unit information' : 'View business unit information'}
            </p>
          </div>
          {!isNew && !editing && (
            <Button variant="outline" size="sm" onClick={handleEditToggle}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
          )}
        </div>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md" role="alert">{error}</div>
        )}

        <form ref={formRef} onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
          {/* Section 1: Basic Information */}
          <CollapsibleSection title="Basic Information" description="Core business unit details" defaultOpen={true} forceOpen>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cluster_id">Cluster {editing && '*'}</Label>
                {editing ? (
                  <select
                    id="cluster_id"
                    name="cluster_id"
                    value={formData.cluster_id}
                    onChange={handleChange}
                    required
                    className={selectClassName}
                  >
                    <option value="">Select a cluster</option>
                    {clusters.map((cluster) => (
                      <option key={cluster.id} value={cluster.id}>
                        {cluster.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <ReadOnlyText value={getClusterName(formData.cluster_id)} />
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="code">Code {editing && '*'}</Label>
                  {editing ? (
                    <>
                      <Input
                        type="text"
                        id="code"
                        name="code"
                        value={formData.code}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        onFocus={handleFocus}
                        placeholder="Business unit code"
                        className={fieldErrors.code ? 'border-destructive' : ''}
                        required
                      />
                      {fieldErrors.code && (
                        <p className="text-xs text-destructive">{fieldErrors.code}</p>
                      )}
                    </>
                  ) : (
                    <ReadOnlyText value={formData.code} />
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Name {editing && '*'}</Label>
                  {editing ? (
                    <Input
                      type="text"
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      placeholder="Business unit name"
                      required
                    />
                  ) : (
                    <ReadOnlyText value={formData.name} />
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="alias_name">Alias Name</Label>
                {editing ? (
                  <Input
                    type="text"
                    id="alias_name"
                    name="alias_name"
                    value={formData.alias_name}
                    onChange={handleChange}
                    placeholder="Alias name (optional)"
                  />
                ) : (
                  <ReadOnlyText value={formData.alias_name} />
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                {editing ? (
                  <textarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    rows={3}
                    placeholder="Business unit description (optional)"
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                ) : (
                  <ReadOnlyTextarea value={formData.description} />
                )}
              </div>

              <div className="flex items-center gap-4">
                {editing ? (
                  <>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="is_hq"
                        name="is_hq"
                        checked={formData.is_hq}
                        onChange={handleChange}
                        className="h-4 w-4 rounded border-input"
                      />
                      <Label htmlFor="is_hq">Headquarters (HQ)</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="is_active"
                        name="is_active"
                        checked={formData.is_active}
                        onChange={handleChange}
                        className="h-4 w-4 rounded border-input"
                      />
                      <Label htmlFor="is_active">Active</Label>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <Label>Headquarters (HQ)</Label>
                      <Badge variant={formData.is_hq ? 'success' : 'secondary'} className="ml-1">
                        {formData.is_hq ? 'Yes' : 'No'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label>Status</Label>
                      <Badge variant={formData.is_active ? 'success' : 'secondary'} className="ml-1">
                        {formData.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  </>
                )}
              </div>
            </div>
          </CollapsibleSection>

          {/* Section 2: Hotel Information */}
          <CollapsibleSection title="Hotel Information" description="Hotel contact and address details" forceOpen>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="hotel_name">Hotel Name</Label>
                {editing ? (
                  <Input
                    type="text"
                    id="hotel_name"
                    name="hotel_name"
                    value={formData.hotel_name}
                    onChange={handleChange}
                    placeholder="Hotel name"
                  />
                ) : (
                  <ReadOnlyText value={formData.hotel_name} />
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="hotel_tel">Telephone</Label>
                  {editing ? (
                    <>
                      <Input
                        type="text"
                        id="hotel_tel"
                        name="hotel_tel"
                        value={formData.hotel_tel}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        onFocus={handleFocus}
                        placeholder="Hotel telephone"
                        className={fieldErrors.hotel_tel ? 'border-destructive' : ''}
                      />
                      {fieldErrors.hotel_tel && (
                        <p className="text-xs text-destructive">{fieldErrors.hotel_tel}</p>
                      )}
                    </>
                  ) : (
                    <ReadOnlyText value={formData.hotel_tel} />
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hotel_email">Email</Label>
                  {editing ? (
                    <>
                      <Input
                        type="text"
                        id="hotel_email"
                        name="hotel_email"
                        value={formData.hotel_email}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        onFocus={handleFocus}
                        placeholder="Hotel email"
                        className={fieldErrors.hotel_email ? 'border-destructive' : ''}
                      />
                      {fieldErrors.hotel_email && (
                        <p className="text-xs text-destructive">{fieldErrors.hotel_email}</p>
                      )}
                    </>
                  ) : (
                    <ReadOnlyText value={formData.hotel_email} />
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="hotel_address">Address</Label>
                {editing ? (
                  <textarea
                    id="hotel_address"
                    name="hotel_address"
                    value={formData.hotel_address}
                    onChange={handleChange}
                    rows={3}
                    placeholder="Hotel address"
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                ) : (
                  <ReadOnlyTextarea value={formData.hotel_address} />
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="hotel_zip_code">Zip Code</Label>
                {editing ? (
                  <Input
                    type="text"
                    id="hotel_zip_code"
                    name="hotel_zip_code"
                    value={formData.hotel_zip_code}
                    onChange={handleChange}
                    placeholder="Hotel zip code"
                  />
                ) : (
                  <ReadOnlyText value={formData.hotel_zip_code} />
                )}
              </div>
            </div>
          </CollapsibleSection>

          {/* Section 3: Company Information */}
          <CollapsibleSection title="Company Information" description="Company contact and address details" forceOpen>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="company_name">Company Name</Label>
                {editing ? (
                  <Input
                    type="text"
                    id="company_name"
                    name="company_name"
                    value={formData.company_name}
                    onChange={handleChange}
                    placeholder="Company name"
                  />
                ) : (
                  <ReadOnlyText value={formData.company_name} />
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="company_tel">Telephone</Label>
                  {editing ? (
                    <>
                      <Input
                        type="text"
                        id="company_tel"
                        name="company_tel"
                        value={formData.company_tel}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        onFocus={handleFocus}
                        placeholder="Company telephone"
                        className={fieldErrors.company_tel ? 'border-destructive' : ''}
                      />
                      {fieldErrors.company_tel && (
                        <p className="text-xs text-destructive">{fieldErrors.company_tel}</p>
                      )}
                    </>
                  ) : (
                    <ReadOnlyText value={formData.company_tel} />
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company_email">Email</Label>
                  {editing ? (
                    <>
                      <Input
                        type="text"
                        id="company_email"
                        name="company_email"
                        value={formData.company_email}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        onFocus={handleFocus}
                        placeholder="Company email"
                        className={fieldErrors.company_email ? 'border-destructive' : ''}
                      />
                      {fieldErrors.company_email && (
                        <p className="text-xs text-destructive">{fieldErrors.company_email}</p>
                      )}
                    </>
                  ) : (
                    <ReadOnlyText value={formData.company_email} />
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="company_address">Address</Label>
                {editing ? (
                  <textarea
                    id="company_address"
                    name="company_address"
                    value={formData.company_address}
                    onChange={handleChange}
                    rows={3}
                    placeholder="Company address"
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                ) : (
                  <ReadOnlyTextarea value={formData.company_address} />
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="company_zip_code">Zip Code</Label>
                {editing ? (
                  <Input
                    type="text"
                    id="company_zip_code"
                    name="company_zip_code"
                    value={formData.company_zip_code}
                    onChange={handleChange}
                    placeholder="Company zip code"
                  />
                ) : (
                  <ReadOnlyText value={formData.company_zip_code} />
                )}
              </div>
            </div>
          </CollapsibleSection>

          {/* Section 4: Tax Information */}
          <CollapsibleSection title="Tax Information" description="Tax and branch registration details" forceOpen>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="tax_no">Tax No.</Label>
                {editing ? (
                  <Input
                    type="text"
                    id="tax_no"
                    name="tax_no"
                    value={formData.tax_no}
                    onChange={handleChange}
                    placeholder="Tax number"
                  />
                ) : (
                  <ReadOnlyText value={formData.tax_no} />
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="branch_no">Branch No.</Label>
                {editing ? (
                  <Input
                    type="text"
                    id="branch_no"
                    name="branch_no"
                    value={formData.branch_no}
                    onChange={handleChange}
                    placeholder="Branch number"
                  />
                ) : (
                  <ReadOnlyText value={formData.branch_no} />
                )}
              </div>
            </div>
          </CollapsibleSection>

          {/* Section 5: Date/Time Formats */}
          <CollapsibleSection title="Date/Time Formats" description="Date, time, and timezone configuration" forceOpen>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="date_format">Date Format</Label>
                  {editing ? (
                    <Input
                      type="text"
                      id="date_format"
                      name="date_format"
                      value={formData.date_format}
                      onChange={handleChange}
                      placeholder="e.g. YYYY-MM-DD"
                    />
                  ) : (
                    <ReadOnlyText value={formData.date_format} />
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="date_time_format">Date/Time Format</Label>
                  {editing ? (
                    <Input
                      type="text"
                      id="date_time_format"
                      name="date_time_format"
                      value={formData.date_time_format}
                      onChange={handleChange}
                      placeholder="e.g. YYYY-MM-DD HH:mm:ss"
                    />
                  ) : (
                    <ReadOnlyText value={formData.date_time_format} />
                  )}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="time_format">Time Format</Label>
                  {editing ? (
                    <Input
                      type="text"
                      id="time_format"
                      name="time_format"
                      value={formData.time_format}
                      onChange={handleChange}
                      placeholder="e.g. HH:mm:ss"
                    />
                  ) : (
                    <ReadOnlyText value={formData.time_format} />
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="long_time_format">Long Time Format</Label>
                  {editing ? (
                    <Input
                      type="text"
                      id="long_time_format"
                      name="long_time_format"
                      value={formData.long_time_format}
                      onChange={handleChange}
                      placeholder="e.g. HH:mm:ss.SSS"
                    />
                  ) : (
                    <ReadOnlyText value={formData.long_time_format} />
                  )}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="short_time_format">Short Time Format</Label>
                  {editing ? (
                    <Input
                      type="text"
                      id="short_time_format"
                      name="short_time_format"
                      value={formData.short_time_format}
                      onChange={handleChange}
                      placeholder="e.g. HH:mm"
                    />
                  ) : (
                    <ReadOnlyText value={formData.short_time_format} />
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  {editing ? (
                    <Input
                      type="text"
                      id="timezone"
                      name="timezone"
                      value={formData.timezone}
                      onChange={handleChange}
                      placeholder="e.g. Asia/Bangkok"
                    />
                  ) : (
                    <ReadOnlyText value={formData.timezone} />
                  )}
                </div>
              </div>
            </div>
          </CollapsibleSection>

          {/* Section 6: Number Formats */}
          <CollapsibleSection title="Number Formats" description="Numeric display format configuration" forceOpen>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="perpage_format">Per Page Format</Label>
                {editing ? (
                  <Input
                    type="text"
                    id="perpage_format"
                    name="perpage_format"
                    value={formData.perpage_format}
                    onChange={handleChange}
                    placeholder='{"default":10}'
                  />
                ) : (
                  <ReadOnlyText value={formData.perpage_format} />
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount_format">Amount Format</Label>
                {editing ? (
                  <Input
                    type="text"
                    id="amount_format"
                    name="amount_format"
                    value={formData.amount_format}
                    onChange={handleChange}
                    placeholder='{"locales":"th-TH","minimumIntegerDigits":2}'
                  />
                ) : (
                  <ReadOnlyText value={formData.amount_format} />
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="quantity_format">Quantity Format</Label>
                {editing ? (
                  <Input
                    type="text"
                    id="quantity_format"
                    name="quantity_format"
                    value={formData.quantity_format}
                    onChange={handleChange}
                    placeholder='{"locales":"th-TH","minimumIntegerDigits":2}'
                  />
                ) : (
                  <ReadOnlyText value={formData.quantity_format} />
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="recipe_format">Recipe Format</Label>
                {editing ? (
                  <Input
                    type="text"
                    id="recipe_format"
                    name="recipe_format"
                    value={formData.recipe_format}
                    onChange={handleChange}
                    placeholder='{"locales":"th-TH","minimumIntegerDigits":2}'
                  />
                ) : (
                  <ReadOnlyText value={formData.recipe_format} />
                )}
              </div>
            </div>
          </CollapsibleSection>

          {/* Section 7: Calculation Settings */}
          <CollapsibleSection title="Calculation Settings" description="Calculation method and currency configuration" forceOpen>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="calculation_method">Calculation Method</Label>
                  {editing ? (
                    <select
                      id="calculation_method"
                      name="calculation_method"
                      value={formData.calculation_method}
                      onChange={handleChange}
                      className={selectClassName}
                    >
                      <option value="">Select method</option>
                      <option value="average">Average</option>
                      <option value="fifo">FIFO</option>
                    </select>
                  ) : (
                    <ReadOnlyText value={getCalculationMethodLabel(formData.calculation_method)} />
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="default_currency_id">Default Currency ID</Label>
                  {editing ? (
                    <Input
                      type="text"
                      id="default_currency_id"
                      name="default_currency_id"
                      value={formData.default_currency_id}
                      onChange={handleChange}
                      placeholder="Default currency ID"
                    />
                  ) : (
                    <ReadOnlyText value={formData.default_currency_id} />
                  )}
                </div>
              </div>
              {!editing && defaultCurrency && (
                <div className="rounded-md border p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Default Currency</span>
                    <Badge variant={defaultCurrency.is_active ? 'success' : 'secondary'} className="text-[10px]">
                      {defaultCurrency.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground">Code</span>
                      <div className="text-sm font-medium">{defaultCurrency.code || '-'}</div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground">Name</span>
                      <div className="text-sm">{defaultCurrency.name || '-'}</div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground">Symbol</span>
                      <div className="text-sm">{defaultCurrency.symbol || '-'}</div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground">Decimal Places</span>
                      <div className="text-sm">{defaultCurrency.decimal_places ?? '-'}</div>
                    </div>
                  </div>
                  {defaultCurrency.description && (
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground">Description</span>
                      <div className="text-sm">{defaultCurrency.description}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CollapsibleSection>

          {/* Section 8: Configuration */}
          <CollapsibleSection title="Configuration" description="Key-value configuration entries" forceOpen>
            <div className="space-y-4">
              {editing ? (
                <>
                  {formData.config.map((item, index) => (
                    <div key={index} className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] items-end border-b pb-4 sm:border-0 sm:pb-0">
                      <div className="space-y-2">
                        <Label>Key *</Label>
                        <Input
                          type="text"
                          value={item.key}
                          onChange={(e) => handleConfigChange(index, 'key', e.target.value)}
                          placeholder="Config key"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Label *</Label>
                        <Input
                          type="text"
                          value={item.label}
                          onChange={(e) => handleConfigChange(index, 'label', e.target.value)}
                          placeholder="Config label"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Data Type</Label>
                        <select
                          value={item.datatype || ''}
                          onChange={(e) => handleConfigChange(index, 'datatype', e.target.value)}
                          className={selectClassName}
                        >
                          <option value="">Select type</option>
                          <option value="string">String</option>
                          <option value="number">Number</option>
                          <option value="boolean">Boolean</option>
                          <option value="date">Date</option>
                          <option value="json">JSON</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label>Value</Label>
                        <Input
                          type="text"
                          value={typeof item.value === 'object' ? JSON.stringify(item.value) : String(item.value ?? '')}
                          onChange={(e) => handleConfigChange(index, 'value', e.target.value)}
                          placeholder="Config value"
                        />
                      </div>
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeConfigRow(index)} className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={addConfigRow}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Config Entry
                  </Button>
                </>
              ) : (
                <>
                  {formData.config.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No configuration entries.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="text-left font-medium px-4 py-2">Key</th>
                            <th className="text-left font-medium px-4 py-2">Label</th>
                            <th className="text-left font-medium px-4 py-2">Type</th>
                            <th className="text-left font-medium px-4 py-2">Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {formData.config.map((item, index) => (
                            <tr key={index} className="border-b last:border-0">
                              <td className="px-4 py-2">{item.key || '-'}</td>
                              <td className="px-4 py-2">{item.label || '-'}</td>
                              <td className="px-4 py-2">{item.datatype || '-'}</td>
                              <td className="px-4 py-2">{typeof item.value === 'object' ? JSON.stringify(item.value) : String(item.value ?? '-')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          </CollapsibleSection>

          {/* Section 9: Database Connection */}
          <CollapsibleSection title="Database Connection" description="Database connection configuration (JSON)" forceOpen>
            <div className="space-y-2">
              <Label htmlFor="db_connection">Connection Config</Label>
              <pre className={`w-full rounded-md border border-input px-3 py-2 text-sm font-mono min-h-[4.5rem] whitespace-pre-wrap break-all overflow-auto max-h-60 ${editing ? 'bg-transparent' : 'bg-muted/50'}`}>
                {formData.db_connection ? (() => { try { return JSON.stringify(JSON.parse(formData.db_connection), null, 2); } catch { return formData.db_connection; } })() : '-'}
              </pre>
            </div>
          </CollapsibleSection>

          {/* Submit Buttons */}
          {editing && (
            <div className="flex gap-3 pt-2 lg:col-span-2">
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {saving ? 'Saving...' : isNew ? 'Create Business Unit' : 'Save Changes'}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={isNew ? () => navigate('/business-units') : handleCancelEdit}>
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            </div>
          )}
        </form>

        {/* Users in this Business Unit */}
        {!isNew && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Users</CardTitle>
                  <CardDescription>
                    <span className="flex items-center gap-2 mt-0.5">
                      <Badge variant="success" className="text-[10px] px-1.5 py-0">{buUsers.filter(u => u.is_active).length} Active</Badge>
                      <span className="text-muted-foreground text-xs">of {buUsers.length} total</span>
                    </span>
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={handleOpenAddUser}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Add User
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {buUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No users assigned yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-center font-medium px-4 py-2 w-10">#</th>
                        <th className="text-left font-medium px-4 py-2">Username</th>
                        <th className="text-left font-medium px-4 py-2">Name</th>
                        <th className="text-left font-medium px-4 py-2">Email</th>
                        <th className="text-left font-medium px-4 py-2">BU Role</th>
                        <th className="text-left font-medium px-4 py-2">Platform Role</th>
                        <th className="text-center font-medium px-4 py-2">BU Status</th>
                        <th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {buUsers.map((u, idx) => (
                        <tr key={u.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="px-4 py-2 text-center text-muted-foreground">{idx + 1}</td>
                          <td className="px-4 py-2">
                            <span
                              className="cursor-pointer text-primary hover:underline"
                              onClick={() => navigate(`/users/${u.user_id}/edit`)}
                            >
                              {u.username || '-'}
                            </span>
                          </td>
                          <td className="px-4 py-2">
                            {[u.firstname, u.middlename, u.lastname].filter(Boolean).join(' ') || '-'}
                          </td>
                          <td className="px-4 py-2">{u.email || '-'}</td>
                          <td className="px-4 py-2">
                            <Badge variant="outline" className="capitalize text-xs">
                              {u.role || '-'}
                            </Badge>
                          </td>
                          <td className="px-4 py-2">
                            <Badge variant="outline" className="capitalize text-xs">
                              {u.platform_role?.replace(/_/g, ' ') || '-'}
                            </Badge>
                          </td>
                          <td className="px-4 py-2 text-center">
                            <Badge variant={u.is_active ? 'success' : 'secondary'} className="text-xs">
                              {u.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </td>
                          <td className="px-4 py-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleOpenEditUser(u)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDeleteUser(u)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Edit User BU Dialog */}
              <Dialog open={!!editingUser} onOpenChange={(open) => { if (!open) setEditingUser(null); }}>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Edit User in Business Unit</DialogTitle>
                    <DialogDescription>
                      {editingUser && (
                        <span>{editingUser.username} — {[editingUser.firstname, editingUser.middlename, editingUser.lastname].filter(Boolean).join(' ') || editingUser.email}</span>
                      )}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <div className="space-y-2">
                      <Label>BU Role</Label>
                      <select
                        value={editUserForm.role}
                        onChange={(e) => setEditUserForm(prev => ({ ...prev, role: e.target.value }))}
                        className={selectClassName}
                      >
                        {BU_ROLES.map((r) => (
                          <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>BU Status</Label>
                      <select
                        value={editUserForm.is_active ? 'true' : 'false'}
                        onChange={(e) => setEditUserForm(prev => ({ ...prev, is_active: e.target.value === 'true' }))}
                        className={selectClassName}
                      >
                        <option value="true">Active</option>
                        <option value="false">Inactive</option>
                      </select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" size="sm" onClick={() => setEditingUser(null)}>Cancel</Button>
                    <Button size="sm" onClick={handleSaveEditUser} disabled={savingUser}>
                      <Save className="mr-2 h-4 w-4" />
                      {savingUser ? 'Saving...' : 'Save'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <ConfirmDialog
                open={deleteUser !== null}
                onOpenChange={(open) => { if (!open) setDeleteUser(null); }}
                title="Remove User"
                description={`Are you sure you want to remove "${deleteUser ? ([deleteUser.firstname, deleteUser.middlename, deleteUser.lastname].filter(Boolean).join(' ') || deleteUser.username || deleteUser.email || 'this user') : ''}" from this business unit?`}
                confirmText="Remove"
                confirmVariant="destructive"
                onConfirm={handleConfirmDeleteUser}
              />

              {/* Add User Dialog */}
              <Dialog open={showAddUser} onOpenChange={setShowAddUser}>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Add User to Business Unit</DialogTitle>
                    <DialogDescription>Select a user from the cluster to add</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    {loadingClusterUsers ? (
                      <p className="text-sm text-muted-foreground">Loading cluster users...</p>
                    ) : availableClusterUsers.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No available users in this cluster to add.</p>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <Label>User</Label>
                          <select
                            value={selectedUserId}
                            onChange={(e) => setSelectedUserId(e.target.value)}
                            className={selectClassName}
                          >
                            <option value="">Select a user</option>
                            {availableClusterUsers.map((cu) => (
                              <option key={cu.user_id} value={cu.user_id}>
                                {cu.username || cu.email} — {[cu.userInfo?.firstname, cu.userInfo?.middlename, cu.userInfo?.lastname].filter(Boolean).join(' ') || ''}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label>BU Role</Label>
                          <select
                            value={addUserRole}
                            onChange={(e) => setAddUserRole(e.target.value)}
                            className={selectClassName}
                          >
                            {BU_ROLES.map((r) => (
                              <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}
                  </div>
                  <DialogFooter>
                    <Button variant="outline" size="sm" onClick={() => setShowAddUser(false)}>Cancel</Button>
                    <Button size="sm" onClick={handleAddUser} disabled={addingUser || !selectedUserId}>
                      <UserPlus className="mr-2 h-4 w-4" />
                      {addingUser ? 'Adding...' : 'Add User'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Debug Sheet - Development Only */}
      {process.env.NODE_ENV === 'development' && !isNew && !!(rawResponse || rawClusterUsersResponse) && (
        <Sheet>
          <SheetTrigger asChild>
            <Button
              size="icon"
              className="fixed right-4 bottom-4 z-50 h-10 w-10 rounded-full bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/30"
            >
              <Code className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full sm:max-w-lg md:max-w-xl lg:max-w-2xl overflow-y-auto p-4 sm:p-6">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Code className="h-4 w-4 sm:h-5 sm:w-5" />
                API Responses
                <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">DEV</Badge>
              </SheetTitle>
              <SheetDescription className="text-xs sm:text-sm">Raw JSON responses from all endpoints</SheetDescription>
            </SheetHeader>
            <div className="mt-3 sm:mt-4">
              <div className="flex border-b mb-3 sm:mb-4 overflow-x-auto">
                <button
                  onClick={() => setDebugTab('bu')}
                  className={`px-2 sm:px-3 py-1.5 sm:py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${debugTab === 'bu' ? 'border-amber-500 text-amber-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                >
                  Business Unit
                </button>
                <button
                  onClick={() => setDebugTab('users')}
                  className={`px-2 sm:px-3 py-1.5 sm:py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${debugTab === 'users' ? 'border-amber-500 text-amber-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                >
                  Cluster Users
                </button>
              </div>

              {debugTab === 'bu' && (
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-medium text-muted-foreground truncate">{`GET /api-system/business-unit/${id}`}</span>
                    <Button variant="outline" size="sm" className="self-end sm:self-auto" onClick={() => handleCopyJson(rawResponse)}>
                      {copied ? <Check className="mr-1.5 h-3 w-3" /> : <Copy className="mr-1.5 h-3 w-3" />}
                      {copied ? 'Copied!' : 'Copy'}
                    </Button>
                  </div>
                  <pre className="text-[10px] sm:text-xs bg-gray-900 text-green-400 p-3 sm:p-4 rounded-lg overflow-auto max-h-[60vh] sm:max-h-[70vh]">
                    {rawResponse ? JSON.stringify(rawResponse, null, 2) : 'No data'}
                  </pre>
                </div>
              )}
              {debugTab === 'users' && (
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-medium text-muted-foreground truncate">{`GET /api-system/user/cluster/${formData.cluster_id}`}</span>
                    <Button variant="outline" size="sm" className="self-end sm:self-auto" onClick={() => handleCopyJson(rawClusterUsersResponse)}>
                      {copied ? <Check className="mr-1.5 h-3 w-3" /> : <Copy className="mr-1.5 h-3 w-3" />}
                      {copied ? 'Copied!' : 'Copy'}
                    </Button>
                  </div>
                  <pre className="text-[10px] sm:text-xs bg-gray-900 text-green-400 p-3 sm:p-4 rounded-lg overflow-auto max-h-[60vh] sm:max-h-[70vh]">
                    {rawClusterUsersResponse ? JSON.stringify(rawClusterUsersResponse, null, 2) : 'No data'}
                  </pre>
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </Layout>
  );
};

export default BusinessUnitEdit;
