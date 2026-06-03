'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, ArrowRight, Mail, Key } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const router = useRouter();
  const auth = useAuth();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth) return;

    setIsAuthenticating(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      toast({
        title: "Access Granted",
        description: "Welcome back to the I-World Admin Hub.",
      });
      router.push('/admin/dashboard');
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Authentication Failed",
        description: "Please check your supervisor credentials and try again.",
      });
      setIsAuthenticating(false);
    }
  };

  return (
    <div className="bg-background font-body text-on-surface selection:bg-secondary/20 overflow-hidden min-h-screen flex items-center justify-center p-margin-mobile">
      {/* Background Decorative Skeletons */}
      <div className="fixed inset-0 z-0 pointer-events-none p-margin-desktop opacity-5">
        <div className="grid grid-cols-12 gap-gutter h-full">
          <div className="col-span-2 flex flex-col gap-8 pt-20">
            <div className="h-12 w-12 rounded-full bg-primary"></div>
            <div className="space-y-4">
              <div className="h-6 w-32 rounded-lg bg-primary"></div>
              <div className="h-6 w-40 rounded-lg bg-primary"></div>
            </div>
          </div>
          <div className="col-span-10 pt-20 flex flex-col justify-end pb-20">
             <div className="text-[240px] font-black text-primary leading-none tracking-tighter opacity-10">I-W</div>
          </div>
        </div>
      </div>

      <main className="relative z-10 w-full max-w-lg">
        <div className="bg-white rounded-[2rem] md:rounded-[3rem] p-8 md:p-12 whisper-shadow border border-border/30 flex flex-col gap-10">
          <header className="space-y-4 text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-3">
              <div className="w-10 h-10 bg-primary flex items-center justify-center rounded-xl">
                <Lock className="w-5 h-5 text-white" />
              </div>
              <span className="font-mono text-[10px] md:text-label-mono uppercase tracking-widest text-on-surface-variant">Security Protocol</span>
            </div>
            <h1 className="font-display text-4xl md:text-display-lg text-primary tracking-tighter leading-tight">
              Admin Hub Access
            </h1>
            <p className="font-body-md text-on-surface-variant">
              Sign in with your supervisor account to access network monitoring and regional analytics.
            </p>
          </header>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="font-mono text-[10px] uppercase text-on-surface-variant ml-1">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
                  <Input 
                    type="email" 
                    placeholder="supervisor@iworld.com" 
                    className="pl-12 h-14 rounded-2xl border-border/50 focus:ring-secondary/20"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="font-mono text-[10px] uppercase text-on-surface-variant ml-1">Password</label>
                <div className="relative">
                  <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
                  <Input 
                    type="password" 
                    placeholder="••••••••" 
                    className="pl-12 h-14 rounded-2xl border-border/50 focus:ring-secondary/20"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>

            <Button
              type="submit"
              disabled={isAuthenticating}
              className="w-full h-16 bg-secondary text-white font-bold text-lg rounded-full hover:scale-[1.02] active:scale-95 transition-all duration-300 flex items-center justify-center gap-3 disabled:opacity-50"
            >
              {isAuthenticating ? (
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Signing In...</span>
                </div>
              ) : (
                <>
                  <span>Unlock Dashboard</span>
                  <ArrowRight className="w-6 h-6" />
                </>
              )}
            </Button>
          </form>

          <footer className="flex flex-col md:flex-row justify-between items-center gap-4 text-on-surface-variant font-mono text-[10px] md:text-[12px] pt-4 border-t border-border/10">
            <button type="button" className="hover:text-primary transition-colors">Emergency Bypass</button>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              <span>Network Secure • 2026</span>
            </div>
          </footer>
        </div>
        <div className="mt-8 text-center text-on-surface-variant font-mono text-[10px] uppercase opacity-40">
          © 2026 I-World Networks
        </div>
      </main>
    </div>
  );
}
