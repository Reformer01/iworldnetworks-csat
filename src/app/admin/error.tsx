
'use client';

import { useEffect } from 'react';
import { ShieldAlert } from 'lucide-react';

export default function AdminError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => { console.error('Admin error boundary:', error); }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md text-center space-y-6">
        <div className="w-16 h-16 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
          <ShieldAlert className="w-8 h-8 text-destructive" />
        </div>
        <h1 className="font-display text-2xl font-bold text-primary">Admin Hub Error</h1>
        <p className="text-on-surface-variant text-sm">An unexpected error occurred in the admin hub. Please try again.</p>
        <button
          onClick={reset}
          className="px-6 py-3 rounded-full bg-primary text-white font-mono text-xs uppercase tracking-wider font-bold"
        >
          Reload
        </button>
      </div>
    </div>
  );
}
