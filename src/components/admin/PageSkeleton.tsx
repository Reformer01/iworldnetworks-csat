'use client';

import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  KPI Card Skeleton                                                  */
/* ------------------------------------------------------------------ */

export function KpiSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('bg-white p-6 rounded-2xl whisper-shadow border border-border', className)}>
      <Skeleton className="w-6 h-6 rounded-md mb-4" />
      <Skeleton className="h-3 w-24 mb-2" />
      <Skeleton className="h-8 w-20" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Table Skeleton                                                     */
/* ------------------------------------------------------------------ */

export function TableSkeleton({
  rows = 5,
  columns = 4,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <div className={cn('bg-white rounded-2xl whisper-shadow border border-border overflow-hidden', className)}>
      {/* Header */}
      <div className="flex gap-4 px-6 py-4 border-b border-border">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="flex gap-4 px-6 py-4 border-b border-border/40">
          {Array.from({ length: columns }).map((_, col) => (
            <Skeleton key={col} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Chart Skeleton                                                     */
/* ------------------------------------------------------------------ */

export function ChartSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('bg-white p-6 rounded-2xl whisper-shadow border border-border', className)}>
      <Skeleton className="h-4 w-32 mb-6" />
      <div className="flex items-end gap-2 h-48">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton
            key={i}
            className="flex-1 rounded-t"
            style={{ height: `${30 + Math.random() * 70}%` }}
          />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page Skeleton — full-page loading state                            */
/* ------------------------------------------------------------------ */

export function PageSkeleton({
  kpiCount = 4,
  tableRows = 5,
  tableColumns = 4,
  showChart = false,
  className,
}: {
  kpiCount?: number;
  tableRows?: number;
  tableColumns?: number;
  showChart?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-3 w-64" />
        </div>
        <Skeleton className="h-9 w-28 rounded-full" />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: kpiCount }).map((_, i) => (
          <KpiSkeleton key={i} />
        ))}
      </div>

      {/* Chart */}
      {showChart && <ChartSkeleton />}

      {/* Table */}
      <TableSkeleton rows={tableRows} columns={tableColumns} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Card Grid Skeleton — for card-based layouts                        */
/* ------------------------------------------------------------------ */

export function CardGridSkeleton({
  count = 6,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn('grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white p-5 rounded-2xl whisper-shadow border border-border">
          <div className="flex items-start justify-between mb-4">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ))}
    </div>
  );
}
