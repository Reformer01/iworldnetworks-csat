'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft, Menu, LogOut, ShieldAlert, Send, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth, useUser } from '@/firebase';
import { signOut, sendEmailVerification } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';
import { isAllowedDomain } from '@/lib/admin-config';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { KeyboardShortcuts } from '@/components/admin/KeyboardShortcuts';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface NavItem {
  name: string;
  href: string;
  // Accepts Lucide icon components (single icon family project-wide).
  icon: React.ComponentType<{ className?: string }>;
}

interface DashboardLayoutProps {
  children: React.ReactNode;
  /** Navigation items shown in sidebar and mobile menu. */
  navItems: NavItem[];
  /** If set, shows a "← label" link in the header that points to href. */
  backLink?: { href: string; label: string };
  /** Text shown in the footer beside the logo. */
  footerLabel?: string;
  /** Section groupings for the sidebar. Each group has a label and a list of
   *  nav item hrefs that belong to it. Items not in any group appear at the
   *  top without a heading. */
  navGroups?: { label: string; hrefs: string[] }[];
  /** If true, show a "Public Portal" link instead of "Back to Admin". */
  showPublicPortal?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function DashboardLayout({
  children,
  navItems,
  backLink,
  footerLabel = 'Dashboard',
  navGroups,
  showPublicPortal = false,
}: DashboardLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuth();
  const { user, loading } = useUser(auth);
  const { toast } = useToast();

  const avatar = PlaceHolderImages.find((img) => img.id === 'admin-avatar');

  /* ---- Handlers -------------------------------------------------- */

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/session/clear', { method: 'POST' });
    } catch {
      /* skip */
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
        title: 'Verification Sent',
        description: `Check your inbox at ${user.email}.`,
      });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Could not send verification email. Try again later.',
      });
    }
  };

  /* ---- Auth gates ------------------------------------------------ */

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

  if (!user) return null;

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

  /* ---- Nav helpers ----------------------------------------------- */

  const isActive = (href: string) => pathname === href;

  const sidebarItemClass = (active: boolean) =>
    cn(
      'flex items-center gap-3 py-3 px-4 xl:px-6 transition-all group min-w-0',
      active
        ? 'text-primary font-bold active-pill bg-surface-container-low'
        : 'text-on-surface-variant hover:bg-surface-container-low font-bold',
    );

  const sidebarIconClass = (active: boolean) =>
    cn('w-5 h-5 shrink-0 transition-colors', active ? 'text-secondary' : 'group-hover:text-secondary');

  const mobileItemClass = (active: boolean) =>
    cn(
      'flex items-center gap-4 py-3 px-6 transition-all group rounded-xl',
      active ? 'text-primary font-bold active-pill bg-surface-container-low' : 'text-on-surface-variant hover:bg-surface-container-low',
    );

  /* ---- Grouped sidebar nav --------------------------------------- */

  const renderSidebarNav = () => {
    if (!navGroups || navGroups.length === 0) {
      return navItems.map((item) => (
        <Link key={item.href} href={item.href} className={sidebarItemClass(isActive(item.href))} title={item.name}>
          <item.icon className={sidebarIconClass(isActive(item.href))} />
          <span className="font-mono text-[11px] uppercase tracking-wider font-bold truncate min-w-0">{item.name}</span>
        </Link>
      ));
    }

    // Build a set of hrefs already placed in a group
    const grouped = new Set(navGroups.flatMap((g) => g.hrefs));
    const ungrouped = navItems.filter((item) => !grouped.has(item.href));

    return (
      <>
        {/* Ungrouped items first */}
        {ungrouped.map((item) => (
          <Link key={item.href} href={item.href} className={sidebarItemClass(isActive(item.href))}>
            <item.icon className={sidebarIconClass(isActive(item.href))} />
            <span className="font-accent text-[13px] uppercase tracking-wider font-medium">{item.name}</span>
          </Link>
        ))}

        {/* Grouped items */}
        {navGroups.map((group) => {
          const items = group.hrefs.map((href) => navItems.find((item) => item.href === href)).filter(Boolean) as NavItem[];
          if (items.length === 0) return null;
          return (
            <div key={group.label} className="mt-4 min-w-0">
              <p className="font-mono text-[9px] uppercase tracking-widest text-on-surface-variant/50 font-bold px-4 xl:px-6 mb-2 truncate">
                {group.label}
              </p>
              {items.map((item) => (
                <Link key={item.href} href={item.href} className={sidebarItemClass(isActive(item.href))} title={item.name}>
                  <item.icon className={sidebarIconClass(isActive(item.href))} />
                  <span className="font-mono text-[11px] uppercase tracking-wider font-bold truncate min-w-0">{item.name}</span>
                </Link>
              ))}
            </div>
          );
        })}
      </>
    );
  };

  /* ---- Render ---------------------------------------------------- */

  return (
    <div className="bg-background min-h-screen flex flex-col">
      <KeyboardShortcuts />
      {/* ===== HEADER ===== */}
      <header className="fixed top-0 w-full z-50 h-14 flex items-center px-4 md:px-6 pt-[env(safe-area-inset-top)]">
        <div className="flex items-center gap-3 w-full max-w-screen-2xl mx-auto">
          {/* Back link or Public Portal */}
          {backLink ? (
            <Link
              href={backLink.href}
              className="flex items-center gap-2 text-on-surface-variant hover:text-secondary transition-colors font-mono text-[10px] uppercase font-bold shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{backLink.label}</span>
            </Link>
          ) : showPublicPortal ? (
            <Link
              href="/"
              className="flex items-center gap-2 text-on-surface-variant hover:text-secondary transition-colors font-mono text-[10px] uppercase font-bold shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Public Portal</span>
            </Link>
          ) : null}

          <div className="h-5 w-px bg-border mx-1 hidden first:md:hidden sm:block" />

          {/* Logo */}
          <Link href="/" className="flex items-center shrink-0">
            <Image src="/logo.png" alt="I-World Logo" width={90} height={27} className="h-6 w-auto object-contain" priority />
          </Link>

          {/* Section label */}
          {backLink && (
            <span className="font-mono text-[10px] text-secondary font-bold uppercase tracking-widest ml-1 hidden sm:inline">
              / {backLink.label}
            </span>
          )}

          {/* Desktop actions */}
          <div className="ml-auto flex items-center gap-3">
            <NotificationBell />
            {/* User email display */}
            <span className="hidden lg:block text-on-surface-variant/70 font-mono text-[10px] uppercase font-medium truncate max-w-[180px]">
              {user?.email}
            </span>
            <button
              onClick={handleLogout}
              className="hidden lg:flex items-center gap-1.5 text-on-surface-variant hover:text-destructive transition-colors font-mono text-[10px] uppercase font-bold"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>

            {/* Mobile hamburger */}
            <div className="lg:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-11 w-11">
                    <Menu className="w-5 h-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[280px] p-0 border-r border-border">
                  <div className="h-full flex flex-col pt-10">
                    <SheetHeader className="px-6 mb-8 text-left">
                      <SheetTitle className="text-left">
                        <Image src="/logo.png" alt="I-World Logo" width={100} height={30} className="h-6 w-auto object-contain" />
                      </SheetTitle>
                    </SheetHeader>
                    {/* User email in mobile menu */}
                    <div className="px-6 mb-4 border-b border-border">
                      <p className="font-mono text-[10px] text-on-surface-variant/70 uppercase font-medium truncate">{user?.email}</p>
                    </div>
                    <nav className="flex-1 space-y-1">
                      {backLink && (
                        <Link
                          href={backLink.href}
                          className="flex items-center gap-3 py-3 px-6 text-on-surface-variant hover:bg-surface-container-low rounded-xl font-mono text-[10px] uppercase font-bold tracking-wider transition-all"
                        >
                          <ArrowLeft className="w-3.5 h-3.5" />
                          {backLink.label}
                        </Link>
                      )}
                      {showPublicPortal && !backLink && (
                        <Link
                          href="/"
                          className="flex items-center gap-3 py-3 px-6 text-on-surface-variant hover:bg-surface-container-low rounded-xl font-mono text-[10px] uppercase font-bold tracking-wider transition-all"
                        >
                          <ArrowLeft className="w-3.5 h-3.5" />
                          Public Portal
                        </Link>
                      )}
                      {(backLink || showPublicPortal) && <div className="h-px bg-border my-2" />}
                      {navItems.map((item) => (
                        <Link key={item.href} href={item.href} className={mobileItemClass(isActive(item.href))}>
                          <item.icon
                            className={cn('w-4 h-4', isActive(item.href) ? 'text-white' : 'group-hover:text-secondary transition-colors')}
                          />
                          <span className="font-mono text-[10px] uppercase tracking-wider font-bold">{item.name}</span>
                        </Link>
                      ))}
                    </nav>
                    <div className="px-6 pb-6 pt-4 border-t border-border">
                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 text-destructive hover:text-destructive/80 transition-colors font-mono text-[10px] uppercase font-bold"
                      >
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

      {/* ===== SIDEBAR (desktop only) ===== */}
      <aside className="fixed left-0 top-0 h-full w-60 xl:w-64 bg-background border-r border-border pt-16 pb-8 flex-col z-40 hidden lg:flex">
        <div className="px-4 xl:px-6 mb-8 min-w-0">
          <h2 className="font-display text-sm font-bold text-primary uppercase tracking-tight truncate">I-World Networks</h2>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden">{renderSidebarNav()}</nav>
      </aside>

      {/* ===== MAIN CONTENT ===== */}
      <main className="lg:ml-60 xl:ml-64 pt-16 px-4 md:px-6 flex-1 min-w-0">
        <div className="max-w-screen-2xl mx-auto py-6 md:py-8 min-w-0">{children}</div>
      </main>

      {/* ===== FOOTER ===== */}
      <footer className="lg:ml-60 xl:ml-64 bg-background border-t border-border py-6">
        <div className="max-w-screen-2xl mx-auto px-4 md:px-6 flex justify-between items-center">
          <Image src="/logo.png" alt="I-World Networks" width={110} height={33} className="h-6 w-auto object-contain" />
          <span className="font-mono text-[9px] text-on-surface-variant uppercase font-bold">{footerLabel}</span>
        </div>
      </footer>
    </div>
  );
}

