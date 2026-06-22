
export default function AdminLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-secondary/20 border-t-secondary rounded-full animate-spin" />
        <p className="font-mono text-[10px] text-on-surface-variant uppercase animate-pulse font-bold">Loading Admin Hub</p>
      </div>
    </div>
  );
}
