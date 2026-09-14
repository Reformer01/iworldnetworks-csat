import { ArrowDownUp, BadgePercent, CircleAlert, HandCoins, Receipt, Undo2 } from 'lucide-react';
import type { PaystackOverviewPayload } from '@/lib/finance/paystack-aggregates';

export type FinanceKpis = PaystackOverviewPayload['kpis'];

export function formatNairaNgn(value: number | null | undefined): string {
  return `₦${(Number(value) || 0).toLocaleString('en-NG')}`;
}

export function FinanceKpiCards({ kpis }: { kpis: FinanceKpis }) {
  const cards = [
    { label: 'Collected revenue', value: formatNairaNgn(kpis.collectedNaira), sub: `${kpis.successCount} successful`, Icon: HandCoins },
    { label: 'Success rate', value: `${kpis.successRate}%`, sub: `${kpis.successCount} successful`, Icon: BadgePercent },
    {
      label: 'Successful transactions',
      value: kpis.successCount.toLocaleString('en-NG'),
      sub: `${kpis.successRate}% success rate`,
      Icon: Receipt,
    },
    { label: 'Unmatched value', value: formatNairaNgn(kpis.unmatchedNaira), sub: 'Needs reconciliation', Icon: ArrowDownUp },
    { label: 'Refunded', value: formatNairaNgn(kpis.refundedNaira), sub: 'Returned to customers', Icon: Undo2 },
    { label: 'Open disputes', value: kpis.disputeCount.toLocaleString('en-NG'), sub: 'Needs follow-up', Icon: CircleAlert },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {cards.map(({ label, value, sub, Icon }) => (
        <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 shrink-0 text-emerald-300" />
            <p className="truncate font-mono text-[9px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
          </div>
          <p className="mt-2 truncate font-display text-xl font-black text-white" title={value}>
            {value}
          </p>
          <p className="mt-1 truncate font-mono text-[10px] text-slate-500" title={sub}>
            {sub}
          </p>
        </div>
      ))}
    </div>
  );
}
