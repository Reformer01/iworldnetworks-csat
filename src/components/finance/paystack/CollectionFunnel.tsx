export interface FunnelStage {
  label: string;
  value: string;
  pct: number;
}

export function CollectionFunnel({ stages }: { stages: FunnelStage[] }) {
  if (!stages || stages.length === 0) {
    return (
      <div className="flex h-[160px] items-center justify-center rounded-2xl border border-border bg-white">
        <p className="font-mono text-[11px] uppercase tracking-widest opacity-60">No funnel data for this period</p>
      </div>
    );
  }
  const max = Math.max(1, ...stages.map((s) => s.pct));
  return (
    <ol className="space-y-3">
      {stages.map((stage) => (
        <li key={stage.label}>
          <div className="mb-1 flex items-center justify-between gap-2 font-mono text-[11px]">
            <span className="font-bold uppercase tracking-widest opacity-60">{stage.label}</span>
            <span className="font-bold">{stage.value}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-zinc-100">
            <div className="h-full rounded-full bg-secondary" style={{ width: `${Math.max(3, (stage.pct / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}
