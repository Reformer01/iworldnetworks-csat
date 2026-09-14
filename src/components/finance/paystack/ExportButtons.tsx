'use client';

import { useState } from 'react';

export interface ExportScopeItem {
  scope: string;
  label: string;
  month?: string;
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ExportButtons({
  items,
  getToken,
  onGeneratePdf,
  pdfLabel = 'Download PDF',
  pdfDisabled = false,
}: {
  items: ExportScopeItem[];
  getToken: () => Promise<string | null>;
  onGeneratePdf?: () => void | Promise<void>;
  pdfLabel?: string;
  pdfDisabled?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function downloadScope(item: ExportScopeItem) {
    setBusy(item.scope + item.label);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      const params = new URLSearchParams({ format: 'csv', scope: item.scope });
      if (item.month) params.set('month', item.month);
      const res = await fetch(`/api/admin/finance/paystack/reports?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const csv = await res.text();
      downloadCsv(`paystack-${item.scope}${item.month ? `-${item.month}` : ''}.csv`, csv);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div aria-label="Export">
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <button
            key={`${item.scope}-${item.label}`}
            onClick={() => void downloadScope(item)}
            disabled={busy != null}
            className="rounded-full border border-white/15 px-3.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-widest text-slate-200 hover:bg-white/10 disabled:opacity-50"
          >
            {busy === item.scope + item.label ? 'Exporting…' : item.label}
          </button>
        ))}
        {onGeneratePdf && (
          <button
            onClick={() => void onGeneratePdf()}
            disabled={pdfDisabled}
            className="rounded-full bg-emerald-500 px-3.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-widest text-[#0a0f1e] disabled:opacity-50"
          >
            {pdfLabel}
          </button>
        )}
      </div>
      {error && <p className="mt-1 font-mono text-[11px] text-red-300">{error}</p>}
    </div>
  );
}
