'use client';

import { Cell, Pie, PieChart } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { PaystackOverviewPayload } from '@/lib/finance/paystack-aggregates';
import { formatNairaNgn } from './FinanceKpiCards';

type ChannelPoint = PaystackOverviewPayload['channels'][number];

const CHANNEL_COLORS = ['#10b981', '#8b5cf6', '#f59e0b', '#38bdf8', '#f43f5e', '#94a3b8'];

export function ChannelDonut({ data }: { data: ChannelPoint[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-[240px] items-center justify-center rounded-2xl border border-border bg-white">
        <p className="font-mono text-[11px] uppercase tracking-widest opacity-60">No channel data for this period</p>
      </div>
    );
  }
  return (
    <div>
      <ChartContainer config={{ collectedNaira: { label: 'Collected' } }} className="h-[220px] w-full">
        <PieChart>
          <Pie
            data={data}
            dataKey="collectedNaira"
            nameKey="channel"
            cx="50%"
            cy="50%"
            innerRadius={56}
            outerRadius={84}
            paddingAngle={2}
            isAnimationActive
          >
            {data.map((_, i) => (
              <Cell key={i} fill={CHANNEL_COLORS[i % CHANNEL_COLORS.length]} />
            ))}
          </Pie>
          <ChartTooltip
            content={
              <ChartTooltipContent
                className="border-border bg-white text-zinc-900"
                contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e4e4e7', color: '#18181b' }}
                formatter={(value: unknown) => formatNairaNgn(Number(value))}
              />
            }
          />
        </PieChart>
      </ChartContainer>
      <ul className="mt-2 space-y-1.5">
        {data.map((row, i) => (
          <li key={row.channel} className="flex items-center gap-2 font-mono text-[11px] font-bold">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CHANNEL_COLORS[i % CHANNEL_COLORS.length] }} />
            <span className="truncate capitalize">{row.channel}</span>
            <span className="ml-auto whitespace-nowrap">
              {formatNairaNgn(row.collectedNaira)} · {row.count.toLocaleString('en-NG')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
