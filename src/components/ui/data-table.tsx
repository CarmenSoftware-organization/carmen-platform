import React from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type PaginationState,
  type Updater,
  type RowSelectionState,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './table';
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

const PAGE_SIZES = [10, 25, 50, 100];

type PageItem = number | 'ellipsis-left' | 'ellipsis-right';

function getPageItems(current: number, total: number): PageItem[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const items: PageItem[] = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);
  if (left > 2) items.push('ellipsis-left');
  for (let i = left; i <= right; i++) items.push(i);
  if (right < total - 1) items.push('ellipsis-right');
  items.push(total);
  return items;
}

function SelectCheckbox({
  checked,
  indeterminate,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  ariaLabel: string;
}) {
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate && !checked;
  }, [indeterminate, checked]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      aria-label={ariaLabel}
      className="h-4 w-4 rounded border-input cursor-pointer"
    />
  );
}

interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  globalFilter?: string;
  onGlobalFilterChange?: (value: string) => void;
  pageSize?: number;
  serverSide?: boolean;
  totalRows?: number;
  page?: number;
  perpage?: number;
  onPaginateChange?: (params: { page: number; perpage: number }) => void;
  onSortChange?: (sort: string) => void;
  defaultSort?: { id: string; desc: boolean };
  enableRowSelection?: boolean;
  getRowId?: (row: TData, index: number) => string;
  onSelectionChange?: (rows: TData[]) => void;
  selectionResetKey?: unknown;
  getRowSelectionLabel?: (row: TData) => string;
}

