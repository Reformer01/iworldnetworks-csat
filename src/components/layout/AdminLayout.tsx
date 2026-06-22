
'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, 
  Headset, 
  Receipt,
  Wrench, 
  CreditCard, 
  Star, 
  ArrowLeft,
  Menu,
  LogOut,
  Activity,
  ShieldAlert,
  Send,
  Hammer,
  Database,
  UsersRound,
  TrendingUp
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { useAuth, useUser } from '@/firebase';
import { signOut, sendEmailVerification } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';
import { isAllowedDomain } from '@/lib/admin-config';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

interface AdminLayoutProps {
  children: React.ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuth();
  const { user, loading } = useUser(auth);
  const { toast } = useToast();

  const avatar = PlaceHolderImages.find(img => img.id === 'admin-avatar')!;

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/session/clear', { method: 'POST' });
    } catch (err) {
      console.error('Failed to clear session cookie:', err);
    }
    if (auth) {
      await signOut(auth);
      router.push('/admin/login');
    }
  };

  const handleSendVerification = async () => {
    if (!user) return;
    try {
      await sendEmailVerification(user);
      toast({
        title: "Verification Sent",
        description: `Check your inbox at ${user.email}.`,
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Could not send verification email. Try again later.",
      });
    }
  };

  const mainNavItems = [
    { name: 'Overview', href: '/admin/dashboard', icon: LayoutDashboard },
    { name: 'Sales KPIs', href: '/admin/sales', icon: TrendingUp },
    { name: 'Stability', href: '/admin/stability', icon: Activity },
    { name: 'Support', href: '/admin/support', icon: Headset },
    { name: 'Support Revenue', href: '/admin/support-revenue', icon: Receipt },
    { name: 'Field Support', href: '/admin/field-support', icon: Hammer },
    { name: 'Installation', href: '/admin/installation', icon: Wrench },
    { name: 'Billing', href: '/admin/billing', icon: CreditCard },
    { name: 'Staff Performance', href: '/admin/staff', icon: UsersRound },
    { name: 'Testimonials', href: '/admin/testimonials', icon: Star },
    { name: 'Manage Data', href: '/admin/crud', icon: Database },
  ];

  useEffect(() => {
    if (!loading && !user) {
      router.push('/admin/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-secondary/20 border-t-secondary rounded-full animate-spin" />
          <p className="font-mono text-[10px] text-on-surface-variant uppercase animate-pulse font-bold">Initializing Session</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  // Verification Gate Screen (Helpful, not a redirect)
  if (!user.emailVerified || !isAllowedDomain(user.email || '')) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-3xl p-10 whisper-shadow border border-border text-center flex flex-col items-center gap-8">
          <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center">
            <ShieldAlert className="w-8 h-8 text-destructive" />
          </div>
          <div className="space-y-2">
            <h2 className="font-display text-2xl font-bold text-primary">Action Required</h2>
            <p className="text-on-surface-variant text-sm">
              Your account <strong>{user.email}</strong> is not yet verified or authorized for this regional node.
            </p>
          </div>
          <div className="w-full space-y-3">
            <Button onClick={handleSendVerification} className="w-full bg-secondary text-white rounded-full py-6 font-bold flex gap-2">
              <Send className="w-4 h-4" /> Resend Verification Link
            </Button>
            <Button onClick={handleLogout} variant="ghost" className="w-full rounded-full py-6 font-bold text-on-surface-variant">
              Sign Out & Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background min-h-screen flex flex-col">
      <header className="fixed top-0 w-full z-50 px-margin-mobile md:px-margin-desktop h-16 md:h-20 flex justify-between items-center max-w-container-max mx-auto left-0 right-0">
        <div className="flex items-center gap-3 md:gap-6">
          <Link href="/" className="font-mono text-sm font-bold text-primary uppercase tracking-tight">
            I-World Networks
          </Link>
          <div className="h-6 w-px bg-border hidden sm:block"></div>
          <Link href="/" className="hidden sm:flex items-center gap-2 text-on-surface-variant font-mono text-[10px] hover:text-secondary transition-all group font-bold uppercase">
            <ArrowLeft className="w-3 h-3 group-hover:-translate-x-1 transition-transform" />
            Public Portal
          </Link>
        </div>

        <div className="flex items-center gap-2 md:gap-6">
          <div className="hidden md:flex gap-8 items-center mr-6">
             <Link href="/admin/dashboard" className={cn(
              "font-mono text-[12px] uppercase tracking-wider transition-all",
              pathname.startsWith('/admin') ? "text-secondary font-bold" : "text-on-surface-variant hover:text-secondary font-bold"
            )}>
              Admin Hub
            </Link>
          </div>
          <div className="hidden md:flex items-center gap-4 pr-4 border-r border-border mr-2">
            <button onClick={handleLogout} className="group flex items-center gap-2 text-on-surface-variant hover:text-destructive transition-colors font-bold font-mono text-[10px] uppercase">
              <LogOut className="w-4 h-4 group-hover:rotate-12 transition-transform" />
              Logout
            </button>
          </div>
          <div className="w-8 h-8 md:w-10 md:h-10 rounded-full overflow-hidden border border-border">
            <Image 
              src={avatar.imageUrl} 
              alt="Admin" 
              width={40} 
              height={40} 
              sizes="40px" 
              className="object-cover" 
            />
          </div>
          
          <div className="md:hidden ml-1">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="hover:bg-transparent h-9 w-9">
                  <Menu className="w-6 h-6 text-primary" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[280px] p-0 border-r border-border">
                <div className="h-full flex flex-col pt-10">
                  <SheetHeader className="px-6 mb-8 text-left">
                    <SheetTitle className="font-mono text-sm font-bold text-primary uppercase">I-World Networks</SheetTitle>
                    <p className="font-mono text-[10px] text-on-surface-variant opacity-60 uppercase tracking-widest font-bold">Management Hub</p>
                  </SheetHeader>
                  <nav className="flex-1 space-y-1">
                    {mainNavItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "flex items-center gap-4 py-3 px-6 transition-all group",
                          pathname === item.href 
                            ? "text-primary font-bold active-pill bg-surface-container-low" 
                            : "text-on-surface-variant hover:bg-surface-container-low"
                        )}
                      >
                        <item.icon className={cn("w-5 h-5 transition-colors", pathname === item.href ? "text-secondary" : "group-hover:text-secondary")} />
                        <span className="font-mono text-[10px] uppercase tracking-wider font-bold">{item.name}</span>
                      </Link>
                    ))}
                    <button 
                      onClick={handleLogout}
                      className="w-full flex items-center gap-4 py-3 px-6 text-destructive hover:bg-destructive/5 transition-all font-bold"
                    >
                      <LogOut className="w-5 h-5" />
                      <span className="font-mono text-[10px] uppercase tracking-wider">Sign Out</span>
                    </button>
                  </nav>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <aside className="fixed left-0 top-0 h-full w-64 bg-background border-r border-border pt-24 pb-8 flex flex-col z-40 hidden md:flex">
        <div className="px-8 mb-12">
          <h2 className="font-mono text-sm font-bold text-primary uppercase tracking-tight">I-World Networks</h2>
          <p className="font-mono text-[10px] text-on-surface-variant opacity-60 uppercase tracking-widest font-bold">Management Hub</p>
        </div>
        <nav className="flex-1 space-y-1">
          {mainNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-4 py-3 px-8 transition-all group",
                pathname === item.href 
                  ? "text-primary font-bold active-pill bg-surface-container-low" 
                  : "text-on-surface-variant hover:bg-surface-container-low font-bold"
              )}
            >
              <item.icon className={cn("w-5 h-5 transition-colors", pathname === item.href ? "text-secondary" : "group-hover:text-secondary")} />
              <span className="font-mono text-[12px] uppercase tracking-wider">{item.name}</span>
            </Link>
          ))}
        </nav>
        <div className="px-6 pt-6 border-t border-border">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 rounded-full border border-destructive/20 bg-destructive/5 px-4 py-3 text-destructive transition-colors hover:bg-destructive hover:text-white font-mono text-[10px] font-bold uppercase tracking-wider"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </aside>

      <main className="md:ml-64 pt-20 md:pt-24 px-margin-mobile md:px-margin-desktop flex-1">
        {children}
      </main>

      <footer className="md:ml-64 bg-surface-bright border-t border-border py-8 md:py-12 relative z-50">
        <div className="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop flex flex-col md:flex-row justify-between items-start gap-8">
          <div className="space-y-4 text-center md:text-left">
            <span className="font-mono text-[12px] font-bold text-primary uppercase">I-World Networks</span>
            <p className="font-mono text-[10px] text-on-surface-variant uppercase font-bold">© 2026 I-World Networks. All rights reserved.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-8 md:gap-12 w-full md:w-auto">
            <div className="space-y-4">
              <h5 className="font-mono text-[10px] font-bold uppercase text-primary tracking-widest">Regional Hubs</h5>
              <nav className="flex flex-col gap-1.5 md:gap-2">
                {['Abeokuta', 'Ibadan', 'Osogbo', 'Akure'].map(city => (
                  <a key={city} className="font-mono text-[10px] text-on-surface-variant hover:text-secondary uppercase font-bold" href="#">{city}</a>
                ))}
              </nav>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
