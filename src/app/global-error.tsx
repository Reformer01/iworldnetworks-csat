'use client';

import { useEffect } from 'react';
import { ShieldAlert } from 'lucide-react';

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => { console.error('Global error boundary:', error); }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-6">
          <div className="w-16 h-16 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
            <ShieldAlert className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="font-display text-2xl font-bold text-primary">Something went wrong</h1>
          <p className="text-on-surface-variant text-sm">An unexpected error occurred. Please try again.</p>
          <button
            onClick={reset}
            className="px-6 py-3 rounded-full bg-primary text-white font-mono text-xs uppercase tracking-wider font-bold hover:opacity-90 transition-opacity"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
