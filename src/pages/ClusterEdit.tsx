import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import clusterService from '../services/clusterService';
import businessUnitService from '../services/businessUnitService';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '../components/ui/sheet';
import { ArrowLeft, Save, Code, Copy, Check, Pencil, Building2, Users, RefreshCw } from 'lucide-react';
import api from '../services/api';
import type { BusinessUnit, User } from '../types';

interface ClusterFormData {
  code: string;
  name: string;
  description: string;
  is_active: boolean;
}

const ClusterEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id;

  const [formData, setFormData] = useState<ClusterFormData>({
    code: '',
    name: '',
    description: '',
    is_active: true,
  });
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [rawBuResponse, setRawBuResponse] = useState<unknown>(null);
  const [rawUsersResponse, setRawUsersResponse] = useState<unknown>(null);
  const [copied, setCopied] = useState(false);
  const [debugTab, setDebugTab] = useState<'cluster' | 'bu' | 'users'>('cluster');
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [buLoading, setBuLoading] = useState(false);
  const [clusterUsers, setClusterUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  const handleCopyJson = (data: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    if (!isNew) {
      fetchCluster();
      fetchBusinessUnits();
      fetchClusterUsers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchCluster = async () => {
    try {
      setLoading(true);
      const data = await clusterService.getById(id!);
      setRawResponse(data);
      const cluster = data.data || data;
      setFormData({
        code: cluster.code || '',
        name: cluster.name || '',
        description: cluster.description || '',
        is_active: cluster.is_active ?? true,
      });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      setError('Failed to load cluster: ' + (e.response?.data?.message || e.message));
    } finally {
      setLoading(false);
    }
  };

  const fetchBusinessUnits = async () => {
    try {
      setBuLoading(true);
      const data = await businessUnitService.getAll({ perpage: -1 });
      setRawBuResponse(data);
      const items = data.data || data;
      const allBus: BusinessUnit[] = Array.isArray(items) ? items : [];
      setBusinessUnits(allBus.filter(bu => bu.cluster_id === id));
    } catch (err) {
      console.error('Failed to load business units:', err);
    } finally {
      setBuLoading(false);
    }
  };

  const fetchClusterUsers = async () => {
    try {
      setUsersLoading(true);
      const response = await api.get(`/api-system/user/cluster/${id}`);
      const data = response.data;
      setRawUsersResponse(data);
      const items = data.data || data;
      setClusterUsers(Array.isArray(items) ? items : []);
    } catch (err) {
      console.error('Failed to load cluster users:', err);
    } finally {
      setUsersLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      if (isNew) {
        await clusterService.create(formData);
      } else {
        await clusterService.update(id!, formData);
      }
      navigate('/clusters');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      setError('Failed to save cluster: ' + (e.response?.data?.message || e.message));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{isNew ? 'Add Cluster' : 'Edit Cluster'}</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">Loading...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex items-center gap-3 sm:gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/clusters')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{isNew ? 'Add Cluster' : 'Edit Cluster'}</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
              {isNew ? 'Create a new cluster' : 'Update cluster information'}
            </p>
          </div>
        </div>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">{error}</div>
        )}

        <div className={`grid gap-4 sm:gap-6 ${!isNew ? 'grid-cols-1 lg:grid-cols-2' : ''}`}>
          <Card>
            <CardHeader>
              <CardTitle>Cluster Details</CardTitle>
              <CardDescription>
                {isNew ? 'Fill in the details for the new cluster' : 'Modify the cluster details below'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="code">Code *</Label>
                  <Input
                    type="text"
                    id="code"
                    name="code"
                    value={formData.code}
                    onChange={handleChange}
                    placeholder="Cluster code"
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
                    placeholder="Cluster name"
                    required
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
                    placeholder="Cluster description (optional)"
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
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

                <div className="flex gap-3 pt-4">
                  <Button type="submit" disabled={saving}>
                    <Save className="mr-2 h-4 w-4" />
                    {saving ? 'Saving...' : isNew ? 'Create Cluster' : 'Save Changes'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => navigate('/clusters')}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Right column - Edit mode only */}
          {!isNew && (
            <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Building2 className="h-5 w-5" />
                      Business Units
                    </CardTitle>
                    <CardDescription>
                      {buLoading
                        ? 'Loading...'
                        : `${businessUnits.length} business unit${businessUnits.length !== 1 ? 's' : ''} in this cluster`}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={fetchBusinessUnits} disabled={buLoading} className="h-8 w-8">
                      <RefreshCw className={`h-4 w-4 ${buLoading ? 'animate-spin' : ''}`} />
                    </Button>
                    <Button size="sm" onClick={() => navigate(`/business-units/new?cluster_id=${id}`)}>
                      Add
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {businessUnits.length === 0 && !buLoading ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No business units found in this cluster.</p>
                ) : (
                  <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left font-medium px-4 py-2">Code</th>
                        <th className="text-left font-medium px-4 py-2">Name</th>
                        <th className="text-left font-medium px-4 py-2">Status</th>
                        <th className="text-right font-medium px-4 py-2 w-12"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {businessUnits.map((bu) => (
                        <tr key={bu.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-2">
                            <Badge variant="outline" className="text-xs">{bu.code}</Badge>
                          </td>
                          <td className="px-4 py-2">{bu.name}</td>
                          <td className="px-4 py-2">
                            {bu.is_active ? (
                              <Badge className="text-xs bg-green-100 text-green-700">Active</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">Inactive</Badge>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => navigate(`/business-units/${bu.id}/edit`)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Users List */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Users
                    </CardTitle>
                    <CardDescription>
                      {usersLoading
                        ? 'Loading...'
                        : `${clusterUsers.length} user${clusterUsers.length !== 1 ? 's' : ''} in this cluster`}
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="icon" onClick={fetchClusterUsers} disabled={usersLoading} className="h-8 w-8">
                    <RefreshCw className={`h-4 w-4 ${usersLoading ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {clusterUsers.length === 0 && !usersLoading ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No users found in this cluster.</p>
                ) : (
                  <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left font-medium px-4 py-2">Name</th>
                        <th className="text-left font-medium px-4 py-2">Email</th>
                        <th className="text-left font-medium px-4 py-2">Role</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clusterUsers.map((user) => (
                        <tr key={user.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-2">
                            {user.firstname || user.lastname
                              ? `${user.firstname || ''} ${user.lastname || ''}`.trim()
                              : user.name || user.email}
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">{user.email}</td>
                          <td className="px-4 py-2">
                            {user.platform_role ? (
                              <Badge variant="outline" className="text-xs">{user.platform_role}</Badge>
                            ) : user.role ? (
                              <Badge variant="outline" className="text-xs">{user.role}</Badge>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                )}
              </CardContent>
            </Card>
            </div>
          )}
        </div>
      </div>

      {/* Debug Sheet - Development Only */}
      {process.env.NODE_ENV === 'development' && !isNew && !!(rawResponse || rawBuResponse || rawUsersResponse) && (
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
                  onClick={() => setDebugTab('cluster')}
                  className={`px-2 sm:px-3 py-1.5 sm:py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${debugTab === 'cluster' ? 'border-amber-500 text-amber-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                >
                  Cluster
                </button>
                <button
                  onClick={() => setDebugTab('bu')}
                  className={`px-2 sm:px-3 py-1.5 sm:py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${debugTab === 'bu' ? 'border-amber-500 text-amber-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                >
                  Business Units
                </button>
                <button
                  onClick={() => setDebugTab('users')}
                  className={`px-2 sm:px-3 py-1.5 sm:py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${debugTab === 'users' ? 'border-amber-500 text-amber-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                >
                  Users
                </button>
              </div>

              {debugTab === 'cluster' && (
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-medium text-muted-foreground truncate">{`GET /api-system/cluster/${id}`}</span>
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
              {debugTab === 'bu' && (
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-medium text-muted-foreground truncate">GET /api-system/business-unit</span>
                    <Button variant="outline" size="sm" className="self-end sm:self-auto" onClick={() => handleCopyJson(rawBuResponse)}>
                      {copied ? <Check className="mr-1.5 h-3 w-3" /> : <Copy className="mr-1.5 h-3 w-3" />}
                      {copied ? 'Copied!' : 'Copy'}
                    </Button>
                  </div>
                  <pre className="text-[10px] sm:text-xs bg-gray-900 text-green-400 p-3 sm:p-4 rounded-lg overflow-auto max-h-[60vh] sm:max-h-[70vh]">
                    {rawBuResponse ? JSON.stringify(rawBuResponse, null, 2) : 'No data'}
                  </pre>
                </div>
              )}
              {debugTab === 'users' && (
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-medium text-muted-foreground truncate">{`GET /api-system/user/cluster/${id}`}</span>
                    <Button variant="outline" size="sm" className="self-end sm:self-auto" onClick={() => handleCopyJson(rawUsersResponse)}>
                      {copied ? <Check className="mr-1.5 h-3 w-3" /> : <Copy className="mr-1.5 h-3 w-3" />}
                      {copied ? 'Copied!' : 'Copy'}
                    </Button>
                  </div>
                  <pre className="text-[10px] sm:text-xs bg-gray-900 text-green-400 p-3 sm:p-4 rounded-lg overflow-auto max-h-[60vh] sm:max-h-[70vh]">
                    {rawUsersResponse ? JSON.stringify(rawUsersResponse, null, 2) : 'No data'}
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

export default ClusterEdit;
