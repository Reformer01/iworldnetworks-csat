export interface FunnelStage {
  label: string;
  value: string;
  pct: number;
}

export function CollectionFunnel({ stages }: { stages: FunnelStage[] }) {
  if (!stages || stages.length === 0) {
    return (
      <div className="flex h-[160px] items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
        <p className="font-mono text-[11px] uppercase tracking-widest text-slate-500">No funnel data for this period</p>
      </div>
    );
  }
  const max = Math.max(1, ...stages.map((s) => s.pct));
  return (
    <ol className="space-y-3">
      {stages.map((stage) => (
        <li key={stage.label}>
          <div className="mb-1 flex items-center justify-between gap-2 font-mono text-[11px]">
            <span className="font-bold uppercase tracking-widest text-slate-400">{stage.label}</span>
            <span className="font-bold text-white">{stage.value}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.max(3, (stage.pct / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}
