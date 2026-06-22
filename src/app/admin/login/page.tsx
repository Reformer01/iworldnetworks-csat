
'use client';

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, ArrowRight, Mail, Key, Send } from 'lucide-react';
import { useAuth } from '@/firebase';
import { signInWithEmailAndPassword, sendEmailVerification, User } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { isAllowedDomain } from '@/lib/admin-config';
import { useToast } from '@/hooks/use-toast';

export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [unverifiedUser, setUnverifiedUser] = useState<User | null>(null);
  const [isSendingVerification, setIsSendingVerification] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/admin/dashboard';
  const auth = useAuth();
  const { toast } = useToast();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth) return;

    if (!isAllowedDomain(email)) {
      toast({
        variant: "destructive",
        title: "Domain Restriction",
        description: "Administrative access is strictly for @iworldnetworks.net accounts.",
      });
      return;
    }

    setIsAuthenticating(true);
    setUnverifiedUser(null);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      if (!userCredential.user.emailVerified) {
        setUnverifiedUser(userCredential.user);
        toast({
          variant: "destructive",
          title: "Account Verification Required",
          description: "Please verify your corporate email to unlock the hub.",
        });
        setIsAuthenticating(false);
        return;
      }

      const token = await userCredential.user.getIdToken();
      const sessionRes = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token }),
      });

      if (!sessionRes.ok) {
        toast({ variant: "destructive", title: "Session Error", description: "Could not establish secure session. Please try again." });
        setIsAuthenticating(false);
        return;
      }

      toast({ title: "Authorized", description: "Regional Hub Unlocked." });
      setIsAuthenticating(false);
      router.push(redirectTo);
    } catch {
      toast({
        variant: "destructive",
        title: "Access Denied",
        description: "Invalid credentials or unauthorized login attempt.",
      });
      setIsAuthenticating(false);
    }
  };

  const handleSendVerification = async () => {
    if (!unverifiedUser) return;
    setIsSendingVerification(true);
    try {
      await sendEmailVerification(unverifiedUser);
      toast({
        title: "Verification Sent",
        description: `A secure link has been sent to ${unverifiedUser.email}.`,
      });
    } catch {
      toast({
        variant: "destructive",
        title: "System Error",
        description: "Could not send verification email. Please contact IT.",
      });
    } finally {
      setIsSendingVerification(false);
    }
  };

  return (
    <div className="bg-background min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none select-none flex items-center justify-center">
        <div className="text-[20vw] font-black font-mono">ADMIN</div>
      </div>

      <main className="w-full max-w-lg z-10">
        <div className="bg-white rounded-3xl p-8 md:p-12 whisper-shadow border border-border">
          <header className="mb-10 text-center md:text-left">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-primary rounded-lg text-white">
                <Lock className="w-5 h-5" />
              </div>
              <span className="font-mono text-[10px] uppercase font-bold tracking-widest text-on-surface-variant">Secure Gateway</span>
            </div>
            <h1 className="text-3xl font-display font-bold text-primary tracking-tight">Management Hub</h1>
          </header>

          <form onSubmit={handleAuth} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="font-mono text-[10px] uppercase font-bold ml-1 text-on-surface-variant">Corporate ID</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 opacity-40" />
                  <Input 
                    type="email" 
                    placeholder="name@iworldnetworks.net" 
                    className="pl-12 h-14 rounded-2xl"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="font-mono text-[10px] uppercase font-bold ml-1 text-on-surface-variant">Secure Token</label>
                <div className="relative">
                  <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 opacity-40" />
                  <Input 
                    type="password" 
                    placeholder="••••••••" 
                    className="pl-12 h-14 rounded-2xl"
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
              className="w-full h-16 bg-primary text-white rounded-full font-bold text-lg hover:scale-[1.01] transition-all flex gap-3"
            >
              {isAuthenticating ? "Verifying..." : "Authorize Access"}
              {!isAuthenticating && <ArrowRight className="w-5 h-5" />}
            </Button>
          </form>

          {unverifiedUser && (
            <div className="mt-8 pt-8 border-t border-border flex flex-col gap-4 text-center">
              <p className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Email not verified?</p>
              <Button
                variant="outline"
                onClick={handleSendVerification}
                disabled={isSendingVerification}
                className="w-full h-12 rounded-xl font-mono text-[10px] uppercase font-bold"
              >
                {isSendingVerification ? "Sending..." : "Request New Verification Link"}
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
