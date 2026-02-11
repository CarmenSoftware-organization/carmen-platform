import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import businessUnitService from '../services/businessUnitService';
import clusterService from '../services/clusterService';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '../components/ui/sheet';
import { ArrowLeft, Save, Code, Copy, Check, ChevronDown, Plus, Trash2 } from 'lucide-react';
import type { Cluster, BusinessUnitConfig } from '../types';

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
  children: React.ReactNode;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, description, defaultOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <CardHeader className="cursor-pointer select-none" onClick={() => setOpen(o => !o)}>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
          <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </CardHeader>
      {open && <CardContent>{children}</CardContent>}
    </Card>
  );
};

const BusinessUnitEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id;

  const [formData, setFormData] = useState<BusinessUnitFormData>({ ...initialFormData });
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [copied, setCopied] = useState(false);

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

  const fetchClusters = async () => {
    try {
      const data = await clusterService.getAll({ perpage: -1 });
      const items = data.data || data;
      setClusters(Array.isArray(items) ? items : []);
    } catch (err) {
      console.error('Failed to load clusters:', err);
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
      setFormData({
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
      });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      setError('Failed to load business unit: ' + (e.response?.data?.message || e.message));
    } finally {
      setLoading(false);
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
        await businessUnitService.create(payload);
      } else {
        await businessUnitService.update(id!, payload);
      }
      navigate('/business-units');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      setError('Failed to save business unit: ' + (e.response?.data?.message || e.message));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{isNew ? 'Add Business Unit' : 'Edit Business Unit'}</h1>
            <p className="text-muted-foreground mt-2">Loading...</p>
          </div>
        </div>
      </Layout>
    );
  }

  const selectClassName = "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/business-units')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{isNew ? 'Add Business Unit' : 'Edit Business Unit'}</h1>
            <p className="text-muted-foreground mt-2">
              {isNew ? 'Create a new business unit' : 'Update business unit information'}
            </p>
          </div>
        </div>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 max-w-4xl">
          {/* Section 1: Basic Information */}
          <CollapsibleSection title="Basic Information" description="Core business unit details" defaultOpen={true}>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cluster_id">Cluster *</Label>
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
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="code">Code *</Label>
                  <Input
                    type="text"
                    id="code"
                    name="code"
                    value={formData.code}
                    onChange={handleChange}
                    placeholder="Business unit code"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="Business unit name"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="alias_name">Alias Name</Label>
                <Input
                  type="text"
                  id="alias_name"
                  name="alias_name"
                  value={formData.alias_name}
                  onChange={handleChange}
                  placeholder="Alias name (optional)"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Business unit description (optional)"
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              <div className="flex items-center gap-4">
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
              </div>
            </div>
          </CollapsibleSection>

          {/* Section 2: Hotel Information */}
          <CollapsibleSection title="Hotel Information" description="Hotel contact and address details">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="hotel_name">Hotel Name</Label>
                <Input
                  type="text"
                  id="hotel_name"
                  name="hotel_name"
                  value={formData.hotel_name}
                  onChange={handleChange}
                  placeholder="Hotel name"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="hotel_tel">Telephone</Label>
                  <Input
                    type="text"
                    id="hotel_tel"
                    name="hotel_tel"
                    value={formData.hotel_tel}
                    onChange={handleChange}
                    placeholder="Hotel telephone"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hotel_email">Email</Label>
                  <Input
                    type="text"
                    id="hotel_email"
                    name="hotel_email"
                    value={formData.hotel_email}
                    onChange={handleChange}
                    placeholder="Hotel email"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="hotel_address">Address</Label>
                <textarea
                  id="hotel_address"
                  name="hotel_address"
                  value={formData.hotel_address}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Hotel address"
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hotel_zip_code">Zip Code</Label>
                <Input
                  type="text"
                  id="hotel_zip_code"
                  name="hotel_zip_code"
                  value={formData.hotel_zip_code}
                  onChange={handleChange}
                  placeholder="Hotel zip code"
                />
              </div>
            </div>
          </CollapsibleSection>

          {/* Section 3: Company Information */}
          <CollapsibleSection title="Company Information" description="Company contact and address details">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="company_name">Company Name</Label>
                <Input
                  type="text"
                  id="company_name"
                  name="company_name"
                  value={formData.company_name}
                  onChange={handleChange}
                  placeholder="Company name"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="company_tel">Telephone</Label>
                  <Input
                    type="text"
                    id="company_tel"
                    name="company_tel"
                    value={formData.company_tel}
                    onChange={handleChange}
                    placeholder="Company telephone"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company_email">Email</Label>
                  <Input
                    type="text"
                    id="company_email"
                    name="company_email"
                    value={formData.company_email}
                    onChange={handleChange}
                    placeholder="Company email"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="company_address">Address</Label>
                <textarea
                  id="company_address"
                  name="company_address"
                  value={formData.company_address}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Company address"
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company_zip_code">Zip Code</Label>
                <Input
                  type="text"
                  id="company_zip_code"
                  name="company_zip_code"
                  value={formData.company_zip_code}
                  onChange={handleChange}
                  placeholder="Company zip code"
                />
              </div>
            </div>
          </CollapsibleSection>

          {/* Section 4: Tax Information */}
          <CollapsibleSection title="Tax Information" description="Tax and branch registration details">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="tax_no">Tax No.</Label>
                <Input
                  type="text"
                  id="tax_no"
                  name="tax_no"
                  value={formData.tax_no}
                  onChange={handleChange}
                  placeholder="Tax number"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="branch_no">Branch No.</Label>
                <Input
                  type="text"
                  id="branch_no"
                  name="branch_no"
                  value={formData.branch_no}
                  onChange={handleChange}
                  placeholder="Branch number"
                />
              </div>
            </div>
          </CollapsibleSection>

          {/* Section 5: Date/Time Formats */}
          <CollapsibleSection title="Date/Time Formats" description="Date, time, and timezone configuration">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="date_format">Date Format</Label>
                  <Input
                    type="text"
                    id="date_format"
                    name="date_format"
                    value={formData.date_format}
                    onChange={handleChange}
                    placeholder="e.g. YYYY-MM-DD"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="date_time_format">Date/Time Format</Label>
                  <Input
                    type="text"
                    id="date_time_format"
                    name="date_time_format"
                    value={formData.date_time_format}
                    onChange={handleChange}
                    placeholder="e.g. YYYY-MM-DD HH:mm:ss"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="time_format">Time Format</Label>
                  <Input
                    type="text"
                    id="time_format"
                    name="time_format"
                    value={formData.time_format}
                    onChange={handleChange}
                    placeholder="e.g. HH:mm:ss"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="long_time_format">Long Time Format</Label>
                  <Input
                    type="text"
                    id="long_time_format"
                    name="long_time_format"
                    value={formData.long_time_format}
                    onChange={handleChange}
                    placeholder="e.g. HH:mm:ss.SSS"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="short_time_format">Short Time Format</Label>
                  <Input
                    type="text"
                    id="short_time_format"
                    name="short_time_format"
                    value={formData.short_time_format}
                    onChange={handleChange}
                    placeholder="e.g. HH:mm"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Input
                    type="text"
                    id="timezone"
                    name="timezone"
                    value={formData.timezone}
                    onChange={handleChange}
                    placeholder="e.g. Asia/Bangkok"
                  />
                </div>
              </div>
            </div>
          </CollapsibleSection>

          {/* Section 6: Number Formats */}
          <CollapsibleSection title="Number Formats" description="Numeric display format configuration">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="perpage_format">Per Page Format</Label>
                <Input
                  type="text"
                  id="perpage_format"
                  name="perpage_format"
                  value={formData.perpage_format}
                  onChange={handleChange}
                  placeholder='{"default":10}'
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount_format">Amount Format</Label>
                <Input
                  type="text"
                  id="amount_format"
                  name="amount_format"
                  value={formData.amount_format}
                  onChange={handleChange}
                  placeholder='{"locales":"th-TH","minimumIntegerDigits":2}'
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quantity_format">Quantity Format</Label>
                <Input
                  type="text"
                  id="quantity_format"
                  name="quantity_format"
                  value={formData.quantity_format}
                  onChange={handleChange}
                  placeholder='{"locales":"th-TH","minimumIntegerDigits":2}'
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="recipe_format">Recipe Format</Label>
                <Input
                  type="text"
                  id="recipe_format"
                  name="recipe_format"
                  value={formData.recipe_format}
                  onChange={handleChange}
                  placeholder='{"locales":"th-TH","minimumIntegerDigits":2}'
                />
              </div>
            </div>
          </CollapsibleSection>

          {/* Section 7: Calculation Settings */}
          <CollapsibleSection title="Calculation Settings" description="Calculation method and currency configuration">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="calculation_method">Calculation Method</Label>
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
              </div>
              <div className="space-y-2">
                <Label htmlFor="default_currency_id">Default Currency ID</Label>
                <Input
                  type="text"
                  id="default_currency_id"
                  name="default_currency_id"
                  value={formData.default_currency_id}
                  onChange={handleChange}
                  placeholder="Default currency ID"
                />
              </div>
            </div>
          </CollapsibleSection>

          {/* Section 8: Configuration */}
          <CollapsibleSection title="Configuration" description="Key-value configuration entries">
            <div className="space-y-4">
              {formData.config.map((item, index) => (
                <div key={index} className="grid gap-4 sm:grid-cols-[1fr_1fr_1fr_1fr_auto] items-end">
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
            </div>
          </CollapsibleSection>

          {/* Section 9: Database Connection */}
          <CollapsibleSection title="Database Connection" description="Database connection configuration (JSON)">
            <div className="space-y-2">
              <Label htmlFor="db_connection">Connection Config</Label>
              <textarea
                id="db_connection"
                name="db_connection"
                value={formData.db_connection}
                onChange={handleChange}
                rows={6}
                placeholder='{"host":"localhost","port":5432,"database":"mydb","username":"user","password":"pass"}'
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </CollapsibleSection>

          {/* Submit Buttons */}
          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Saving...' : isNew ? 'Create Business Unit' : 'Save Changes'}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate('/business-units')}>
              Cancel
            </Button>
          </div>
        </form>
      </div>

      {/* Debug Sheet - Development Only */}
      {process.env.NODE_ENV === 'development' && !isNew && !!rawResponse && (
        <Sheet>
          <SheetTrigger asChild>
            <Button
              size="icon"
              className="fixed right-4 bottom-4 z-50 h-10 w-10 rounded-full bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/30"
            >
              <Code className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <Code className="h-5 w-5" />
                API Response
                <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">DEV</Badge>
              </SheetTitle>
              <SheetDescription>
                {`GET /api-system/business-unit/${id}`}
              </SheetDescription>
            </SheetHeader>
            <div className="mt-4">
              <div className="flex justify-end mb-2">
                <Button variant="outline" size="sm" onClick={() => handleCopyJson(rawResponse)}>
                  {copied ? <Check className="mr-2 h-3 w-3" /> : <Copy className="mr-2 h-3 w-3" />}
                  {copied ? 'Copied!' : 'Copy JSON'}
                </Button>
              </div>
              <pre className="text-xs bg-gray-900 text-green-400 p-4 rounded-lg overflow-auto max-h-[calc(100vh-10rem)]">
                {JSON.stringify(rawResponse, null, 2)}
              </pre>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </Layout>
  );
};

export default BusinessUnitEdit;
