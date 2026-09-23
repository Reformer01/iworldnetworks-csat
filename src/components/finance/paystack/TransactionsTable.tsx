import { formatNairaNgn } from './FinanceKpiCards';
import { StatusChip } from '@/components/ui/status-chip';

function payStatusTone(status: string): 'green' | 'red' | 'amber' | 'slate' {
  const s = (status || '').toLowerCase();
  if (s === 'success' || s === 'paid') return 'green';
  if (s === 'failed') return 'red';
  if (s === 'abandoned' || s === 'pending') return 'amber';
  return 'slate';
}

function reconTone(status: string | null | undefined): 'green' | 'amber' | 'slate' {
  const s = (status || '').toLowerCase();
  if (s === 'matched') return 'green';
  if (s === 'mismatch' || s === 'missing') return 'amber';
  return 'slate';
}

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
      <div className="flex h-[160px] items-center justify-center rounded-2xl border border-border bg-white">
        <p className="font-mono text-[11px] uppercase tracking-widest opacity-60">No transactions found</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-white card-shadow">
      <table className="w-full min-w-[860px] text-left" aria-label="Transactions">
        <thead>
          <tr className="border-b text-[11px] uppercase tracking-[0.06em] text-muted-foreground font-medium whitespace-nowrap">
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
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.reference} className="transition-colors hover:bg-gray-50">
              <td className="max-w-[180px] truncate px-3 py-2.5 font-mono text-xs font-bold" title={row.reference}>
                {row.reference}
              </td>
              <td className="max-w-[180px] truncate px-3 py-2.5 text-xs" title={row.customerEmail || row.customer || ''}>
                {row.customer || row.customerEmail || '—'}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono tabular text-xs font-bold text-emerald-700">
                {formatNairaNgn(row.amountNaira)}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px]">{(row.channel || 'unknown').toLowerCase()}</td>
              <td className="whitespace-nowrap px-3 py-2.5"><StatusChip tone={payStatusTone(row.status)} label={(row.status || 'unknown').toLowerCase()} /></td>
              <td className="whitespace-nowrap px-3 py-2.5"><StatusChip tone={reconTone(row.reconStatus)} label={(row.reconStatus || '—').toLowerCase()} /></td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-[11px]">{formatVariance(row.varianceNaira)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
