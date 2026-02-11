import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import Layout from "../components/Layout";
import userService from "../services/userService";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { DataTable } from "../components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import type { PaginateParams } from "../types";
import type { ColumnDef } from "@tanstack/react-table";

interface UserRecord {
  id: string;
  user_id: string;
  is_active: boolean;
  username?: string;
  name?: string;
  email?: string;
  firstname?: string;
  middlename?: string;
  lastname?: string;
}

interface UserFormData {
  user_id: string;
  is_active: boolean;
}

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [formData, setFormData] = useState<UserFormData>({
    user_id: "",
    is_active: true,
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [paginate, setPaginate] = useState<PaginateParams>({
    page: 1,
    perpage: 10,
    search: "",
    sort: "",
  });

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchUsers = useCallback(async (params: PaginateParams) => {
    try {
      setLoading(true);
      const data = (await userService.getAll(params)) as unknown as Record<string, unknown>;
      const items = (data.data || data) as UserRecord[];
      setUsers(Array.isArray(items) ? items : []);
      const pag = data.paginate as Record<string, number> | undefined;
      setTotalRows(pag?.total ?? (data.total as number) ?? (Array.isArray(items) ? items.length : 0));
      setError("");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      setError("Failed to load users: " + (e.response?.data?.message || e.message));
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
      setPaginate((prev) => ({ ...prev, page: 1, search: value }));
    }, 400);
  };

  const handlePaginateChange = ({ page, perpage }: { page: number; perpage: number }) => {
    setPaginate((prev) => ({ ...prev, page, perpage }));
  };

  const handleSortChange = (sort: string) => {
    setPaginate((prev) => ({ ...prev, sort }));
  };

  const handleAdd = () => {
    setEditingUser(null);
    setFormData({ user_id: "", is_active: true });
    setShowModal(true);
  };

  const handleEdit = (record: UserRecord) => {
    setEditingUser(record);
    setFormData({
      user_id: record.user_id || "",
      is_active: record.is_active ?? true,
    });
    setShowModal(true);
  };

  const handleDelete = useCallback(async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this user?")) return;
    try {
      await userService.delete(id);
      setPaginate((prev) => ({ ...prev }));
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      alert("Failed to delete: " + (e.response?.data?.message || e.message));
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      if (editingUser) {
        await userService.update(editingUser.id, {
          user_id: formData.user_id,
          is_active: formData.is_active,
        });
      } else {
        await userService.create({
          user_id: formData.user_id,
          is_active: formData.is_active,
        });
      }
      setShowModal(false);
      setPaginate((prev) => ({ ...prev }));
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      alert("Failed to save: " + (e.response?.data?.message || e.message));
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const getNameDisplay = (record: UserRecord): string => {
    if (record.firstname || record.middlename || record.lastname) {
      return [record.firstname, record.middlename, record.lastname].filter(Boolean).join(" ");
    }
    return record.name || "-";
  };

  const columns = useMemo<ColumnDef<UserRecord, unknown>[]>(
    () => [
      {
        accessorKey: "username",
        header: "Username",
        cell: ({ row }) => row.original.username || row.original.user_id || "-",
      },
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => getNameDisplay(row.original),
      },
      {
        accessorKey: "email",
        header: "Email",
        cell: ({ row }) => row.original.email || "-",
      },

      {
        accessorKey: "is_active",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={row.original.is_active ? "success" : "secondary"}>
            {row.original.is_active ? "Active" : "Inactive"}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        meta: { headerClassName: "text-right", cellClassName: "text-right" },
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
    ],
    [handleDelete],
  );

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
            <DialogTitle>{editingUser ? "Edit User" : "Add User"}</DialogTitle>
            <DialogDescription>{editingUser ? "Update user details" : "Add a new user"}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="user_id">User ID *</Label>
              <Input
                id="user_id"
                name="user_id"
                value={formData.user_id}
                onChange={handleChange}
                placeholder="User ID"
                required
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
            <DialogFooter>
              <Button type="button" size="sm" variant="outline" onClick={() => setShowModal(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm">
                {editingUser ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default UserManagement;
