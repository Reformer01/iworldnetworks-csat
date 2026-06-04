
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, ArrowRight, Mail, Key, UserPlus } from 'lucide-react';
import { useAuth } from '@/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const router = useRouter();
  const auth = useAuth();
  const { toast } = useToast();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth) return;

    setIsAuthenticating(true);
    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
        toast({
          title: "Account Created",
          description: "Welcome to the I-World Supervisor team.",
        });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        toast({
          title: "Access Granted",
          description: "Welcome back to the Management Hub.",
        });
      }
      router.push('/admin/dashboard');
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: isSignUp ? "Sign Up Failed" : "Sign In Failed",
        description: error.message || "Please check your credentials.",
      });
      setIsAuthenticating(false);
    }
  };

  return (
    <div className="bg-background font-body text-on-surface selection:bg-secondary/20 overflow-hidden min-h-screen flex items-center justify-center p-margin-mobile">
      <div className="fixed inset-0 z-0 pointer-events-none p-margin-desktop opacity-5">
        <div className="grid grid-cols-12 gap-gutter h-full">
          <div className="col-span-2 flex flex-col gap-8 pt-20">
            <div className="h-12 w-12 rounded-full bg-primary"></div>
          </div>
          <div className="col-span-10 pt-20 flex flex-col justify-end pb-20">
             <div className="text-[240px] font-bold text-primary font-mono leading-none tracking-tighter opacity-10 uppercase">I-W</div>
          </div>
        </div>
      </div>

      <main className="relative z-10 w-full max-w-lg">
        <div className="bg-white rounded-[2rem] md:rounded-[3rem] p-8 md:p-12 whisper-shadow border border-border/30 flex flex-col gap-10">
          <header className="space-y-4 text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-3">
              <div className="w-10 h-10 bg-primary flex items-center justify-center rounded-xl">
                {isSignUp ? <UserPlus className="w-5 h-5 text-white" /> : <Lock className="w-5 h-5 text-white" />}
              </div>
              <span className="font-mono text-[10px] uppercase tracking-widest text-on-surface-variant">Management Hub</span>
            </div>
            <h1 className="font-display text-4xl md:text-[48px] text-primary tracking-tighter leading-tight font-bold">
              {isSignUp ? 'Create Account' : 'Sign In'}
            </h1>
            <p className="font-body-md text-on-surface-variant">
              {isSignUp 
                ? 'Register a new supervisor account to access the internal reporting system.' 
                : 'Enter your account details to access network reports and regional information.'}
            </p>
          </header>

          <form onSubmit={handleAuth} className="space-y-6">
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
                  <span>{isSignUp ? 'Creating Account...' : 'Signing In...'}</span>
                </div>
              ) : (
                <>
                  <span>{isSignUp ? 'Create Supervisor' : 'Unlock Dashboard'}</span>
                  <ArrowRight className="w-6 h-6" />
                </>
              )}
            </Button>
          </form>

          <footer className="flex flex-col md:flex-row justify-between items-center gap-4 text-on-surface-variant font-mono text-[10px] pt-4 border-t border-border/10">
            <button 
              type="button" 
              onClick={() => setIsSignUp(!isSignUp)}
              className="hover:text-primary transition-colors font-bold uppercase tracking-widest"
            >
              {isSignUp ? 'Already have an account? Sign In' : 'Need a supervisor account? Sign Up'}
            </button>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <span>System Online • 2026</span>
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
