import { formatNairaNgn } from './FinanceKpiCards';

export interface FinanceTransactionRow {
  reference: string;
  customer?: string | null;
  customerEmail?: string | null;
  amountNaira: number;
  channel?: string | null;
  status: string;
  reconStatus?: string | null;
  varianceNaira?: number | null;
  paidAt?: string | null;
}

function formatVariance(value: number | null | undefined): string {
  if (value == null) return '—';
  const rounded = Math.round(value * 100) / 100;
  return `₦${rounded.toLocaleString('en-NG')}`;
}

export function TransactionsTable({ rows }: { rows: FinanceTransactionRow[] }) {
  if (!rows || rows.length === 0) {
    return (
      <div className="flex h-[160px] items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
        <p className="font-mono text-[11px] uppercase tracking-widest text-slate-500">No transactions found</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10">
      <table className="w-full min-w-[860px] border-collapse text-left" aria-label="Transactions">
        <thead>
          <tr className="border-b border-white/10 bg-white/[0.03] font-mono text-[9px] font-bold uppercase tracking-widest text-slate-500">
            <th scope="col" className="px-3 py-2.5">
              Reference
            </th>
            <th scope="col" className="px-3 py-2.5">
              Customer
            </th>
            <th scope="col" className="px-3 py-2.5 text-right">
              Amount
            </th>
            <th scope="col" className="px-3 py-2.5">
              Channel
            </th>
            <th scope="col" className="px-3 py-2.5">
              Payment status
            </th>
            <th scope="col" className="px-3 py-2.5">
              Reconciliation status
            </th>
            <th scope="col" className="px-3 py-2.5 text-right">
              Variance
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((row) => (
            <tr key={row.reference} className="transition-colors hover:bg-white/5">
              <td className="max-w-[180px] truncate px-3 py-2.5 font-mono text-xs font-bold text-white" title={row.reference}>
                {row.reference}
              </td>
              <td className="max-w-[180px] truncate px-3 py-2.5 text-xs text-slate-300" title={row.customerEmail || row.customer || ''}>
                {row.customer || row.customerEmail || '—'}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-xs font-bold text-emerald-300">
                {formatNairaNgn(row.amountNaira)}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] text-slate-300">
                {(row.channel || 'unknown').toLowerCase()}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] text-slate-300">
                {(row.status || 'unknown').toLowerCase()}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] text-slate-300">
                {(row.reconStatus || '—').toLowerCase()}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-[11px] text-slate-300">
                {formatVariance(row.varianceNaira)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
