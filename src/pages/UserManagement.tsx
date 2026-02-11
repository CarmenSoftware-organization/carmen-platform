import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Layout from '../components/Layout';
import userService from '../services/userService';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { DataTable } from '../components/ui/data-table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import type { User, PaginateParams } from '../types';
import type { ColumnDef } from '@tanstack/react-table';

interface UserFormData {
  name: string;
  email: string;
  password: string;
  role: string;
  status: string;
}

const getRoleBadgeVariant = (role: string | undefined): "default" | "secondary" | "outline" => {
  if (role === 'admin') return 'default';
  if (role === 'manager') return 'secondary';
  return 'outline';
};

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<UserFormData>({
    name: '',
    email: '',
    password: '',
    role: 'user',
    status: 'active'
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [paginate, setPaginate] = useState<PaginateParams>({
    page: 1,
    perpage: 10,
    search: '',
    sort: '',
  });

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchUsers = useCallback(async (params: PaginateParams) => {
    try {
      setLoading(true);
      const data = await userService.getAll(params);
      const items = data.data || data;
      setUsers(Array.isArray(items) ? items : []);
      setTotalRows(data.paginate?.total ?? data.total ?? (Array.isArray(items) ? items.length : 0));
      setError('');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      setError('Failed to load users: ' + (e.response?.data?.message || e.message));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers(paginate);
  }, [fetchUsers, paginate]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setPaginate(prev => ({ ...prev, page: 1, search: value }));
    }, 400);
  };

  const handlePaginateChange = ({ page, perpage }: { page: number; perpage: number }) => {
    setPaginate(prev => ({ ...prev, page, perpage }));
  };

  const handleSortChange = (sort: string) => {
    setPaginate(prev => ({ ...prev, sort }));
  };

  const handleAdd = () => {
    setEditingUser(null);
    setFormData({ name: '', email: '', password: '', role: 'user', status: 'active' });
    setShowModal(true);
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setFormData({
      name: user.name || '',
      email: user.email || '',
      password: '',
      role: user.role || 'user',
      status: user.status || 'active'
    });
    setShowModal(true);
  };

  const handleDelete = useCallback(async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    try {
      await userService.delete(id);
      setPaginate(prev => ({ ...prev }));
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      alert('Failed to delete: ' + (e.response?.data?.message || e.message));
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const submitData: Record<string, string> = { ...formData };
      if (editingUser && !submitData.password) delete submitData.password;

      if (editingUser) {
        await userService.update(editingUser.id, submitData);
      } else {
        await userService.create(submitData);
      }
      setShowModal(false);
      setPaginate(prev => ({ ...prev }));
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      alert('Failed to save: ' + (e.response?.data?.message || e.message));
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const columns = useMemo<ColumnDef<User, unknown>[]>(() => [
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'email', header: 'Email' },
    {
      accessorKey: 'role',
      header: 'Role',
      cell: ({ row }) => (
        <Badge variant={getRoleBadgeVariant(row.original.role)}>{row.original.role}</Badge>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.status === 'active' ? 'success' : 'secondary'}>{row.original.status}</Badge>
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
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">User Management</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">Manage users and permissions</p>
          </div>
          <Button onClick={handleAdd} className="self-start sm:self-auto">
            <Plus className="mr-2 h-4 w-4" />
            Add User
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="relative w-full sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search users..."
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
                data={users}
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
            <DialogTitle>{editingUser ? 'Edit User' : 'Add User'}</DialogTitle>
            <DialogDescription>
              {editingUser ? 'Update user information' : 'Create a new user'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input id="name" name="name" value={formData.name} onChange={handleChange} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input id="email" name="email" type="email" value={formData.email} onChange={handleChange} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password {editingUser && '(leave blank to keep current)'}</Label>
              <Input
                id="password" name="password" type="password"
                value={formData.password} onChange={handleChange} required={!editingUser}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <select
                id="role" name="role" value={formData.role} onChange={handleChange}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="user">User</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
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
              <Button type="button" size="sm" variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button type="submit" size="sm">{editingUser ? 'Update' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default UserManagement;
