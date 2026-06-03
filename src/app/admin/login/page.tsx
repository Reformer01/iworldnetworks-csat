'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Delete, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function AdminLoginPage() {
  const [pin, setPin] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const router = useRouter();

  const handleAppend = (val: string) => {
    if (pin.length < 6) setPin(prev => prev + val);
  };

  const handleClear = () => {
    setPin(prev => prev.slice(0, -1));
  };

  const handleUnlock = () => {
    if (pin.length === 6) {
      setIsAuthenticating(true);
      setTimeout(() => {
        router.push('/admin/dashboard');
      }, 1500);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') handleAppend(e.key);
      if (e.key === 'Backspace') handleClear();
      if (e.key === 'Enter') handleUnlock();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pin]);

  return (
    <div className="bg-background font-body text-on-surface selection:bg-secondary/20 overflow-hidden min-h-screen">
      {/* Background Skeletons */}
      <div className="fixed inset-0 z-0 pointer-events-none p-margin-desktop opacity-10">
        <div className="grid grid-cols-12 gap-gutter h-full">
          <div className="col-span-2 flex flex-col gap-8 pt-20">
            <div className="h-12 w-12 rounded-full bg-surface-container-highest"></div>
            <div className="space-y-4">
              <div className="h-6 w-32 rounded-lg shimmer-bg"></div>
              <div className="h-6 w-40 rounded-lg shimmer-bg"></div>
              <div className="h-6 w-28 rounded-lg shimmer-bg"></div>
            </div>
          </div>
          <div className="col-span-10 pt-20">
            <div className="flex justify-between items-end mb-12">
              <div className="space-y-4">
                <div className="h-10 w-64 rounded-lg shimmer-bg"></div>
                <div className="h-4 w-96 rounded-lg shimmer-bg"></div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-gutter">
              <div className="col-span-2 h-[400px] rounded-3xl shimmer-bg"></div>
              <div className="col-span-1 h-[400px] rounded-3xl shimmer-bg"></div>
            </div>
          </div>
        </div>
      </div>

      <main className="relative z-10 flex items-center justify-center min-h-screen p-margin-mobile">
        <div className="w-full max-w-lg bg-white rounded-[48px] p-8 md:p-12 whisper-shadow border border-border/30 flex flex-col gap-10">
          <header className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary flex items-center justify-center rounded-xl">
                <Lock className="w-5 h-5 text-white" />
              </div>
              <span className="font-mono text-label-mono uppercase tracking-widest text-on-surface-variant">Security Protocol</span>
            </div>
            <h1 className="font-display text-display-lg text-primary tracking-tighter leading-tight">
              Admin Hub Access
            </h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant max-w-[90%]">
              Enter your supervisor PIN to access network monitoring and regional analytics.
            </p>
          </header>

          <div className="space-y-8">
            <div className="flex gap-4 justify-center items-center py-6">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "w-5 h-5 rounded-full border-2 transition-all duration-200",
                    i < pin.length ? "bg-secondary border-secondary scale-110" : "border-border bg-transparent"
                  )}
                />
              ))}
            </div>

            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                <button
                  key={num}
                  onClick={() => handleAppend(num.toString())}
                  className="h-16 rounded-2xl border border-border/20 font-display text-[24px] hover:bg-surface-container-low transition-colors duration-200"
                >
                  {num}
                </button>
              ))}
              <div />
              <button
                onClick={() => handleAppend('0')}
                className="h-16 rounded-2xl border border-border/20 font-display text-[24px] hover:bg-surface-container-low transition-colors duration-200"
              >
                0
              </button>
              <button
                onClick={handleClear}
                className="h-16 rounded-2xl flex items-center justify-center hover:bg-destructive/10 transition-colors group"
              >
                <Delete className="w-6 h-6 text-on-surface-variant group-hover:text-destructive transition-colors" />
              </button>
            </div>
          </div>

          <button
            onClick={handleUnlock}
            disabled={pin.length < 6 || isAuthenticating}
            className="w-full h-16 bg-secondary text-white font-headline text-[20px] rounded-full hover:scale-[1.02] active:scale-95 transition-all duration-300 flex items-center justify-center gap-3 disabled:opacity-50 disabled:grayscale disabled:pointer-events-none"
          >
            {isAuthenticating ? (
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Authenticating...</span>
              </div>
            ) : (
              <>
                <span>Unlock Dashboard</span>
                <ArrowRight className="w-6 h-6" />
              </>
            )}
          </button>

          <footer className="flex justify-between items-center text-on-surface-variant font-mono text-[12px]">
            <button className="hover:text-primary transition-colors">Emergency Bypass</button>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              <span>Network Online</span>
            </div>
          </footer>
        </div>
      </main>

      <div className="fixed bottom-margin-desktop right-margin-desktop opacity-5 pointer-events-none hidden md:block">
        <div className="text-[200px] font-black text-primary select-none leading-none tracking-tighter">I-W</div>
      </div>
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 text-on-surface-variant font-mono text-[10px] uppercase opacity-40">
        © 2026 I-World Networks
      </div>
    </div>
  );
}
