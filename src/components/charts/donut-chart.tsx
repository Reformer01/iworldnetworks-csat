'use client';

import * as React from 'react';
import { Cell, Pie, PieChart } from 'recharts';

import { cn } from '@/lib/utils';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';

export type DonutSlice = {
  name: string;
  value: number;
  /** Any CSS colour; defaults to `var(--chart-N)` by index. */
  color?: string;
};

export interface DonutChartProps {
  data: DonutSlice[];
  height?: number;
  /** Big figure in the hole (usually the total). */
  centerValue?: React.ReactNode;
  centerLabel?: React.ReactNode;
  valueSuffix?: string;
  className?: string;
}

/**
 * Donut with a centre KPI and per-slice tooltip — the template's category
 * breakdown pattern (shadcn-fintech analytics / satnaing dashboard).
 */
export function DonutChart({ data, height = 240, centerValue, centerLabel, valueSuffix = '', className }: DonutChartProps) {
  const config = React.useMemo(() => {
    const entries: ChartConfig = {};
    data.forEach((slice, index) => {
      entries[slice.name] = {
        label: slice.name,
        color: slice.color ?? `var(--chart-${(index % 5) + 1})`,
      };
    });
    return entries;
  }, [data]);

  const total = data.reduce((sum, slice) => sum + slice.value, 0);

  return (
    <div className={cn('relative', className)} style={{ height }}>
      <ChartContainer config={config} className="h-full w-full">
        <PieChart>
          <ChartTooltip
            content={<ChartTooltipContent nameKey="name" hideLabel />}
          />
          <Pie
            data={data.map((slice, index) => ({
              ...slice,
              fill: slice.color ?? `var(--chart-${(index % 5) + 1})`,
            }))}
            dataKey="value"
            nameKey="name"
            innerRadius="62%"
            outerRadius="92%"
            paddingAngle={2}
            strokeWidth={2}
            stroke="hsl(var(--card))"
          >
            {data.map((slice, index) => (
              <Cell key={slice.name} fill={slice.color ?? `var(--chart-${(index % 5) + 1})`} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
      {(centerValue !== undefined || centerLabel !== undefined) && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-headline text-2xl font-semibold tabular-nums leading-none">
            {centerValue ?? total.toLocaleString()}
            {valueSuffix}
          </span>
          {centerLabel && <span className="mt-1 text-xs text-muted-foreground">{centerLabel}</span>}
        </div>
      )}
    </div>
  );
}
