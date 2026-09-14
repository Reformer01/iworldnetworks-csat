import { cn } from '@/lib/utils';
import type { PaystackOverviewPayload } from '@/lib/finance/paystack-aggregates';
import { formatNairaNgn } from './FinanceKpiCards';

type RecentRow = PaystackOverviewPayload['recent'][number];

export function RecentCollections({ items }: { items: RecentRow[] }) {
  if (!items || items.length === 0) {
    return (
      <div className="flex h-[160px] items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
        <p className="font-mono text-[11px] uppercase tracking-widest text-slate-500">No recent collections</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-left" aria-label="Recent collections">
        <thead>
          <tr className="border-b border-white/10 font-mono text-[9px] font-bold uppercase tracking-widest text-slate-500">
            <th scope="col" className="px-3 py-2">
              Reference
            </th>
            <th scope="col" className="px-3 py-2">
              Customer
            </th>
            <th scope="col" className="px-3 py-2 text-right">
              Amount
            </th>
            <th scope="col" className="px-3 py-2">
              Channel
            </th>
            <th scope="col" className="px-3 py-2 text-right">
              Paid
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {items.map((row) => (
            <tr key={row.reference} className="transition-colors hover:bg-white/5">
              <td className="max-w-[180px] truncate px-3 py-2.5 font-mono text-xs font-bold text-white" title={row.reference}>
                {row.reference}
              </td>
              <td className="max-w-[160px] truncate px-3 py-2.5 text-xs text-slate-300" title={row.customer}>
                {row.customer || '—'}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-xs font-bold text-emerald-300">
                {formatNairaNgn(row.amountNaira)}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={cn(
                    'inline-block rounded-full px-2 py-0.5 font-mono text-[10px] font-bold capitalize',
                    row.status === 'success' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300',
                  )}
                >
                  {(row.channel || row.status || 'unknown').toLowerCase()}
                </span>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-[11px] text-slate-400">
                {row.paidAt ? new Date(row.paidAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
