import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import userService from "../services/userService";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { DataTable } from "../components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { Plus, Pencil, Trash2, Search, MoreHorizontal } from "lucide-react";
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

const UserManagement: React.FC = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
        cell: ({ row }) => (
          <span
            className="cursor-pointer text-primary hover:underline"
            onClick={() => navigate(`/users/${row.original.id}/edit`)}
          >
            {row.original.username || row.original.user_id || "-"}
          </span>
        ),
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
        header: "",
        meta: { headerClassName: "w-10", cellClassName: "text-center" },
        enableSorting: false,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate(`/users/${row.original.id}/edit`)} className="cursor-pointer">
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleDelete(row.original.id)}
                className="cursor-pointer text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [handleDelete, navigate],
  );

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">User Management</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">Manage users and permissions</p>
          </div>
          <Button onClick={() => navigate("/users/new")} className="self-start sm:self-auto">
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
    </Layout>
  );
};

export default UserManagement;
