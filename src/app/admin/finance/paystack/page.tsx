'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import { useAuth, useUser } from '@/firebase';
import type { PaystackOverviewPayload } from '@/lib/finance/paystack-aggregates';
import { BreakdownBars } from '@/components/finance/paystack/BreakdownBars';
import { ChannelDonut } from '@/components/finance/paystack/ChannelDonut';
import { CollectionFunnel, type FunnelStage } from '@/components/finance/paystack/CollectionFunnel';
import { CollectionsTrendChart } from '@/components/finance/paystack/CollectionsTrendChart';
import { FinanceKpiCards, formatNairaNgn } from '@/components/finance/paystack/FinanceKpiCards';
import { RecentCollections } from '@/components/finance/paystack/RecentCollections';

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 md:p-5">
      <h2 className="font-display text-sm font-black uppercase tracking-tight text-white">{title}</h2>
      {sub && <p className="mt-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-slate-500">{sub}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default function PaystackOverviewPage() {
  const auth = useAuth();
  const { user } = useUser(auth);
  const [month, setMonth] = useState(currentMonth);
  const [reloadKey, setReloadKey] = useState(0);
  const [data, setData] = useState<PaystackOverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setDenied(false);
      try {
        const token = await user!.getIdToken();
        const res = await fetch(`/api/admin/finance/paystack/overview?month=${encodeURIComponent(month)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401 || res.status === 403) {
          if (!cancelled) setDenied(true);
          return;
        }
        const json = await res.json();
        if (!json.success) {
          if (!cancelled) setError(json.error || 'Failed to load overview');
          return;
        }
        if (!cancelled) setData(json.data as PaystackOverviewPayload);
      } catch {
        if (!cancelled) setError('Failed to load overview');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user, month, reloadKey]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center" role="status" aria-label="Loading overview">
        <Loader2 className="h-7 w-7 animate-spin text-emerald-300" />
      </div>
    );
  }

  if (denied) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-amber-300" />
        <h1 className="font-display text-lg font-black uppercase tracking-tight text-white">Access denied</h1>
        <p className="mt-1 font-mono text-[11px] text-slate-400">Your account does not have Paystack finance access.</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-red-400" />
        <p className="font-mono text-xs font-bold text-red-300">{error || 'No data'}</p>
        <button
          onClick={() => setReloadKey((k) => k + 1)}
          className="mt-4 rounded-full border border-white/15 px-5 py-2 font-mono text-[11px] font-bold uppercase tracking-widest text-slate-200"
        >
          Retry
        </button>
      </div>
    );
  }

  const attempted = data.series.reduce((sum, p) => sum + p.count, 0);
  const matchedNaira = Math.max(0, Math.round((data.kpis.collectedNaira - data.kpis.unmatchedNaira) * 100) / 100);
  const funnel: FunnelStage[] = [
    {
      label: 'Attempted',
      value: attempted.toLocaleString('en-NG'),
      pct:
        Math.max(attempted, data.kpis.successCount, 1) === attempted
          ? 100
          : (attempted / Math.max(attempted, data.kpis.successCount, 1)) * 100,
    },
    {
      label: 'Successful',
      value: `${data.kpis.successCount.toLocaleString('en-NG')} · ${data.kpis.successRate}%`,
      pct: attempted > 0 ? (data.kpis.successCount / attempted) * 100 : data.kpis.successCount > 0 ? 100 : 0,
    },
    { label: 'Collected', value: formatNairaNgn(data.kpis.collectedNaira), pct: data.kpis.collectedNaira > 0 ? 100 : 0 },
    {
      label: 'Reconciled',
      value: formatNairaNgn(matchedNaira),
      pct: data.kpis.collectedNaira > 0 ? (matchedNaira / data.kpis.collectedNaira) * 100 : 0,
    },
  ];
  const isEmpty = data.series.length === 0 && data.channels.length === 0 && data.recent.length === 0;

  return (
    <div>
      <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-black uppercase tracking-tight text-white md:text-3xl">Paystack Overview</h1>
          <p className="mt-1 font-mono text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Collections, channels, and reconciliation for {data.month}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={month}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            aria-label="Select month"
            className="rounded-full border border-white/15 bg-white/5 px-4 py-2 font-mono text-xs text-slate-100"
          />
          <button
            onClick={() => setReloadKey((k) => k + 1)}
            aria-label="Refresh overview"
            className="rounded-full border border-white/15 p-2 text-slate-200 hover:bg-white/10"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </header>

      <FinanceKpiCards kpis={data.kpis} />

      {isEmpty && (
        <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-center font-mono text-[11px] uppercase tracking-widest text-slate-500">
          No collections recorded for {data.month}
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Section title="Collections over time" sub="Successful Naira collected per day">
            <CollectionsTrendChart data={data.series} />
          </Section>
        </div>
        <Section title="Channel mix" sub="Share of collected revenue">
          <ChannelDonut data={data.channels} />
        </Section>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Section title="Top regions" sub="Collected revenue by region">
          <BreakdownBars items={data.regions.map((r) => ({ label: r.region, collectedNaira: r.collectedNaira, count: r.count }))} />
        </Section>
        <Section title="Collection funnel" sub="Attempted to reconciled">
          <CollectionFunnel stages={funnel} />
        </Section>
        <Section title="Recent collections" sub="Latest successful payments">
          <RecentCollections items={data.recent} />
        </Section>
      </div>
    </div>
  );
}
