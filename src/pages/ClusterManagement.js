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
import { Plus, Pencil, Trash2, Search, Code, MoreHorizontal } from 'lucide-react';

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

  const searchTimeout = useRef(null);

  const fetchClusters = useCallback(async (params) => {
    try {
      setLoading(true);
      const data = await clusterService.getAll(params || paginate);
      setRawResponse(data);
      const items = data.data || data;
      setClusters(Array.isArray(items) ? items : []);
      setTotalRows(data.total ?? data.totalCount ?? (Array.isArray(items) ? items.length : 0));
      setError('');
    } catch (err) {
      setError('Failed to load clusters: ' + (err.response?.data?.message || err.message));
      console.error('Error fetching clusters:', err);
    } finally {
      setLoading(false);
    }
  }, [paginate]);

  useEffect(() => {
    fetchClusters(paginate);
  }, [paginate]);

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

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this cluster?')) return;
    try {
      await clusterService.delete(id);
      fetchClusters(paginate);
    } catch (err) {
      alert('Failed to delete cluster: ' + (err.response?.data?.message || err.message));
    }
  };

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
      cell: ({ row }) => row.original._count?.tb_business_unit ?? 0,
      meta: { cellClassName: 'text-center' },
      enableSorting: false,
    },
    {
      id: 'user_count',
      header: 'Users',
      cell: ({ row }) => row.original._count?.tb_cluster_user ?? 0,
      meta: { cellClassName: 'text-center' },
      enableSorting: false,
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
  ], []);

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
