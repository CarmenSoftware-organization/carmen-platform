import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Layout from '../components/Layout';
import businessUnitService from '../services/businessUnitService';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { DataTable } from '../components/ui/data-table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';

const BusinessUnitManagement = () => {
  const [businessUnits, setBusinessUnits] = useState([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingUnit, setEditingUnit] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    status: 'active'
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [paginate, setPaginate] = useState({
    page: 1,
    perpage: 10,
    search: '',
    sort: '',
  });

  const searchTimeout = useRef(null);

  const fetchBusinessUnits = useCallback(async (params) => {
    try {
      setLoading(true);
      const data = await businessUnitService.getAll(params);
      const items = data.data || data;
      setBusinessUnits(Array.isArray(items) ? items : []);
      setTotalRows(data.paginate?.total ?? data.total ?? (Array.isArray(items) ? items.length : 0));
      setError('');
    } catch (err) {
      setError('Failed to load business units: ' + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBusinessUnits(paginate);
  }, [fetchBusinessUnits, paginate]);

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

  const handleAdd = () => {
    setEditingUnit(null);
    setFormData({ name: '', code: '', description: '', status: 'active' });
    setShowModal(true);
  };

  const handleEdit = (unit) => {
    setEditingUnit(unit);
    setFormData({
      name: unit.name || '',
      code: unit.code || '',
      description: unit.description || '',
      status: unit.status || 'active'
    });
    setShowModal(true);
  };

  const handleDelete = useCallback(async (id) => {
    if (!window.confirm('Are you sure you want to delete this business unit?')) return;
    try {
      await businessUnitService.delete(id);
      setPaginate(prev => ({ ...prev }));
    } catch (err) {
      alert('Failed to delete: ' + (err.response?.data?.message || err.message));
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingUnit) {
        await businessUnitService.update(editingUnit.id, formData);
      } else {
        await businessUnitService.create(formData);
      }
      setShowModal(false);
      setPaginate(prev => ({ ...prev }));
    } catch (err) {
      alert('Failed to save: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const columns = useMemo(() => [
    { accessorKey: 'code', header: 'Code' },
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'description', header: 'Description', enableSorting: false },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.status === 'active' ? 'success' : 'secondary'}>
          {row.original.status}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          <Button onClick={() => handleEdit(row.original)} variant="outline" size="sm">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button onClick={() => handleDelete(row.original.id)} variant="destructive" size="sm">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ], [handleDelete]);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Business Unit Management</h1>
            <p className="text-muted-foreground mt-2">Manage business units and departments</p>
          </div>
          <Button onClick={handleAdd}>
            <Plus className="mr-2 h-4 w-4" />
            Add Business Unit
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search business units..."
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent>
            {loading && <div className="text-center py-8 text-muted-foreground">Loading...</div>}
            {error && <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">{error}</div>}
            {!loading && !error && (
              <DataTable
                columns={columns}
                data={businessUnits}
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

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUnit ? 'Edit Business Unit' : 'Add Business Unit'}</DialogTitle>
            <DialogDescription>
              {editingUnit ? 'Update business unit information' : 'Create a new business unit'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">Code *</Label>
              <Input id="code" name="code" value={formData.code} onChange={handleChange} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input id="name" name="name" value={formData.name} onChange={handleChange} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description" name="description" value={formData.description} onChange={handleChange} rows="3"
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <select
                id="status" name="status" value={formData.status} onChange={handleChange}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button type="submit">{editingUnit ? 'Update' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default BusinessUnitManagement;
