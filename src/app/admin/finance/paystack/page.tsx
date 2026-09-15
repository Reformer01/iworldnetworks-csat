'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Download, Loader2, RefreshCw, ShieldAlert, GitCompare } from 'lucide-react';
import { useAuth, useUser } from '@/firebase';
import { isSuperAdmin } from '@/lib/admin-config';
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
    <section className="rounded-2xl border border-border bg-white p-4 whisper-shadow md:p-5">
      <h2 className="font-display text-sm font-black uppercase tracking-tight">{title}</h2>
      {sub && <p className="mt-0.5 font-mono text-[10px] font-bold uppercase tracking-widest opacity-60">{sub}</p>}
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
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [reconMessage, setReconMessage] = useState<string | null>(null);

  const canSync = isSuperAdmin(user?.email || '');

  async function handleSync() {
    if (!user || syncing) return;
    setSyncing(true);
    setSyncMessage(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/finance/paystack/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ maxPages: 100 }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setSyncMessage(json?.error || `Sync failed (HTTP ${res.status})`);
        return;
      }
      const jobId = json.data?.jobId as string | undefined;
      if (!jobId) {
        setSyncMessage('Sync failed to start — no job id returned');
        return;
      }
      // Poll the job until it completes or fails (backfills outlive the proxy).
      for (let attempt = 0; attempt < 120; attempt++) {
        await new Promise((r) => setTimeout(r, 3000));
        const pollToken = await user.getIdToken();
        const poll = await fetch(`/api/admin/finance/paystack/sync?jobId=${encodeURIComponent(jobId)}`, {
          headers: { Authorization: `Bearer ${pollToken}` },
        });
        const pollJson = await poll.json().catch(() => null);
        if (!poll.ok || !pollJson?.success) {
          setSyncMessage(pollJson?.error || `Sync status check failed (HTTP ${poll.status})`);
          return;
        }
        const status = pollJson.data?.status as string;
        const progress = (pollJson.data?.progress ?? {}) as { fetched?: number; upserted?: number };
        const result = (pollJson.data?.result ?? null) as { fetched?: number; upserted?: number } | null;
        if (status === 'completed') {
          const fetched = result?.fetched ?? progress.fetched ?? 0;
          const upserted = result?.upserted ?? progress.upserted ?? 0;
          setSyncMessage(`Synced ${fetched.toLocaleString('en-NG')} transactions, stored ${upserted.toLocaleString('en-NG')}`);
          setReloadKey((k) => k + 1);
          return;
        }
        if (status === 'failed') {
          setSyncMessage(pollJson.data?.error || 'Sync failed — retry from the queue');
          return;
        }
        const fetched = Number(progress.fetched ?? 0);
        setSyncMessage(`Syncing… ${fetched.toLocaleString('en-NG')} fetched`);
      }
      setSyncMessage('Sync still running — refresh to check progress');
    } catch {
      setSyncMessage('Sync failed — check your connection and retry');
    } finally {
      setSyncing(false);
    }
  }

  async function handleReconcile() {
    if (!user || reconciling) return;
    setReconciling(true);
    setReconMessage(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/finance/paystack/reconciliation/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ month }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setReconMessage(json?.error || `Reconciliation failed (HTTP ${res.status})`);
        return;
      }
      const jobId = json.data?.jobId as string | undefined;
      if (!jobId) {
        setReconMessage('Reconciliation failed to start — no job id returned');
        return;
      }
      for (let attempt = 0; attempt < 120; attempt++) {
        await new Promise((r) => setTimeout(r, 3000));
        const pollToken = await user.getIdToken();
        const poll = await fetch(`/api/admin/finance/paystack/reconciliation/sync?jobId=${encodeURIComponent(jobId)}`, {
          headers: { Authorization: `Bearer ${pollToken}` },
        });
        const pollJson = await poll.json().catch(() => null);
        if (!poll.ok || !pollJson?.success) {
          setReconMessage(pollJson?.error || `Reconciliation status check failed (HTTP ${poll.status})`);
          return;
        }
        const status = pollJson.data?.status as string;
        const progress = (pollJson.data?.progress ?? {}) as {
          stage?: string;
          fetched?: number;
          upserted?: number;
          matched?: number;
          paystackOnly?: number;
          splynxOnly?: number;
          amountMismatch?: number;
          dateMismatch?: number;
          duplicate?: number;
          exceptionsCreated?: number;
        };
        const result = (pollJson.data?.result ?? null) as typeof progress | null;
        if (status === 'completed') {
          const m = result?.matched ?? progress.matched ?? 0;
          const po = result?.paystackOnly ?? progress.paystackOnly ?? 0;
          const so = result?.splynxOnly ?? progress.splynxOnly ?? 0;
          const am = result?.amountMismatch ?? progress.amountMismatch ?? 0;
          const dm = result?.dateMismatch ?? progress.dateMismatch ?? 0;
          const dup = result?.duplicate ?? progress.duplicate ?? 0;
          setReconMessage(
            `Matched ${m}, Paystack-only ${po}, Splynx-only ${so}, Amount mismatches ${am}, Date mismatches ${dm}, Duplicates ${dup}`,
          );
          setReloadKey((k) => k + 1);
          return;
        }
        if (status === 'failed') {
          setReconMessage(pollJson.data?.error || 'Reconciliation failed — retry from the queue');
          return;
        }
        if (progress.stage === 'import') {
          const fetched = Number(progress.fetched ?? 0);
          const upserted = Number(progress.upserted ?? 0);
          setReconMessage(`Importing Splynx… ${fetched.toLocaleString('en-NG')} fetched, ${upserted.toLocaleString('en-NG')} stored`);
        } else if (progress.stage === 'match') {
          const psCount = Number(progress.fetched ?? 0);
          const spCount = Number(progress.upserted ?? 0);
          setReconMessage(`Matching… ${psCount.toLocaleString('en-NG')} Paystack / ${spCount.toLocaleString('en-NG')} Splynx`);
        } else {
          setReconMessage('Reconciling…');
        }
      }
      setReconMessage('Reconciliation still running — refresh to check progress');
    } catch {
      setReconMessage('Reconciliation failed — check your connection and retry');
    } finally {
      setReconciling(false);
    }
  }

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
        <Loader2 className="h-7 w-7 animate-spin text-secondary" />
      </div>
    );
  }

  if (denied) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-amber-600" />
        <h1 className="font-display text-lg font-black uppercase tracking-tight">Access denied</h1>
        <p className="mt-1 font-mono text-[11px] opacity-60">Your account does not have Paystack finance access.</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-red-500" />
        <p className="font-mono text-xs font-bold text-red-600">{error || 'No data'}</p>
        <button
          onClick={() => setReloadKey((k) => k + 1)}
          className="mt-4 rounded-full border border-border bg-white px-5 py-2 font-mono text-[11px] font-bold uppercase tracking-widest hover:bg-gray-50"
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
          <h1 className="font-display text-2xl font-black uppercase tracking-tight md:text-3xl">Paystack Overview</h1>
          <p className="mt-1 font-mono text-[10px] font-bold uppercase tracking-widest opacity-60">
            Collections, channels, and reconciliation for {data.month}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={month}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            aria-label="Select month"
            className="rounded-full border border-border bg-white px-4 py-2 font-mono text-xs"
          />
          <button
            onClick={() => setReloadKey((k) => k + 1)}
            aria-label="Refresh overview"
            className="rounded-full border border-border bg-white p-2 hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          {canSync && (
            <>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="flex items-center gap-2 rounded-full bg-secondary px-5 py-2 font-mono text-[11px] font-bold uppercase tracking-widest text-white disabled:opacity-60"
              >
                {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {syncing ? 'Syncing…' : 'Sync Paystack'}
              </button>
              <button
                onClick={handleReconcile}
                disabled={reconciling}
                className="flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2 font-mono text-[11px] font-bold uppercase tracking-widest text-white disabled:opacity-60"
              >
                {reconciling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitCompare className="h-3.5 w-3.5" />}
                {reconciling ? 'Reconciling…' : 'Reconcile'}
              </button>
            </>
          )}
        </div>
      </header>
      {syncMessage && (
        <p className="mb-4 rounded-2xl border border-border bg-white p-3 text-center font-mono text-[11px] font-bold uppercase tracking-widest opacity-80">
          {syncMessage}
        </p>
      )}
      {reconMessage && (
        <p className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-center font-mono text-[11px] font-bold uppercase tracking-widest text-emerald-800">
          {reconMessage}
        </p>
      )}

      <FinanceKpiCards kpis={data.kpis} />

      {isEmpty && (
        <p className="mt-4 rounded-2xl border border-border bg-white p-4 text-center font-mono text-[11px] uppercase tracking-widest opacity-60">
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
