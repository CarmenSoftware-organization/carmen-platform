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
}: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>(
    defaultSort ? [defaultSort] : []
  );
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: serverSide ? page - 1 : 0,
    pageSize: serverSide ? perpage : defaultPageSize,
  });

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

  const columnsWithIndex = React.useMemo<ColumnDef<TData, unknown>[]>(() => [
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

  const navBtn = "h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted-foreground transition-colors";
  const numBtnBase = "h-8 min-w-[2rem] px-2 inline-flex items-center justify-center rounded-md text-sm tabular-nums transition-colors";
  const numBtnInactive = "text-muted-foreground hover:bg-muted/50 hover:text-foreground";
  const numBtnActive = "bg-primary text-primary-foreground font-medium shadow-sm";

  return (
    <div>
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-muted shadow-[0_1px_0_0_hsl(var(--border))]">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={(header.column.columnDef.meta as Record<string, string>)?.headerClassName || ''}
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
                      }[header.column.getIsSorted() as string] ?? <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />}
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
                    className={(cell.column.columnDef.meta as Record<string, string>)?.cellClassName || ''}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* Pagination — sticky at bottom of viewport */}
      <div className="sticky bottom-0 z-20 border-t border-border bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70 flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center justify-between gap-4 sm:justify-start">
          <div className="text-sm text-muted-foreground tabular-nums">
            {totalDisplay === 0
              ? 'No results'
              : `Showing ${firstRow}\u2013${lastRow} of ${totalDisplay}`}
          </div>
          <div role="group" aria-label="Rows per page" className="flex sm:hidden items-center gap-0.5 rounded-md border border-input bg-background p-0.5">
            {sizeOptions.map((size) => {
              const active = size === pagination.pageSize;
              return (
                <button
                  key={size}
                  type="button"
                  aria-pressed={active}
                  onClick={() => handlePaginationChange({ pageIndex: 0, pageSize: size })}
                  className={`h-7 min-w-[2rem] px-2 rounded text-xs tabular-nums transition-colors ${
                    active
                      ? 'bg-primary text-primary-foreground font-medium shadow-sm'
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
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
          <div role="group" aria-label="Rows per page" className="flex items-center gap-0.5 rounded-md border border-input bg-background p-0.5">
            {sizeOptions.map((size) => {
              const active = size === pagination.pageSize;
              return (
                <button
                  key={size}
                  type="button"
                  aria-pressed={active}
                  onClick={() => handlePaginationChange({ pageIndex: 0, pageSize: size })}
                  className={`h-7 min-w-[2rem] px-2 rounded text-xs tabular-nums transition-colors ${
                    active
                      ? 'bg-primary text-primary-foreground font-medium shadow-sm'
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
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
