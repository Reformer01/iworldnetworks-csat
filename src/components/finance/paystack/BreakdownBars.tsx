'use client';

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { formatNairaNgn } from './FinanceKpiCards';

export interface BreakdownItem {
  label: string;
  collectedNaira: number;
  count: number;
}

export function BreakdownBars({ items }: { items: BreakdownItem[] }) {
  if (!items || items.length === 0) {
    return (
      <div className="flex h-[240px] items-center justify-center rounded-2xl border border-border bg-white">
        <p className="font-mono text-[11px] uppercase tracking-widest opacity-60">No breakdown data for this period</p>
      </div>
    );
  }
  return (
    <div>
      <ChartContainer config={{ collectedNaira: { label: 'Collected', color: '#38bdf8' } }} className="h-[240px] w-full">
        <BarChart data={items} layout="vertical" margin={{ left: 8, right: 12 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e4e4e7" />
          <XAxis type="number" tick={{ fill: '#52525b', fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis
            type="category"
            dataKey="label"
            tick={{ fill: '#52525b', fontSize: 11, fontWeight: 700 }}
            width={92}
            axisLine={false}
            tickLine={false}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                className="border-border bg-white text-zinc-900"
                contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e4e4e7', color: '#18181b' }}
                formatter={(value: unknown) => formatNairaNgn(Number(value))}
              />
            }
          />
          <Bar dataKey="collectedNaira" name="Collected" fill="#38bdf8" radius={[0, 8, 8, 0]} barSize={18} />
        </BarChart>
      </ChartContainer>
      <ul className="mt-2 space-y-1.5">
        {items.slice(0, 6).map((row) => (
          <li key={row.label} className="flex items-center justify-between gap-2 font-mono text-[11px]">
            <span className="truncate font-bold">{row.label}</span>
            <span className="whitespace-nowrap">
              {formatNairaNgn(row.collectedNaira)} · {row.count.toLocaleString('en-NG')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
