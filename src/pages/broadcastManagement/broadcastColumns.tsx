import React from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import type { BroadcastListItem, BroadcastStatus } from '../../types';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../components/ui/dropdown-menu';
import { MoreHorizontal, Pencil, Trash2, Clock } from 'lucide-react';
import Can from '../../components/Can';
import { auditColumns } from '../../components/auditColumns';

interface BroadcastColumnsProps {
  showDeleted: boolean;
  onDelete: (id: string, docVersion: number) => void;
  onExpireNow: (id: string, docVersion: number) => void;
}

const statusVariants: Record<BroadcastStatus, 'success' | 'info' | 'secondary' | 'destructive'> = {
  active: 'success',
  scheduled: 'info',
  expired: 'secondary',
  deleted: 'destructive',
};

const severityVariants: Record<string, 'destructive' | 'warning' | 'info' | 'secondary'> = {
  CRITICAL: 'destructive',
  WARNING: 'warning',
  INFO: 'info',
  MAINTENANCE: 'secondary',
};

function formatDt(v?: string | null) {
  if (!v) return '-';
  const dt = new Date(v);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
}

export const createBroadcastColumns = ({
  showDeleted,
  onDelete,
  onExpireNow,
}: BroadcastColumnsProps): ColumnDef<BroadcastListItem, unknown>[] => {
  // BroadcastListItem ไม่มี updated_at/updated_by เลย (src/types/index.ts:827) — สเปรดคู่เต็มของ
  // auditColumns จะได้คอลัมน์ Updated ที่ว่างถาวร (เจอกรณีเดียวกันมาแล้วที่ SuperAdminManagement)
  // จึงหยิบมาแค่คอลัมน์ Created ตัวเดียว
  const [createdColumn] = auditColumns<BroadcastListItem>();

  const columns: ColumnDef<BroadcastListItem, unknown>[] = [
    {
      accessorKey: 'title',
      header: 'Title',
      meta: { headerClassName: 'min-w-[200px]', card: 'title' },
      cell: ({ row }) => {
        const d = row.original;
        return (
          <div className="space-y-1">
            <Link to={`/broadcasts/${d.id}/edit`} className="font-medium text-primary hover:underline line-clamp-1" title={d.title || undefined}>
              {d.title}
            </Link>
            <div className="text-xs text-muted-foreground line-clamp-1" title={d.message || undefined}>
              {d.message}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'scope',
      header: 'Scope',
      meta: { headerClassName: 'w-32', cellClassName: 'w-32' },
      cell: ({ row }) => {
        const d = row.original;
        return (
          <span className="text-sm whitespace-nowrap">
            {d.scope === 'system' ? 'System' : `BU · ${d.bu_code || 'Unknown'}`}
          </span>
        );
      },
    },
    {
      id: 'severity',
      header: 'Severity',
      meta: { headerClassName: 'w-28', cellClassName: 'w-28', card: 'hidden' },
      enableSorting: false,
      cell: ({ row }) => {
        const severity = (row.original.severity || 'INFO').toUpperCase();
        return (
          <Badge variant={severityVariants[severity] || 'secondary'} className="text-[10px] px-1.5 py-0">
            {severity}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      meta: { headerClassName: 'w-28', cellClassName: 'w-28', card: 'badge' },
      cell: ({ row }) => (
        <Badge variant={statusVariants[row.original.status] || 'secondary'} className="capitalize">
          {row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: 'scheduled_at',
      header: 'Scheduled',
      meta: { headerClassName: 'w-36', cellClassName: 'w-36' },
      cell: ({ row }) => (
        <span className="text-sm whitespace-nowrap">{formatDt(row.original.scheduled_at)}</span>
      ),
    },
    {
      accessorKey: 'end_at',
      header: 'Expires',
      meta: { headerClassName: 'w-36', cellClassName: 'w-36' },
      cell: ({ row }) => {
        const endAt = row.original.end_at;
        if (!endAt) return <span className="text-sm whitespace-nowrap">-</span>;
        
        let isExpiringSoon = false;
        if (row.original.status === 'active' || row.original.status === 'scheduled') {
          const hoursLeft = (new Date(endAt).getTime() - Date.now()) / (1000 * 60 * 60);
          isExpiringSoon = hoursLeft > 0 && hoursLeft < 24;
        }

        return (
          <span className={`text-sm whitespace-nowrap ${isExpiringSoon ? 'text-warning font-medium' : ''}`}>
            {formatDt(endAt)}
          </span>
        );
      },
    },
    // เดิมเขียนเองอ่าน created_at/created_by ตรง ๆ — เปลี่ยนมาใช้ของกลาง (normalizeAudit รองรับ
    // created_by แบบ object { id, name } ของ BroadcastListItem อยู่แล้วตั้งแต่ Task 6) คง
    // headerClassName/cellClassName/card: 'hidden' ของเดิมไว้ — คอลัมน์นี้ไม่เคยแสดงบนการ์ดมือถือ
    {
      ...createdColumn,
      meta: { ...createdColumn.meta, headerClassName: 'w-32', cellClassName: 'w-32', card: 'hidden' },
    },
  ];

  if (showDeleted) {
    columns.push({
      id: 'deleted_at',
      header: 'Deleted',
      meta: { headerClassName: 'w-36', cellClassName: 'w-36' },
      cell: ({ row }) => (
        <div className="text-[11px] leading-tight text-destructive space-y-0.5">
          <div>{formatDt(row.original.deleted_at)}</div>
        </div>
      ),
      enableSorting: false,
    });
  }

  columns.push({
    id: 'actions',
    header: '',
    meta: { headerClassName: 'w-12', cellClassName: 'text-center p-0 w-12', card: 'actions' },
    enableSorting: false,
    cell: ({ row }) => {
      const d = row.original;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {d.status !== 'deleted' && (
              <Can permission="broadcast.update">
                <DropdownMenuItem asChild>
                  <Link to={`/broadcasts/${d.id}/edit`} className="cursor-pointer w-full flex items-center">
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </Link>
                </DropdownMenuItem>
              </Can>
            )}
            
            {d.status === 'active' && (
              <Can permission="broadcast.update">
                <DropdownMenuItem 
                  onClick={() => onExpireNow(d.id, d.doc_version)} 
                  className="cursor-pointer"
                >
                  <Clock className="mr-2 h-4 w-4" />
                  Expire now
                </DropdownMenuItem>
              </Can>
            )}

            {d.status !== 'deleted' && (
              <Can permission="broadcast.delete">
                <DropdownMenuItem 
                  onClick={() => onDelete(d.id, d.doc_version)} 
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </Can>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  });

  return columns;
};
