'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  TrendingUp, Database, Upload, Target, ArrowLeft, LayoutDashboard, ShieldAlert, Send, Menu, LogOut
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth, useUser } from '@/firebase';
import { signOut } from 'firebase/auth';
import { isAllowedDomain } from '@/lib/admin-config';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

interface SalesLayoutProps {
  children: React.ReactNode;
}

const salesNavItems = [
  { name: 'Dashboard', href: '/admin/sales', icon: TrendingUp },
  { name: 'Records', href: '/admin/sales/records', icon: Database },
  { name: 'Import Data', href: '/admin/sales/import', icon: Upload },
  { name: 'Targets', href: '/admin/sales/targets', icon: Target },
];

export function SalesLayout({ children }: SalesLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuth();
  const { user, loading } = useUser(auth);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/session/clear', { method: 'POST' });
    } catch { /* skip */ }
    if (auth) {
      await signOut(auth);
      router.push('/admin/login');
    }
  };

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
          <p className="font-mono text-[10px] text-on-surface-variant uppercase animate-pulse font-bold">Starting up...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  if (!user.emailVerified || !isAllowedDomain(user.email || '')) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-3xl p-10 border border-border text-center flex flex-col items-center gap-8">
          <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center">
            <ShieldAlert className="w-8 h-8 text-destructive" />
          </div>
          <div className="space-y-2">
            <h2 className="font-display text-2xl font-bold text-primary">Access Required</h2>
            <p className="text-on-surface-variant text-sm">
              Your account <strong>{user.email}</strong> needs to be verified first.
            </p>
          </div>
          <button onClick={handleLogout} className="rounded-full border border-border font-mono text-[10px] uppercase font-bold px-8 py-3 hover:bg-surface-container-low transition-all">
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  const NavLink = ({ item }: { item: typeof salesNavItems[number] }) => {
    const isActive = pathname === item.href;
    return (
      <Link
        href={item.href}
        className={cn(
          'flex items-center gap-4 py-2.5 px-5 transition-all group rounded-xl',
          isActive
            ? 'text-primary font-bold bg-surface-container-low'
            : 'text-on-surface-variant hover:bg-surface-container-low font-bold'
        )}
      >
        <item.icon className={cn('w-4 h-4', isActive ? 'text-secondary' : 'group-hover:text-secondary transition-colors')} />
        <span className="font-mono text-[11px] uppercase tracking-wider">{item.name}</span>
      </Link>
    );
  };

  return (
    <div className="bg-background min-h-screen flex flex-col">
      <header className="fixed top-0 w-full z-50 h-14 flex items-center px-4 md:px-6">
        <div className="flex items-center gap-3 w-full max-w-screen-2xl mx-auto">
          <Link href="/admin/dashboard" className="flex items-center gap-2 text-on-surface-variant hover:text-secondary transition-colors font-mono text-[10px] uppercase font-bold shrink-0">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Back to Admin</span>
          </Link>
          <div className="h-5 w-px bg-border mx-1" />
          <Link href="/" className="font-mono text-xs font-bold text-primary uppercase tracking-tight shrink-0">
            I-World Networks
          </Link>
          <span className="font-mono text-[10px] text-secondary font-bold uppercase tracking-widest ml-1 hidden sm:inline">/ Sales</span>

          <nav className="hidden md:flex items-center gap-1 ml-6">
            {salesNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'px-4 py-1.5 rounded-full font-mono text-[10px] uppercase font-bold tracking-wider transition-all',
                  pathname === item.href
                    ? 'bg-secondary text-white'
                    : 'text-on-surface-variant hover:bg-surface-container-low'
                )}
              >
                {item.name}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <button onClick={handleLogout} className="hidden md:flex items-center gap-1.5 text-on-surface-variant hover:text-destructive transition-colors font-mono text-[10px] uppercase font-bold">
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
            <div className="md:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Menu className="w-5 h-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[250px] p-0">
                  <div className="h-full flex flex-col pt-10">
                    <SheetHeader className="px-6 mb-6 text-left">
                      <SheetTitle className="font-mono text-xs font-bold text-primary uppercase">Sales</SheetTitle>
                      <p className="font-mono text-[10px] text-on-surface-variant opacity-60 uppercase tracking-widest font-bold">Menu</p>
                    </SheetHeader>
                    <nav className="flex-1 space-y-1 px-3">
                      <Link
                        href="/admin/dashboard"
                        className="flex items-center gap-3 py-2.5 px-4 text-on-surface-variant hover:bg-surface-container-low rounded-xl font-mono text-[10px] uppercase font-bold tracking-wider transition-all"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        Back to Admin
                      </Link>
                      <div className="h-px bg-border my-2" />
                      {salesNavItems.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cn(
                            'flex items-center gap-3 py-2.5 px-4 rounded-xl font-mono text-[10px] uppercase font-bold tracking-wider transition-all',
                            pathname === item.href
                              ? 'bg-secondary text-white'
                              : 'text-on-surface-variant hover:bg-surface-container-low'
                          )}
                        >
                          <item.icon className="w-4 h-4" />
                          {item.name}
                        </Link>
                      ))}
                    </nav>
                    <div className="px-3 pb-6 pt-4 border-t border-border mx-3">
                      <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 rounded-full border border-destructive/20 px-4 py-2.5 text-destructive hover:bg-destructive hover:text-white transition-colors font-mono text-[10px] font-bold uppercase tracking-wider">
                        <LogOut className="w-3.5 h-3.5" />
                        Sign Out
                      </button>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </header>

      <main className="pt-14 px-4 md:px-6 flex-1">
        <div className="max-w-screen-2xl mx-auto py-6 md:py-8">
          {children}
        </div>
      </main>

      <footer className="bg-white/80 border-t border-border py-6">
        <div className="max-w-screen-2xl mx-auto px-4 md:px-6 flex justify-between items-center">
          <span className="font-mono text-[10px] font-bold text-primary uppercase">I-World Networks</span>
          <span className="font-mono text-[9px] text-on-surface-variant uppercase font-bold">Sales Dashboard</span>
        </div>
      </footer>
    </div>
  );
}
