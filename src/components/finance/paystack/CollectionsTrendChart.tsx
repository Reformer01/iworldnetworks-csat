'use client';

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { PaystackOverviewPayload } from '@/lib/finance/paystack-aggregates';
import { formatNairaNgn } from './FinanceKpiCards';

type SeriesPoint = PaystackOverviewPayload['series'][number];

function compactNaira(value: number): string {
  if (value >= 1_000_000) return `₦${(value / 1_000_000).toLocaleString('en-NG', { maximumFractionDigits: 1 })}M`;
  if (value >= 1000) return `₦${(value / 1000).toLocaleString('en-NG', { maximumFractionDigits: 1 })}K`;
  return formatNairaNgn(value);
}

export function CollectionsTrendChart({ data }: { data: SeriesPoint[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-[240px] items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
        <p className="font-mono text-[11px] uppercase tracking-widest text-slate-500">No collections data for this period</p>
      </div>
    );
  }
  return (
    <ChartContainer config={{ collectedNaira: { label: 'Collected', color: '#10b981' } }} className="h-[240px] w-full">
      <AreaChart data={data} margin={{ left: 0, right: 12, top: 6 }}>
        <defs>
          <linearGradient id="paystackCollected" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
        <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={24} />
        <YAxis
          tickFormatter={(value: number) => compactNaira(value)}
          tick={{ fill: '#94a3b8', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={64}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              className="border-slate-700 bg-slate-900 text-slate-100"
              formatter={(value: unknown) => formatNairaNgn(Number(value))}
            />
          }
        />
        <Area type="monotone" dataKey="collectedNaira" name="Collected" stroke="#10b981" fill="url(#paystackCollected)" strokeWidth={2} />
      </AreaChart>
    </ChartContainer>
  );
}
