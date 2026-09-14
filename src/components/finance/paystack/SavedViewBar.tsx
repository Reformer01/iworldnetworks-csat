'use client';

import { useEffect, useState } from 'react';

export interface FinanceSavedView {
  id: string;
  name: string;
  scope: string;
  filters: Record<string, unknown>;
  grouping?: string | null;
  metric?: string | null;
  mode: string;
}

export function SavedViewBar({
  scope,
  currentFilters,
  getToken,
  canManage,
  onApply,
}: {
  scope: string;
  currentFilters: Record<string, unknown>;
  getToken: () => Promise<string | null>;
  canManage: boolean;
  onApply: (filters: Record<string, unknown>) => void;
}) {
  const [views, setViews] = useState<FinanceSavedView[]>([]);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const token = await getToken();
      if (!token) return;
      try {
        const res = await fetch(`/api/admin/finance/paystack/saved-views?scope=${encodeURIComponent(scope)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!cancelled && json.success) setViews(json.data.items as FinanceSavedView[]);
      } catch {
        if (!cancelled) setError('Failed to load saved views');
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [scope, getToken]);

  async function save() {
    const trimmed = name.trim().slice(0, 191);
    if (!trimmed) {
      setError('Name is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      const res = await fetch('/api/admin/finance/paystack/saved-views', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, scope, filters: currentFilters, mode: 'private' }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to save view');
      setViews((v) => [json.data as FinanceSavedView, ...v]);
      setName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save view');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-white p-3 whisper-shadow" aria-label="Saved views">
      <p className="font-mono text-[10px] font-bold uppercase tracking-widest opacity-60">Saved views</p>
      {views.length === 0 ? (
        <p className="mt-1 font-mono text-[11px] opacity-60">No saved views yet</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {views.map((view) => (
            <button
              key={view.id}
              onClick={() => onApply((view.filters as Record<string, unknown>) || {})}
              title={view.name}
              className="rounded-full border border-border bg-white px-3 py-1 font-mono text-[11px] hover:bg-gray-50"
            >
              {view.name}
            </button>
          ))}
        </div>
      )}
      {canManage && (
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={name}
            maxLength={191}
            onChange={(e) => setName(e.target.value)}
            placeholder="Save current filters as…"
            aria-label="Saved view name"
            className="min-w-0 flex-1 rounded-full border border-border bg-white px-3 py-1.5 font-mono text-xs"
          />
          <button
            onClick={() => void save()}
            disabled={saving}
            className="rounded-full bg-secondary px-4 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save view'}
          </button>
        </div>
      )}
      {error && <p className="mt-1 font-mono text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
