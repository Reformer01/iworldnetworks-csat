'use client';

import * as React from 'react';
import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';

import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableShell } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { DataTablePagination, DataTableToolbar, type FacetOption } from './controls';

export { DataTableColumnHeader } from './column-header';
export { DataTablePagination, DataTableToolbar, DataTableFacetedFilter, DataTableViewOptions } from './controls';
export type { FacetOption } from './controls';

export interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  /** Column id the toolbar search box filters on (omit to search all columns). */
  searchKey?: string;
  searchPlaceholder?: string;
  filters?: { columnId: string; title: string; options: FacetOption[] }[];
  toolbarActions?: React.ReactNode;
  initialPageSize?: number;
  initialSorting?: SortingState;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: React.ReactNode;
  /** Show the built-in pagination bar (default true). */
  showPagination?: boolean;
  /** Sticky header + inner scroll area for long tables. */
  maxHeight?: string;
  totalLabel?: React.ReactNode;
  className?: string;
  onRowClick?: (row: TData) => void;
}

/**
 * The app's single table implementation: TanStack Table v8 + the ported
 * shadcn-admin toolbar/facets/pagination, styled with this app's tokens.
 */
export function DataTable<TData>({
  columns,
  data,
  searchKey,
  searchPlaceholder,
  filters,
  toolbarActions,
  initialPageSize = 10,
  initialSorting = [],
  loading = false,
  emptyTitle = 'Nothing to show',
  emptyDescription,
  showPagination = true,
  maxHeight,
  totalLabel,
  className,
  onRowClick,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>(initialSorting);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});
  const [globalFilter, setGlobalFilter] = React.useState('');

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, columnVisibility, rowSelection, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: 'includesString',
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    initialState: { pagination: { pageSize: initialPageSize } },
  });

  const rows = table.getRowModel().rows;
  const matched = table.getFilteredRowModel().rows.length;
  const showToolbar = Boolean(searchKey || filters?.length || toolbarActions);

  return (
    <div className={cn('space-y-3', className)}>
      {showToolbar && (
        <DataTableToolbar
          table={table}
          searchKey={searchKey}
          searchPlaceholder={searchPlaceholder}
          filters={filters}
          actions={toolbarActions}
        />
      )}

      <TableShell
        sticky={Boolean(maxHeight)}
        style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}
        className="[&_thead_th]:bg-card"
      >
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} colSpan={header.colSpan}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: Math.min(initialPageSize, 6) }).map((_, i) => (
                <TableRow key={`skeleton-${i}`} className="hover:bg-transparent">
                  {columns.map((__, c) => (
                    <TableCell key={c}>
                      <Skeleton className="h-4 w-full max-w-[160px]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="p-0">
                  <EmptyState title={emptyTitle} description={emptyDescription} className="border-0" />
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cn(onRowClick && 'cursor-pointer')}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableShell>

      {showPagination && !loading && rows.length > 0 && (
        <div className="rounded-xl border border-border bg-card">
          <DataTablePagination table={table} totalLabel={totalLabel} />
        </div>
      )}

      {!loading && matched > 0 && (
        <p className="text-xs text-muted-foreground">
          Showing {rows.length} of {matched} matching rows ({data.length} total)
        </p>
      )}
    </div>
  );
}
