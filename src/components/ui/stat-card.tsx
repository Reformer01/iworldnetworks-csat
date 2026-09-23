import * as React from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * KPI tile in the reference-template language (shadcn-fintech `financial-overview`
 * / satnaing KPI rows): label on top, big tabular figure, quiet detail line, and
 * an optional delta pill + sparkline. Deliberately has NO coloured icon chip —
 * icons sit inline at `size-4` and inherit the muted text colour.
 */
export type StatDelta = {
  value: string;
  direction?: 'up' | 'down' | 'flat';
  /** Colour the pill by sentiment instead of by direction (e.g. churn is "up" but bad). */
  tone?: 'positive' | 'negative' | 'neutral';
  label?: string;
};

export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: React.ReactNode;
  unit?: string;
  detail?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  delta?: StatDelta;
  /** Raw numbers rendered as a 40×14 sparkline under the value. */
  sparkline?: number[];
  loading?: boolean;
}

function Sparkline({ points, className }: { points: number[]; className?: string }) {
  if (points.length < 2) return null;
  const width = 96;
  const height = 28;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = width / (points.length - 1);
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(2)},${(height - ((p - min) / span) * height).toFixed(2)}`)
    .join(' ');
  const area = `${path} L${width},${height} L0,${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn('h-7 w-24 shrink-0 text-secondary', className)}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={area} className="fill-secondary/10" />
      <path d={path} className="fill-none stroke-current" strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  );
}

function deltaToneClasses(delta: StatDelta) {
  const tone = delta.tone ?? (delta.direction === 'down' ? 'negative' : delta.direction === 'flat' ? 'neutral' : 'positive');
  if (tone === 'positive') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400';
  if (tone === 'negative') return 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400';
  return 'bg-muted text-muted-foreground';
}

export function StatCard({
  label,
  value,
  unit,
  detail,
  icon: Icon,
  delta,
  sparkline,
  loading = false,
  className,
  ...props
}: StatCardProps) {
  const DeltaIcon = delta?.direction === 'down' ? ArrowDownRight : delta?.direction === 'flat' ? Minus : ArrowUpRight;

  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm transition-colors hover:border-border/80',
        className,
      )}
      {...props}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {Icon && <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
      </div>

      {loading ? (
        <Skeleton className="mt-4 h-8 w-24" />
      ) : (
        <div className="mt-3 flex items-end justify-between gap-3">
          <p className="font-headline text-2xl font-semibold leading-none tracking-tight tabular-nums">
            {value}
            {unit && <span className="ml-0.5 text-lg font-medium text-muted-foreground">{unit}</span>}
          </p>
          {sparkline && sparkline.length > 1 && <Sparkline points={sparkline} />}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        {delta && !loading && (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums',
              deltaToneClasses(delta),
            )}
          >
            <DeltaIcon className="size-3" />
            {delta.value}
          </span>
        )}
        {loading ? (
          <Skeleton className="h-3 w-28" />
        ) : (
          (detail || delta?.label) && (
            <p className="text-xs text-muted-foreground">{detail ?? delta?.label}</p>
          )
        )}
      </div>
    </div>
  );
}

/** Consistent KPI row used by every admin page. */
export function StatCardGrid({
  children,
  className,
  columns = 5,
}: {
  children: React.ReactNode;
  className?: string;
  columns?: 3 | 4 | 5 | 6;
}) {
  const cols = {
    3: 'sm:grid-cols-2 lg:grid-cols-3',
    4: 'sm:grid-cols-2 lg:grid-cols-4',
    5: 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
    6: 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6',
  }[columns];

  return <div className={cn('grid grid-cols-1 gap-4', cols, className)}>{children}</div>;
}

/** Loading placeholder that matches the StatCard geometry. */
export function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-4 h-8 w-20" />
      <Skeleton className="mt-3 h-3 w-32" />
    </div>
  );
}
