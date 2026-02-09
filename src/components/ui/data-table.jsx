import React from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './table';
import { Button } from './button';
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

const DataTable = ({
  columns,
  data,
  globalFilter,
  onGlobalFilterChange,
  pageSize: defaultPageSize = 10,
  // Server-side pagination props
  serverSide = false,
  totalRows = 0,
  page = 1,
  perpage = 10,
  onPaginateChange,
  onSortChange,
}) => {
  const [sorting, setSorting] = React.useState([]);
  const [pagination, setPagination] = React.useState({
    pageIndex: serverSide ? page - 1 : 0,
    pageSize: serverSide ? perpage : defaultPageSize,
  });

  const pageCount = serverSide ? Math.ceil(totalRows / pagination.pageSize) : undefined;

  const handleSortingChange = (updater) => {
    setSorting(updater);
    if (serverSide && onSortChange) {
      const newSorting = typeof updater === 'function' ? updater(sorting) : updater;
      if (newSorting.length > 0) {
        const { id, desc } = newSorting[0];
        onSortChange(`${id}:${desc ? 'desc' : 'asc'}`);
      } else {
        onSortChange('');
      }
    }
  };

  const handlePaginationChange = (updater) => {
    const newPagination = typeof updater === 'function' ? updater(pagination) : updater;
    setPagination(newPagination);
    if (serverSide && onPaginateChange) {
      onPaginateChange({
        page: newPagination.pageIndex + 1,
        perpage: newPagination.pageSize,
      });
    }
  };

  const columnsWithIndex = React.useMemo(() => [
    {
      id: 'rowIndex',
      header: '#',
      cell: ({ row }) => pagination.pageIndex * pagination.pageSize + row.index + 1,
      enableSorting: false,
      meta: { cellClassName: 'text-muted-foreground w-10' },
    },
    ...columns,
  ], [columns, pagination.pageIndex, pagination.pageSize]);

  const table = useReactTable({
    data,
    columns: columnsWithIndex,
    state: {
      sorting,
      globalFilter: serverSide ? undefined : globalFilter,
      pagination,
    },
    pageCount: serverSide ? pageCount : undefined,
    manualPagination: serverSide,
    manualSorting: serverSide,
    manualFiltering: serverSide,
    onSortingChange: handleSortingChange,
    onGlobalFilterChange: serverSide ? undefined : onGlobalFilterChange,
    onPaginationChange: handlePaginationChange,
    getCoreRowModel: getCoreRowModel(),
    ...(serverSide ? {} : {
      getSortedRowModel: getSortedRowModel(),
      getFilteredRowModel: getFilteredRowModel(),
      getPaginationRowModel: getPaginationRowModel(),
    }),
  });

  const totalDisplay = serverSide ? totalRows : table.getFilteredRowModel().rows.length;
  const totalPages = serverSide ? (pageCount || 1) : (table.getPageCount() || 1);

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={header.column.columnDef.meta?.headerClassName || ''}
                >
                  {header.isPlaceholder ? null : header.column.getCanSort() ? (
                    <button
                      className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {{
                        asc: <ArrowUp className="h-3.5 w-3.5" />,
                        desc: <ArrowDown className="h-3.5 w-3.5" />,
                      }[header.column.getIsSorted()] ?? <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />}
                    </button>
                  ) : (
                    flexRender(header.column.columnDef.header, header.getContext())
                  )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columnsWithIndex.length} className="text-center text-muted-foreground">
                No results found
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={cell.column.columnDef.meta?.cellClassName || ''}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* Pagination */}
      <div className="flex items-center justify-between px-2">
        <div className="text-sm text-muted-foreground">
          {totalDisplay} row(s) total
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Rows per page</span>
            <select
              value={pagination.pageSize}
              onChange={(e) => {
                const newSize = Number(e.target.value);
                handlePaginationChange({ pageIndex: 0, pageSize: newSize });
              }}
              className="h-8 w-16 rounded-md border border-input bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {[10, 20, 30, 50, 100].map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </div>
          <div className="text-sm text-muted-foreground">
            Page {pagination.pageIndex + 1} of {totalPages}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => handlePaginationChange({ ...pagination, pageIndex: 0 })}
              disabled={pagination.pageIndex === 0}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => handlePaginationChange({ ...pagination, pageIndex: pagination.pageIndex - 1 })}
              disabled={pagination.pageIndex === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => handlePaginationChange({ ...pagination, pageIndex: pagination.pageIndex + 1 })}
              disabled={pagination.pageIndex >= totalPages - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => handlePaginationChange({ ...pagination, pageIndex: totalPages - 1 })}
              disabled={pagination.pageIndex >= totalPages - 1}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export { DataTable };
