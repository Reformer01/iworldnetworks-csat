'use client';

import React, { useState, useEffect } from 'react';
import { SalesLayout } from '@/components/layout/SalesLayout';
import { useAuth, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { useSalesMetrics } from '@/hooks/use-sales-data';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Target } from 'lucide-react';
import { salesAgents, regionalTargets } from '@/lib/sales-staff';
import type { RegionMetrics } from '@/lib/sales-types';

function formatNaira(amount: number) {
  if (amount >= 1000000) return 'NGN' + (amount / 1000000).toFixed(1) + 'M';
  return 'NGN' + amount.toLocaleString();
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-full bg-surface-container-low rounded-full h-2 overflow-hidden">
      <div
        className={cn("h-full rounded-full transition-all duration-700", pct >= 100 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-400")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function SalesTargets() {
  const auth = useAuth();
  const { user } = useUser(auth);
  const { toast } = useToast();
  const { data: metrics } = useSalesMetrics();
  const [customTargets, setCustomTargets] = useState<{ id?: string; month: string; region: string; targetRevenue: number; targetCustomers: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTarget, setNewTarget] = useState({ month: '', region: '', targetRevenue: 0, targetCustomers: 0 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchTargets = async () => {
      if (!user) return;
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/admin/sales/targets', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const result = await res.json();
          setCustomTargets(result.data?.targets || []);
        }
      } catch { /* ignore */ }
      setLoading(false);
    };
    fetchTargets();
  }, [user]);

  const handleSaveTarget = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/sales/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(newTarget),
      });
      if (!res.ok) throw new Error('Failed to save');
      toast({ title: "Saved", description: "Target added." });
      setNewTarget({ month: '', region: '', targetRevenue: 0, targetCustomers: 0 });
      const result = await res.json();
      setCustomTargets(prev => [...prev, { id: result.data?.id, ...newTarget }]);
    } catch (e: unknown) {
      toast({ variant: "destructive", title: "Error", description: e instanceof Error ? e.message : 'Failed to save target' });
    }
    setSaving(false);
  };

  return (
    <SalesLayout>
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-primary uppercase tracking-tight">Targets</h1>
          <p className="text-on-surface-variant font-mono text-[10px] uppercase tracking-widest font-bold mt-1">Set monthly goals</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-12">
        <div className="lg:col-span-4">
          <div className="bg-white p-8 rounded-2xl whisper-shadow border border-border">
            <h3 className="font-display font-bold text-lg uppercase tracking-tight mb-6">Add Monthly Target</h3>
            <div className="space-y-4">
              <div>
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Year-Month</label>
                <Input className="rounded-xl mt-1" placeholder="2026-06" value={newTarget.month} onChange={(e) => setNewTarget({ ...newTarget, month: e.target.value })} />
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Region</label>
                <Select value={newTarget.region} onValueChange={(v) => setNewTarget({ ...newTarget, region: v })}>
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select region" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Regions</SelectItem>
                    {['Ogun', 'Oyo', 'Osun', 'Ondo'].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Revenue Goal (₦)</label>
                <Input className="rounded-xl mt-1" type="number" value={newTarget.targetRevenue || ''} onFocus={(e) => e.target.select()} onChange={(e) => setNewTarget({ ...newTarget, targetRevenue: e.target.value === '' ? 0 : Number(e.target.value) })} />
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">New Customers Goal</label>
                <Input className="rounded-xl mt-1" type="number" value={newTarget.targetCustomers || ''} onFocus={(e) => e.target.select()} onChange={(e) => setNewTarget({ ...newTarget, targetCustomers: e.target.value === '' ? 0 : Number(e.target.value) })} />
              </div>
              <Button className="w-full rounded-full bg-secondary text-white font-mono text-[10px] uppercase font-bold py-6" onClick={handleSaveTarget} disabled={saving}>
                {saving && <Loader2 className="w-3 h-3 animate-spin mr-2" />} Save Target
              </Button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-8">
          <div className="bg-white rounded-2xl whisper-shadow border border-border p-8">
            <h3 className="font-display font-bold text-lg uppercase tracking-tight mb-8">Annual Targets by Region</h3>
            <div className="space-y-8">
              {regionalTargets.map((rt) => {
                const regionMetric = metrics?.regionMetrics?.find((r: RegionMetrics) => r.region === rt.region);
                const currentMrr = regionMetric?.mrr || 0;
                const attainmentPct = rt.annualRevenueTarget > 0 ? Math.min((currentMrr / rt.annualRevenueTarget) * 100, 100) : 0;
                return (
                  <div key={rt.region} className="border border-border rounded-2xl p-6">
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex items-center gap-3">
                        <h4 className="font-bold text-lg text-primary">{rt.region}</h4>
                        <span className={cn(
                          "font-mono text-[9px] px-2.5 py-0.5 rounded-full font-bold",
                          attainmentPct >= 100 ? "bg-green-100 text-green-600" : attainmentPct >= 50 ? "bg-yellow-100 text-yellow-600" : "bg-red-100 text-red-600"
                        )}>
                          {attainmentPct.toFixed(0)}% attained
                        </span>
                      </div>
                      <span className="font-mono text-[10px] bg-secondary/10 text-secondary px-3 py-1 rounded-full font-bold">{rt.targetPercentage}% of total</span>
                    </div>
                    <div className="mb-4">
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="font-mono text-[9px] uppercase font-bold text-on-surface-variant">MRR vs Annual Target</span>
                        <span className="font-mono text-[9px] font-bold text-on-surface-variant">{formatNaira(currentMrr)} / {formatNaira(rt.annualRevenueTarget)}</span>
                      </div>
                      <ProgressBar value={currentMrr} max={rt.annualRevenueTarget} />
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div className="bg-surface-container-lowest rounded-xl p-4">
                        <p className="font-mono text-[9px] uppercase font-bold text-on-surface-variant">Annual Revenue Target</p>
                        <p className="text-lg font-bold text-primary mt-1">{formatNaira(rt.annualRevenueTarget)}</p>
                      </div>
                      <div className="bg-surface-container-lowest rounded-xl p-4">
                        <p className="font-mono text-[9px] uppercase font-bold text-on-surface-variant">Monthly Target</p>
                        <p className="text-lg font-bold text-primary mt-1">{formatNaira(rt.monthlyTarget)}</p>
                      </div>
                      <div className="bg-surface-container-lowest rounded-xl p-4">
                        <p className="font-mono text-[9px] uppercase font-bold text-on-surface-variant">Customer Target</p>
                        <p className="text-lg font-bold text-primary mt-1">{rt.annualCustomerTarget}</p>
                      </div>
                    </div>
                    <div className="mt-4">
                      <p className="font-mono text-[9px] uppercase font-bold text-on-surface-variant mb-2">Sales Agents</p>
                      <div className="flex flex-wrap gap-2">
                        {salesAgents.filter(a => a.region === rt.region).map(a => (
                          <span key={a.name} className="font-mono text-[10px] bg-muted px-3 py-1 rounded-full font-bold">{a.name} (₦{a.annualTarget.toLocaleString()})</span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {customTargets.length > 0 && (
              <div className="mt-8">
                <h3 className="font-display font-bold text-lg uppercase tracking-tight mb-6">Custom Monthly Targets</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-border/80 font-mono text-[10px] text-on-surface-variant font-bold uppercase tracking-widest">
                        <th className="pb-4">Month</th>
                        <th className="pb-4">Region</th>
                        <th className="pb-4 text-right">Revenue Target</th>
                        <th className="pb-4 text-right">Customer Target</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40 font-body text-sm">
                      {customTargets.map((t: { id?: string; month: string; region: string; targetRevenue: number; targetCustomers: number }) => (
                        <tr key={t.id} className="hover:bg-surface-container-lowest transition-colors">
                          <td className="py-3 font-bold text-primary">{t.month}</td>
                          <td className="py-3 font-mono">{t.region}</td>
                          <td className="py-3 text-right font-mono font-bold">{formatNaira(t.targetRevenue)}</td>
                          <td className="py-3 text-right font-mono">{t.targetCustomers}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </SalesLayout>
  );
}