/**
 * Notification bell — polls /api/admin/notifications for the signed-in
 * staff member's action items (due follow-ups, high-risk customers, etc.).
 */
function NotificationBell() {
  const auth = useAuth();
  const { user, loading } = useUser(auth);
  const [items, setItems] = useState<Array<{ type: string; title: string; body: string; href: string; severity: string }>>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (loading || !user || !user.emailVerified) return;
    let cancelled = false;
    const load = async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/admin/notifications', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setItems(json.data?.items ?? []);
      } catch {
        /* skip */
      }
    };
    load();
    const id = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [loading, user]);

  const color = (severity: string) => (severity === 'critical' ? 'bg-red-500' : severity === 'warning' ? 'bg-amber-400' : 'bg-secondary');

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative hidden md:flex items-center justify-center h-8 w-8 rounded-full text-on-surface-variant hover:bg-surface-container-low transition-colors"
        aria-label={`Notifications${items.length ? ` (${items.length})` : ''}`}
      >
        <Bell className="w-4 h-4" />
        {items.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-white text-[9px] font-mono font-bold flex items-center justify-center">
            {items.length}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 top-10 z-50 w-80 bg-white border border-border whisper-shadow rounded-2xl p-3 space-y-2 max-h-[70vh] overflow-y-auto">
            <p className="font-mono text-[9px] uppercase tracking-widest text-on-surface-variant font-bold px-2 pt-1">Notifications</p>
            {items.length === 0 && <p className="font-mono text-[11px] opacity-40 px-2 py-4 text-center">You&apos;re all caught up.</p>}
            {items.map((n) => (
              <a
                key={n.type + n.title}
                href={n.href}
                onClick={() => setOpen(false)}
                className="block p-3 rounded-xl border border-border/60 hover:bg-surface-container-low transition-colors"
              >
                <div className="flex items-start gap-2.5">
                  <span className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', color(n.severity))} />
                  <div>
                    <p className="text-xs font-bold text-primary">{n.title}</p>
                    <p className="text-[11px] text-on-surface-variant mt-0.5">{n.body}</p>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
