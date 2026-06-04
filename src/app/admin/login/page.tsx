
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, ArrowRight, Mail, Key } from 'lucide-react';
import { useAuth } from '@/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const router = useRouter();
  const auth = useAuth();
  const { toast } = useToast();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth) return;

    // Skill-based security: check domain client-side before attempt
    if (!email.endsWith('@iworld.com')) {
      toast({
        variant: "destructive",
        title: "Invalid Domain",
        description: "Administrative access requires an official @iworld.com account.",
      });
      return;
    }

    setIsAuthenticating(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      if (!userCredential.user.emailVerified) {
        toast({
          variant: "destructive",
          title: "Verification Required",
          description: "Please check your inbox and verify your corporate email to proceed.",
        });
        setIsAuthenticating(false);
        return;
      }

      toast({
        title: "Access Granted",
        description: "Regional Management Hub unlocked.",
      });
      router.push('/admin/dashboard');
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Sign In Failed",
        description: "Invalid credentials or unauthorized attempt. All access is logged.",
      });
      setIsAuthenticating(false);
    }
  };

  return (
    <div className="bg-background font-body text-on-surface selection:bg-secondary/20 overflow-hidden min-h-screen flex items-center justify-center p-margin-mobile">
      <div className="fixed inset-0 z-0 pointer-events-none p-margin-desktop opacity-5">
        <div className="grid grid-cols-12 gap-gutter h-full">
          <div className="col-span-12 flex items-center justify-center">
             <div className="text-[240px] font-bold text-primary font-mono leading-none tracking-tighter opacity-10 uppercase">ADMIN</div>
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
              <span className="font-mono text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">Secure Gateway</span>
            </div>
            <h1 className="font-display text-4xl md:text-[48px] text-primary tracking-tighter leading-tight font-bold">
              Management Hub
            </h1>
            <p className="font-body-md text-on-surface-variant font-bold uppercase opacity-70">
              Internal Corporate Access Only. Sign in with your @iworld.com credentials.
            </p>
          </header>

          <form onSubmit={handleAuth} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="font-mono text-[10px] uppercase text-on-surface-variant ml-1 font-bold">Corporate Email</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
                  <Input 
                    type="email" 
                    placeholder="username@iworld.com" 
                    className="pl-12 h-14 rounded-2xl border-border/50 focus:ring-secondary/20 font-bold"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="font-mono text-[10px] uppercase text-on-surface-variant ml-1 font-bold">Secure Password</label>
                <div className="relative">
                  <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
                  <Input 
                    type="password" 
                    placeholder="••••••••" 
                    className="pl-12 h-14 rounded-2xl border-border/50 focus:ring-secondary/20 font-bold"
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
              className="w-full h-16 bg-primary text-white font-bold text-lg rounded-full hover:scale-[1.02] active:scale-95 transition-all duration-300 flex items-center justify-center gap-3 disabled:opacity-50"
            >
              {isAuthenticating ? (
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span className="font-mono text-sm uppercase">Verifying...</span>
                </div>
              ) : (
                <>
                  <span className="font-mono text-sm uppercase">Authorize Access</span>
                  <ArrowRight className="w-6 h-6" />
                </>
              )}
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}
