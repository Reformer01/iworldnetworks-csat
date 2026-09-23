import * as React from 'react';

import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export type ChartLegendItem = {
  label: string;
  /** Any CSS colour — use `var(--chart-1)` … `var(--chart-5)` or a Tailwind class via `className`. */
  color?: string;
  className?: string;
  value?: React.ReactNode;
  dashed?: boolean;
};

export interface ChartCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: React.ReactNode;
  legend?: ChartLegendItem[];
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  /** Tailwind height class for the chart body; templates use h-[260px]. */
  chartClassName?: string;
  loading?: boolean;
  children: React.ReactNode;
}

/**
 * The single chart shell used across the app (mirrors shadcn-fintech's
 * `FinancialOverview`): Card → CardHeader (title, description, inline legend
 * with colour dots + totals, actions on the right) → CardContent + ChartContainer.
 */
export function ChartCard({
  title,
  description,
  legend,
  actions,
  footer,
  chartClassName,
  loading = false,
  className,
  children,
  ...props
}: ChartCardProps) {
  return (
    <Card className={cn('overflow-hidden', className)} {...props}>
      <CardHeader className="flex flex-col gap-3 space-y-0 pb-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-base font-semibold tracking-tight">{title}</CardTitle>
          {description && <CardDescription className="text-xs">{description}</CardDescription>}
          {legend && legend.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground">
              {legend.map((item) => (
                <span key={item.label} className="flex items-center gap-1.5">
                  {item.dashed ? (
                    <span
                      className={cn('inline-block h-0 w-3 border-t-2 border-dashed border-current', item.className)}
                      style={item.color ? { color: item.color } : undefined}
                    />
                  ) : (
                    <span
                      className={cn('size-2 rounded-full bg-current', item.className)}
                      style={item.color ? { color: item.color, backgroundColor: item.color } : undefined}
                    />
                  )}
                  {item.label}
                  {item.value !== undefined && <span className="font-medium text-foreground tabular-nums">{item.value}</span>}
                </span>
              ))}
            </div>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </CardHeader>
      <CardContent className={cn('pt-0', chartClassName)}>
        {loading ? (
          <div className="flex h-[260px] w-full items-end gap-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="flex-1" style={{ height: `${30 + ((i * 37) % 60)}%` }} />
            ))}
          </div>
        ) : (
          children
        )}
      </CardContent>
      {footer && <div className="border-t border-border px-6 py-3 text-xs text-muted-foreground">{footer}</div>}
    </Card>
  );
}