function DataTable<TData>({
  columns,
  data,
  globalFilter,
  onGlobalFilterChange,
  pageSize: defaultPageSize = 10,
  serverSide = false,
  totalRows = 0,
  page = 1,
  perpage = 10,
  onPaginateChange,
  onSortChange,
  defaultSort,
  enableRowSelection = false,
  getRowId,
  onSelectionChange,
  selectionResetKey,
  getRowSelectionLabel,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>(
    defaultSort ? [defaultSort] : []
  );
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: serverSide ? page - 1 : 0,
    pageSize: serverSide ? perpage : defaultPageSize,
  });
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  // Tracks the selectionResetKey value THIS instance has already applied, so the
  // reset effect below only fires on a genuine change, never on mount.
  const lastSeenResetKey = React.useRef(selectionResetKey);

  React.useEffect(() => {
    if (serverSide) {
      setPagination({ pageIndex: page - 1, pageSize: perpage });
    }
  }, [serverSide, page, perpage]);

  const pageCount = serverSide ? Math.ceil(totalRows / pagination.pageSize) : undefined;

  const handleSortingChange = (updater: Updater<SortingState>) => {
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

  const handlePaginationChange = (updater: Updater<PaginationState> | PaginationState) => {
    const newPagination = typeof updater === 'function' ? updater(pagination) : updater;
    setPagination(newPagination);
    if (serverSide && onPaginateChange) {
      onPaginateChange({
        page: newPagination.pageIndex + 1,
        perpage: newPagination.pageSize,
      });
    }
  };

  const columnsWithIndex = React.useMemo<ColumnDef<TData, unknown>[]>(() => {
    const base: ColumnDef<TData, unknown>[] = [
      {
        id: 'rowIndex',
        header: '#',
        cell: ({ row }) => pagination.pageIndex * pagination.pageSize + row.index + 1,
        enableSorting: false,
        meta: { headerClassName: 'w-8', cellClassName: 'text-muted-foreground w-8' },
      },
      ...columns,
    ];
    if (!enableRowSelection) return base;
    const selectionCol: ColumnDef<TData, unknown> = {
      id: 'select',
      enableSorting: false,
      meta: { headerClassName: 'w-10', cellClassName: 'w-10' },
      header: ({ table }) => (
        <SelectCheckbox
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={table.getIsSomePageRowsSelected()}
          onChange={table.getToggleAllPageRowsSelectedHandler()}
          ariaLabel="Select all on this page"
        />
      ),
      cell: ({ row }) => (
        <SelectCheckbox
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
          ariaLabel={getRowSelectionLabel ? getRowSelectionLabel(row.original) : 'Select row'}
        />
      ),
    };
    return [selectionCol, ...base];
  }, [columns, pagination.pageIndex, pagination.pageSize, enableRowSelection, getRowSelectionLabel]);

  const table = useReactTable({
    data,
    columns: columnsWithIndex,
    state: {
      sorting,
      globalFilter: serverSide ? undefined : globalFilter,
      pagination,
      rowSelection,
    },
    pageCount: serverSide ? pageCount : undefined,
    manualPagination: serverSide,
    manualSorting: serverSide,
    manualFiltering: serverSide,
    enableRowSelection,
    onRowSelectionChange: setRowSelection,
    getRowId,
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

  React.useEffect(() => {
    if (selectionResetKey === undefined) return;
    // Callers (e.g. NewsManagement) bump a single "result set changed" counter that
    // starts incrementing from their OWN mount — often before this table ever mounts
    // (it's commonly gated behind a loading/empty check). Without the guard below,
    // THIS effect's first run (on mount) would treat that already-elevated starting
    // value as "changed" and force a redundant setRowSelection({}) — which, being an
    // unconditional overwrite rather than a functional update, can race a user's very
    // first checkbox click (queued around the same time) and silently drop it.
    if (lastSeenResetKey.current === selectionResetKey) return;
    lastSeenResetKey.current = selectionResetKey;
    setRowSelection({});
  }, [selectionResetKey]);

  React.useEffect(() => {
    if (!enableRowSelection || !onSelectionChange) return;
    const selected = table.getSelectedRowModel().rows.map((r) => r.original);
    onSelectionChange(selected);
    // table/onSelectionChange intentionally excluded: fire only when the
    // selection map changes; parent passes a stable (useCallback) handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowSelection, enableRowSelection]);

  const totalDisplay = serverSide ? totalRows : table.getFilteredRowModel().rows.length;
  const totalPages = serverSide ? (pageCount || 1) : (table.getPageCount() || 1);

  const firstRow = totalDisplay === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1;
  const lastRow = Math.min((pagination.pageIndex + 1) * pagination.pageSize, totalDisplay);

  const sizeOptions = PAGE_SIZES.includes(pagination.pageSize)
    ? PAGE_SIZES
    : [pagination.pageSize, ...PAGE_SIZES];

  const currentPage = pagination.pageIndex + 1;
  const isFirstPage = pagination.pageIndex === 0;
  const isLastPage = pagination.pageIndex >= totalPages - 1;
  const pageItems = getPageItems(currentPage, totalPages);

  const goToPage = (p: number) => handlePaginationChange({ ...pagination, pageIndex: p - 1 });

  const navBtn = "h-8 w-8 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted-foreground transition-all duration-150";
  const numBtnBase = "h-8 min-w-[2rem] px-2 inline-flex items-center justify-center rounded-lg text-sm tabular-nums transition-all duration-150";
  const numBtnInactive = "text-muted-foreground hover:bg-muted hover:text-foreground";
  const numBtnActive = "bg-primary text-primary-foreground font-medium shadow-sm";

  return (
    <div>
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <Table className="min-w-[640px] table-fixed table-sticky-left table-sticky-right">
          <TableHeader className="sticky top-0 z-10 bg-background border-b-2 border-border">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={cn(
                    'text-xs font-medium uppercase tracking-wide text-muted-foreground',
                    (header.column.columnDef.meta as Record<string, string>)?.headerClassName
                  )}
                >
                  {header.isPlaceholder ? null : header.column.getCanSort() ? (
                    <button
                      className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors font-medium"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {{
                        asc: <ArrowUp className="h-3.5 w-3.5 text-primary" />,
                        desc: <ArrowDown className="h-3.5 w-3.5 text-primary" />,
                      }[header.column.getIsSorted() as string] ?? <ArrowUpDown className="h-3.5 w-3.5 opacity-30 group-hover/row:opacity-60 transition-opacity" />}
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
              <TableCell colSpan={columnsWithIndex.length} className="text-center text-muted-foreground py-12">
                <div className="flex flex-col items-center gap-2">
                  <span className="text-sm">No results found</span>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={cn(
                      'tabular-nums',
                      (cell.column.columnDef.meta as Record<string, string>)?.cellClassName
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
        </Table>
      </div>

      {/* Pagination — sticky at bottom of viewport */}
      <div className="sticky bottom-0 z-20 border-t border-border/60 bg-background flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center justify-between gap-4 sm:justify-start">
          <div className="text-sm text-muted-foreground tabular-nums">
            {totalDisplay === 0
              ? 'No results'
              : `Showing ${firstRow}\u2013${lastRow} of ${totalDisplay}`}
          </div>
          <div role="group" aria-label="Rows per page" className="flex sm:hidden items-center gap-0.5 rounded-lg border border-border/60 bg-muted/30 p-0.5">
            {sizeOptions.map((size) => {
              const active = size === pagination.pageSize;
              return (
                <button
                  key={size}
                  type="button"
                  aria-pressed={active}
                  onClick={() => handlePaginationChange({ pageIndex: 0, pageSize: size })}
                  className={`h-7 min-w-[2rem] px-2 rounded-md text-xs tabular-nums transition-all duration-150 ${
                    active
                      ? 'bg-primary text-primary-foreground font-medium shadow-sm'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {size}
                </button>
              );
            })}
          </div>
        </div>

        {/* Desktop: numbered page buttons */}
        <nav aria-label="Pagination" className="hidden sm:flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous page"
            className={navBtn}
            onClick={() => goToPage(currentPage - 1)}
            disabled={isFirstPage}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {pageItems.map((item, idx) => {
            if (item === 'ellipsis-left' || item === 'ellipsis-right') {
              return (
                <span
                  key={`${item}-${idx}`}
                  className="h-8 w-8 inline-flex items-center justify-center text-muted-foreground"
                  aria-hidden="true"
                >
                  &#8230;
                </span>
              );
            }
            const active = item === currentPage;
            return (
              <button
                key={item}
                type="button"
                aria-label={`Page ${item}`}
                aria-current={active ? 'page' : undefined}
                className={`${numBtnBase} ${active ? numBtnActive : numBtnInactive}`}
                onClick={() => goToPage(item)}
              >
                {item}
              </button>
            );
          })}
          <button
            type="button"
            aria-label="Next page"
            className={navBtn}
            onClick={() => goToPage(currentPage + 1)}
            disabled={isLastPage}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </nav>

        {/* Mobile: simple prev/next with page indicator */}
        <nav aria-label="Pagination" className="flex sm:hidden items-center justify-center gap-2">
          <button
            type="button"
            aria-label="Previous page"
            className={navBtn}
            onClick={() => goToPage(currentPage - 1)}
            disabled={isFirstPage}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm text-muted-foreground tabular-nums min-w-[7rem] text-center">
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            aria-label="Next page"
            className={navBtn}
            onClick={() => goToPage(currentPage + 1)}
            disabled={isLastPage}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </nav>

        <div className="hidden sm:flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Show</span>
          <div role="group" aria-label="Rows per page" className="flex items-center gap-0.5 rounded-lg border border-border/60 bg-muted/30 p-0.5">
            {sizeOptions.map((size) => {
              const active = size === pagination.pageSize;
              return (
                <button
                  key={size}
                  type="button"
                  aria-pressed={active}
                  onClick={() => handlePaginationChange({ pageIndex: 0, pageSize: size })}
                  className={`h-7 min-w-[2rem] px-2 rounded-md text-xs tabular-nums transition-all duration-150 ${
                    active
                      ? 'bg-primary text-primary-foreground font-medium shadow-sm'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {size}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export { DataTable };
export type { DataTableProps };
