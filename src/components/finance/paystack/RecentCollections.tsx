import { cn } from '@/lib/utils';
import type { PaystackOverviewPayload } from '@/lib/finance/paystack-aggregates';
import { formatNairaNgn } from './FinanceKpiCards';

type RecentRow = PaystackOverviewPayload['recent'][number];

export function RecentCollections({ items }: { items: RecentRow[] }) {
  if (!items || items.length === 0) {
    return (
      <div className="flex h-[160px] items-center justify-center rounded-2xl border border-border bg-white">
        <p className="font-mono text-[11px] uppercase tracking-widest opacity-60">No recent collections</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left" aria-label="Recent collections">
        <thead>
          <tr className="border-b font-mono text-[10px] uppercase font-bold opacity-60 whitespace-nowrap">
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
        <tbody className="divide-y">
          {items.map((row) => (
            <tr key={row.reference} className="transition-colors hover:bg-gray-50">
              <td className="max-w-[180px] truncate px-3 py-2.5 font-mono text-xs font-bold" title={row.reference}>
                {row.reference}
              </td>
              <td className="max-w-[160px] truncate px-3 py-2.5 text-xs" title={row.customer}>
                {row.customer || '—'}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-xs font-bold text-emerald-700">
                {formatNairaNgn(row.amountNaira)}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={cn(
                    'inline-block rounded-full px-2 py-0.5 font-mono text-[10px] font-bold capitalize',
                    row.status === 'success' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700',
                  )}
                >
                  {(row.channel || row.status || 'unknown').toLowerCase()}
                </span>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-[11px] opacity-60">
                {row.paidAt ? new Date(row.paidAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
