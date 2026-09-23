'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

export type BreakdownItem = {
  name: string;
  value: number;
  /** Optional share (0-100) shown as the right-hand figure instead of `value`. */
  percent?: number;
  /** Optional colour class for the bar fill; defaults to brand green. */
  barClassName?: string;
  hint?: React.ReactNode;
};

export interface BreakdownBarChartProps {
  items: BreakdownItem[];
  /** Value used to scale bar widths; defaults to the largest item. */
  max?: number;
  valueFormatter?: (item: BreakdownItem) => React.ReactNode;
  emptyLabel?: string;
  className?: string;
  barHeight?: string;
}

/**
 * Horizontal bar list used for ranking panels (regional pulse, top categories,
 * top staff). Pure layout — no chart library — so it stays crisp with long labels.
 */
export function BreakdownBarChart({
  items,
  max,
  valueFormatter,
  emptyLabel = 'No data for this period',
  className,
  barHeight = 'h-2',
}: BreakdownBarChartProps) {
  const peak = max ?? Math.max(1, ...items.map((i) => i.value));

  if (items.length === 0) {
    return <p className={cn('py-10 text-center text-xs text-muted-foreground', className)}>{emptyLabel}</p>;
  }

  return (
    <ul className={cn('space-y-3', className)}>
      {items.map((item) => (
        <li key={item.name} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-medium">{item.name}</span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {valueFormatter ? valueFormatter(item) : (item.percent ?? item.value).toLocaleString()}
              {typeof item.percent === 'number' && !valueFormatter ? '%' : ''}
            </span>
          </div>
          <div className={cn('w-full overflow-hidden rounded-full bg-muted', barHeight)}>
            <div
              className={cn('h-full rounded-full bg-secondary transition-[width] duration-500', item.barClassName)}
              style={{ width: `${Math.max(2, Math.round((item.value / peak) * 100))}%` }}
            />
          </div>
          {item.hint && <p className="text-xs text-muted-foreground">{item.hint}</p>}
        </li>
      ))}
    </ul>
  );
}
