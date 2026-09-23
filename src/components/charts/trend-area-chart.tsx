'use client';

import * as React from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, type DotProps } from 'recharts';

import { cn } from '@/lib/utils';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';

export type TrendSeries = {
  key: string;
  label: string;
  /** Any CSS colour — defaults to `var(--chart-N)` by index. */
  color?: string;
  dashed?: boolean;
  /** `line` renders a hairline without fill (comparison series). */
  variant?: 'area' | 'line';
};

export interface TrendAreaChartProps {
  data: Array<Record<string, unknown>>;
  xKey: string;
  series: TrendSeries[];
  height?: number;
  yDomain?: [number | 'auto', number | 'auto'];
  yTickFormatter?: (value: number) => string;
  valueFormatter?: (value: number, series: TrendSeries) => React.ReactNode;
  xTickFormatter?: (value: string) => string;
  connectNulls?: boolean;
  className?: string;
}

function SquareDot({ cx, cy, fill, opacity = 1, size = 6 }: DotProps & { size?: number; opacity?: number }) {
  if (cx == null || cy == null) return null;
  return <rect x={Number(cx) - size / 2} y={Number(cy) - size / 2} width={size} height={size} fill={fill} fillOpacity={opacity} rx={1} />;
}

/**
 * Multi-series trend chart in the shadcn-fintech `FinancialOverview` language:
 * `linear` polyline, gradient area fill on the primary series, faint comparison
 * line, square markers, dashed muted grid, hidden axis lines, and the shared
 * `ChartTooltipContent`.
 */
export function TrendAreaChart({
  data,
  xKey,
  series,
  height = 260,
  yDomain,
  yTickFormatter,
  valueFormatter,
  xTickFormatter,
  connectNulls = true,
  className,
}: TrendAreaChartProps) {
  const gidFor = React.useCallback((key: string) => `fill-${xKey}-${key}`.replace(/[^a-zA-Z0-9-_]/g, '-'), [xKey]);

  const config = React.useMemo(() => {
    const entries: ChartConfig = {};
    for (const [index, s] of series.entries()) {
      entries[s.key] = { label: s.label, color: s.color ?? `var(--chart-${(index % 5) + 1})` };
    }
    return entries;
  }, [series]);

  return (
    <ChartContainer config={config} className={cn('aspect-auto', className)} style={{ height }}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          {series.map((s, index) => {
            const color = s.color ?? `var(--chart-${(index % 5) + 1})`;
            const gid = gidFor(s.key);
            return (
              <linearGradient key={s.key} id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={s.variant === 'line' ? 0 : 0.2} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            );
          })}
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.5} />
        <XAxis
          dataKey={xKey}
          tickLine={false}
          axisLine={false}
          fontSize={12}
          tickMargin={8}
          stroke="hsl(var(--muted-foreground))"
          tickFormatter={xTickFormatter}
          minTickGap={24}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          fontSize={12}
          tickMargin={8}
          width={48}
          domain={yDomain ?? ['auto', 'auto']}
          stroke="hsl(var(--muted-foreground))"
          tickFormatter={yTickFormatter}
          minTickGap={24}
        />
        <ChartTooltip
          cursor={{ stroke: 'hsl(var(--border))', strokeDasharray: '3 3' }}
          content={
            <ChartTooltipContent
              indicator="dot"
              formatter={(value, name) => {
                const s = series.find((item) => item.key === name || item.label === name);
                const numeric = Number(value);
                return (
                  <span className="flex w-full items-center justify-between gap-3">
                    <span className="text-muted-foreground">{s?.label ?? String(name)}</span>
                    <span className="font-medium tabular-nums text-foreground">
                      {valueFormatter ? valueFormatter(numeric, s as TrendSeries) : numeric.toLocaleString()}
                    </span>
                  </span>
                );
              }}
            />
          }
        />
        {series.map((s, index) => {
          const color = s.color ?? `var(--chart-${(index % 5) + 1})`;
          const isLine = s.variant === 'line';
          return (
            <Area
              key={s.key}
              type="linear"
              dataKey={s.key}
              name={s.key}
              stroke={color}
              strokeWidth={isLine ? 1.5 : 2}
              strokeDasharray={s.dashed ? '6 4' : undefined}
              strokeOpacity={isLine ? 0.3 : 1}
              fill={isLine ? 'transparent' : `url(#${gidFor(s.key)})`}
              connectNulls={connectNulls}
              dot={<SquareDot fill={color} size={isLine ? 5 : 6} opacity={isLine ? 0.3 : 1} />}
              activeDot={<SquareDot fill={color} size={9} />}
            />
          );
        })}
      </AreaChart>
    </ChartContainer>
  );
}
