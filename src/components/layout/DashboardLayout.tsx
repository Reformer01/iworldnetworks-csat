'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft, ChevronsUpDown, Globe, LogOut, Search, ShieldAlert, Send, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { useAuth, useUser } from '@/firebase';
import { signOut, sendEmailVerification } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';
import { isAllowedDomain } from '@/lib/admin-config';
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
  /** Navigation items shown in sidebar and command palette. */
  navItems: NavItem[];
  /** If set, shows a "← label" link in the header that points to href. */
  backLink?: { href: string; label: string };
  /** Text shown in the sidebar footer below the user card. */
  footerLabel?: string;
  /** Section groupings for the sidebar. Each group has a label and a list of
   *  nav item hrefs that belong to it. Items not in any group appear at the
   *  top without a heading. */
  navGroups?: { label: string; hrefs: string[] }[];
  /** If true, show a "Public Portal" link in the user menu. */
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

  useEffect(() => {
    if (!loading && user && !isAllowedDomain(user.email || '')) {
      signOut(auth!).then(() => router.push('/admin/login'));
    }
  }, [user, loading, router, auth]);

  /* ---- Impersonation banner ------------------------------------- */

  const [impersonation, setImpersonation] = useState<{
    adminEmail: string;
    targetName: string;
    targetCustomerId: string;
  } | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('csat-impersonation');
      if (raw) setImpersonation(JSON.parse(raw));
    } catch {
      /* skip */
    }
  }, []);

  /* ---- Loading / verification gates ------------------------------ */

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-foreground" />
      </div>
    );
  }

  if (!user) return null;

  if (!user.emailVerified) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-xl border bg-card p-10 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-secondary/10">
            <Send className="h-5 w-5 text-secondary" />
          </div>
          <h2 className="mb-2 font-headline text-xl font-semibold tracking-tight">Verify your email</h2>
          <p className="mb-6 text-sm text-muted-foreground">
            We sent a verification link to <span className="font-semibold text-foreground">{user.email}</span>. Please
            verify before continuing.
          </p>
          <div className="space-y-3">
            <Button onClick={handleSendVerification} className="w-full">
              Resend Verification Email
            </Button>
            <Button variant="outline" onClick={handleLogout} className="w-full">
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* ---- Nav model ------------------------------------------------- */

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');
  const current = navItems.find((i) => isActive(i.href));

  const groupedHrefs = new Set((navGroups ?? []).flatMap((g) => g.hrefs));
  const ungrouped = navItems.filter((i) => !groupedHrefs.has(i.href));

  const userName = user.displayName || user.email?.split('@')[0] || 'User';
  const userInitials = userName
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const logo = PlaceHolderImages.find((i) => i.id === 'logo-black')?.imageUrl || '/logo.png';

  /* ---- Render ---------------------------------------------------- */

  return (
    <SidebarProvider>
      <div className="flex h-svh w-full overflow-hidden bg-background">
        <Sidebar collapsible="icon">
          {/* Brand */}
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton size="lg" asChild>
                  <Link href={navItems[0]?.href ?? '/'}>
                    <span className="flex aspect-square size-8 items-center justify-center overflow-hidden rounded-lg bg-primary">
                      <Image src={logo} alt="I-World" width={32} height={32} className="size-5 object-contain invert" />
                    </span>
                    <span className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-headline font-semibold tracking-tight">I-World Networks</span>
                      <span className="truncate text-xs text-muted-foreground">Operations Console</span>
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>

          {/* Nav */}
          <SidebarContent>
            {ungrouped.length > 0 && (
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {ungrouped.map((item) => (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton asChild isActive={isActive(item.href)} tooltip={item.name}>
                          <Link href={item.href}>
                            <item.icon />
                            <span>{item.name}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}
            {(navGroups ?? []).map((group) => {
              const items = navItems.filter((i) => group.hrefs.includes(i.href));
              if (items.length === 0) return null;
              return (
                <SidebarGroup key={group.label}>
                  <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {items.map((item) => (
                        <SidebarMenuItem key={item.href}>
                          <SidebarMenuButton asChild isActive={isActive(item.href)} tooltip={item.name}>
                            <Link href={item.href}>
                              <item.icon />
                              <span>{item.name}</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              );
            })}
          </SidebarContent>


          {/* User + footer label */}
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton
                      size="lg"
                      className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                    >
                      <Avatar className="h-8 w-8 rounded-lg">
                        {avatar && <AvatarImage src={avatar.imageUrl} alt={userName} />}
                        <AvatarFallback className="rounded-lg bg-primary text-[11px] font-semibold text-primary-foreground">
                          {userInitials}
                        </AvatarFallback>
                      </Avatar>
                      <span className="grid flex-1 text-left text-sm leading-tight">
                        <span className="truncate font-semibold">{userName}</span>
                        <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                      </span>
                      <ChevronsUpDown className="ml-auto size-4" />
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                    side="top"
                    align="end"
                    sideOffset={4}
                  >
                    <DropdownMenuLabel className="p-0 font-normal">
                      <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                        <Avatar className="h-8 w-8 rounded-lg">
                          {avatar && <AvatarImage src={avatar.imageUrl} alt={userName} />}
                          <AvatarFallback className="rounded-lg bg-primary text-[11px] font-semibold text-primary-foreground">
                            {userInitials}
                          </AvatarFallback>
                        </Avatar>
                        <div className="grid flex-1 text-left text-sm leading-tight">
                          <span className="truncate font-semibold">{userName}</span>
                          <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                        </div>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {showPublicPortal && (
                      <DropdownMenuItem asChild>
                        <Link href="/">
                          <Globe />
                          Public Portal
                        </Link>
                      </DropdownMenuItem>
                    )}
                    {backLink && (
                      <DropdownMenuItem asChild>
                        <Link href={backLink.href}>
                          <ArrowLeft />
                          {backLink.label}
                        </Link>
                      </DropdownMenuItem>
                    )}
                    {(showPublicPortal || backLink) && <DropdownMenuSeparator />}
                    <DropdownMenuItem onClick={handleLogout}>
                      <LogOut />
                      Log out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            </SidebarMenu>
            <p className="px-2 pb-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground group-data-[collapsible=icon]:hidden">
              {footerLabel}
            </p>
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>



        <SidebarInset className="min-w-0">
          {/* Header */}
          <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            {backLink && (
              <Link
                href={backLink.href}
                className="hidden items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:flex"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> {backLink.label}
              </Link>
            )}
            <span className="truncate font-headline text-sm font-semibold tracking-tight">
              {current?.name ?? 'Dashboard'}
            </span>

            <div className="ml-auto flex items-center gap-1">
              <SearchCommand navItems={navItems} navGroups={navGroups} />
              <NotificationBell />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full">
                    <Avatar className="h-8 w-8 rounded-full">
                      {avatar && <AvatarImage src={avatar.imageUrl} alt={userName} />}
                      <AvatarFallback className="rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                        {userInitials}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 rounded-lg">
                  <DropdownMenuLabel className="font-normal">
                    <p className="text-sm font-semibold">{userName}</p>
                    <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          {/* Impersonation banner */}
          {impersonation && (
            <div className="flex items-center justify-between gap-2 bg-amber-50 px-4 py-1.5 text-[11px] text-amber-900">
              <span className="flex items-center gap-1.5">
                <ShieldAlert className="h-3.5 w-3.5" /> Viewing as <b>{impersonation.targetName}</b> (#
                {impersonation.targetCustomerId})
              </span>
              <button
                onClick={() => {
                  sessionStorage.removeItem('csat-impersonation');
                  setImpersonation(null);
                }}
                className="font-semibold hover:underline"
              >
                Exit
              </button>
            </div>
          )}

          {/* Content */}
          <main className="flex-1 overflow-y-auto">{children}</main>
        </SidebarInset>
      </div>
      <KeyboardShortcuts />
    </SidebarProvider>
  );
}

/* ------------------------------------------------------------------ */
/*  Command palette (⌘K / Ctrl+K)                                     */
/* ------------------------------------------------------------------ */

function SearchCommand({
  navItems,
  navGroups,
}: {
  navItems: NavItem[];
  navGroups?: { label: string; hrefs: string[] }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const run = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const groups = useMemo(() => {
    const groupedHrefs = new Set((navGroups ?? []).flatMap((g) => g.hrefs));
    const ungrouped = navItems.filter((i) => !groupedHrefs.has(i.href));
    const list: { label: string; items: NavItem[] }[] = [];
    if (ungrouped.length > 0) list.push({ label: 'Pages', items: ungrouped });
    for (const g of navGroups ?? []) {
      const items = navItems.filter((i) => g.hrefs.includes(i.href));
      if (items.length > 0) list.push({ label: g.label, items });
    }
    return list;
  }, [navItems, navGroups]);

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="relative h-8 w-8 justify-start p-0 text-sm text-muted-foreground sm:w-56 sm:px-3"
      >
        <Search className="h-4 w-4 sm:mr-2" />
        <span className="hidden sm:inline-flex">Search…</span>
        <kbd className="pointer-events-none absolute right-1.5 top-1/2 hidden -translate-y-1/2 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium sm:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search pages…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {groups.map((group) => (
            <CommandGroup key={group.label} heading={group.label}>
              {group.items.map((item) => (
                <CommandItem key={item.href} value={item.name} onSelect={() => run(item.href)}>
                  <item.icon />
                  <span>{item.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}


/* ------------------------------------------------------------------ */
/*  Notification bell                                                  */
/* ------------------------------------------------------------------ */

/**
 * Polls /api/admin/notifications for the signed-in staff member's action
 * items (due follow-ups, high-risk customers, etc.).
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

  const color = (severity: string) =>
    severity === 'critical' ? 'bg-red-500' : severity === 'warning' ? 'bg-amber-400' : 'bg-secondary';

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen((o) => !o)}
        className="relative"
        aria-label={`Notifications${items.length ? ` (${items.length})` : ''}`}
      >
        <Bell className="h-4 w-4" />
        {items.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 font-mono text-[9px] font-bold text-white">
            {items.length}
          </span>
        )}
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 top-10 z-50 max-h-[70vh] w-80 space-y-2 overflow-y-auto rounded-xl border bg-card p-3 shadow-lg">
            <p className="px-2 pt-1 font-mono text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
              Notifications
            </p>
            {items.length === 0 && (
              <p className="px-2 py-4 text-center font-mono text-[11px] opacity-40">You&apos;re all caught up.</p>
            )}
            {items.map((n) => (
              <a
                key={n.type + n.title}
                href={n.href}
                onClick={() => setOpen(false)}
                className="block rounded-lg border border-border/60 p-3 transition-colors hover:bg-accent"
              >
                <div className="flex items-start gap-2.5">
                  <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', color(n.severity))} />
                  <div>
                    <p className="text-xs font-bold text-foreground">{n.title}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{n.body}</p>
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

