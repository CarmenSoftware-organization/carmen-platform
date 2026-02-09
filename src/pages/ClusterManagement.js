import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import clusterService from '../services/clusterService';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { DataTable } from '../components/ui/data-table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '../components/ui/sheet';
import { Plus, Pencil, Trash2, Search, Code, MoreHorizontal, Copy, Check } from 'lucide-react';

const ClusterManagement = () => {
  const navigate = useNavigate();
  const [clusters, setClusters] = useState([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [rawResponse, setRawResponse] = useState(null);
  const [paginate, setPaginate] = useState({
    page: 1,
    perpage: 10,
    search: '',
    sort: '',
  });

  const [copied, setCopied] = useState(false);
  const searchTimeout = useRef(null);

  const handleCopyJson = (data) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fetchClusters = useCallback(async (params) => {
    try {
      setLoading(true);
      const data = await clusterService.getAll(params);
      setRawResponse(data);
      const items = data.data || data;
      setClusters(Array.isArray(items) ? items : []);
      setTotalRows(data.paginate?.total ?? data.total ?? (Array.isArray(items) ? items.length : 0));
      setError('');
    } catch (err) {
      setError('Failed to load clusters: ' + (err.response?.data?.message || err.message));
      console.error('Error fetching clusters:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClusters(paginate);
  }, [fetchClusters, paginate]);

  const handleSearchChange = (value) => {
    setSearchTerm(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setPaginate(prev => ({ ...prev, page: 1, search: value }));
    }, 400);
  };

  const handlePaginateChange = ({ page, perpage }) => {
    setPaginate(prev => ({ ...prev, page, perpage }));
  };

  const handleSortChange = (sort) => {
    setPaginate(prev => ({ ...prev, sort }));
  };

  const handleDelete = useCallback(async (id) => {
    if (!window.confirm('Are you sure you want to delete this cluster?')) return;
    try {
      await clusterService.delete(id);
      setPaginate(prev => ({ ...prev }));
    } catch (err) {
      alert('Failed to delete cluster: ' + (err.response?.data?.message || err.message));
    }
  }, []);

  const columns = useMemo(() => [
    {
      accessorKey: 'code',
      header: 'Code',
      cell: ({ row }) => (
        <span className="cursor-pointer text-primary hover:underline" onClick={() => navigate(`/clusters/${row.original.id}/edit`)}>
          {row.original.code}
        </span>
      ),
    },
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <span className="cursor-pointer text-primary hover:underline" onClick={() => navigate(`/clusters/${row.original.id}/edit`)}>
          {row.original.name}
        </span>
      ),
    },
    { accessorKey: 'description', header: 'Description' },
    {
      accessorKey: 'is_active',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? 'success' : 'secondary'}>
          {row.original.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      id: 'bu_count',
      header: 'BU',
      cell: ({ row }) => row.original.bu_count ?? 0,
      meta: { cellClassName: 'text-center' },
      enableSorting: false,
    },
    {
      id: 'user_count',
      header: 'Users',
      cell: ({ row }) => row.original.users_count ?? 0,
      meta: { cellClassName: 'text-center' },
      enableSorting: false,
    },
    {
      id: 'created',
      header: 'Created',
      enableSorting: false,
      cell: ({ row }) => {
        const d = row.original;
        const fmt = (v) => { if (!v) return '-'; const d = new Date(v); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`; };
        return (
          <div className="text-[11px] leading-tight text-muted-foreground space-y-0.5">
            <div>{fmt(d.created_at)}</div>
            {d.created_by_name && <div>{d.created_by_name}</div>}
          </div>
        );
      },
    },
    {
      id: 'updated',
      header: 'Updated',
      enableSorting: false,
      cell: ({ row }) => {
        const d = row.original;
        if (d.updated_at === d.created_at) return null;
        const fmt = (v) => { if (!v) return '-'; const d = new Date(v); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`; };
        return (
          <div className="text-[11px] leading-tight text-muted-foreground space-y-0.5">
            <div>{fmt(d.updated_at)}</div>
            {d.updated_by_name && <div>{d.updated_by_name}</div>}
          </div>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      meta: { headerClassName: 'w-10', cellClassName: 'text-center' },
      enableSorting: false,
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => navigate(`/clusters/${row.original.id}/edit`)} className="cursor-pointer">
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDelete(row.original.id)} className="cursor-pointer text-destructive focus:text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ], [navigate, handleDelete]);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Cluster Management</h1>
            <p className="text-muted-foreground mt-2">Manage and configure clusters</p>
          </div>
          <Button onClick={() => navigate('/clusters/new')}>
            <Plus className="mr-2 h-4 w-4" />
            Add Cluster
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search clusters..."
                  value={searchTerm}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading && <div className="text-center py-8 text-muted-foreground">Loading clusters...</div>}
            {error && <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">{error}</div>}

            {!loading && !error && (
              <DataTable
                columns={columns}
                data={clusters}
                serverSide
                totalRows={totalRows}
                page={paginate.page}
                perpage={paginate.perpage}
                onPaginateChange={handlePaginateChange}
                onSortChange={handleSortChange}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Debug Sheet - Development Only */}
      {process.env.NODE_ENV === 'development' && rawResponse && (
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
                GET /api-system/cluster
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

export default ClusterManagement;
