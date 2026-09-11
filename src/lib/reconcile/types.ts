// Shared types for the reconciliation engine (Leaf D).

export interface ReconcileStats {
  recordsScanned: number;
  autoFixed: number;
  flagged: number;
  filled: number;
  unchanged: number;
  elapsedMs: number;
}
