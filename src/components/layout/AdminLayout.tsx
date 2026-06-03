'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  LayoutDashboard, 
  Headset, 
  Wrench, 
  CreditCard, 
  Star, 
  Bell, 
  Settings,
  FileText,
  ArrowLeft,
  Menu,
  LogOut
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { useAuth, useUser } from '@/firebase';
import { signOut } from 'firebase/auth';
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
  const avatar = PlaceHolderImages.find(img => img.id === 'admin-avatar')!;

  useEffect(() => {
    if (!loading && !user) {
      router.push('/admin/login');
    }
  }, [user, loading, router]);

  const handleLogout = async () => {
    if (auth) {
      await signOut(auth);
      router.push('/admin/login');
    }
  };

  const navItems = [
    { name: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
    { name: 'Support', href: '/admin/support', icon: Headset },
    { name: 'Installation', href: '/admin/installation', icon: Wrench },
    { name: 'Billing', href: '/admin/billing', icon: CreditCard },
    { name: 'Testimonials', href: '/admin/testimonials', icon: Star },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-secondary/20 border-t-secondary rounded-full animate-spin" />
          <p className="font-mono text-label-mono text-on-surface-variant uppercase animate-pulse">Verifying Credentials</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="bg-background min-h-screen flex flex-col">
      {/* Top Bar */}
      <header className="fixed top-0 w-full z-50 glass-nav px-margin-mobile md:px-margin-desktop h-16 md:h-20 flex justify-between items-center max-w-container-max mx-auto left-0 right-0 border-b border-border">
        <div className="flex items-center gap-3 md:gap-6">
          <Link href="/" className="font-display text-xl md:text-[32px] font-black tracking-tighter text-primary">
            I-World
          </Link>
          <div className="h-6 md:h-8 w-px bg-border hidden sm:block"></div>
          <Link href="/" className="hidden sm:flex items-center gap-2 text-on-surface-variant font-mono text-[10px] md:text-xs hover:text-secondary transition-all group">
            <ArrowLeft className="w-3 h-3 md:w-4 md:h-4 group-hover:-translate-x-1 transition-transform" />
            Public Portal
          </Link>
        </div>

        <div className="flex items-center gap-2 md:gap-6">
          <div className="hidden md:flex gap-8 items-center mr-6">
             <Link href="/admin/dashboard" className={cn(
              "font-mono text-label-mono transition-all",
              pathname.startsWith('/admin') ? "text-secondary border-b-2 border-secondary pb-1" : "text-on-surface-variant hover:text-secondary"
            )}>
              Admin Hub
            </Link>
          </div>
          <div className="hidden xs:flex items-center gap-4">
            <Bell className="w-4 h-4 md:w-5 md:h-5 text-on-surface-variant cursor-pointer hover:text-primary transition-colors" />
            <Settings className="w-4 h-4 md:w-5 md:h-5 text-on-surface-variant cursor-pointer hover:text-primary transition-colors" />
            <button onClick={handleLogout} className="group flex items-center gap-2 text-on-surface-variant hover:text-destructive transition-colors">
              <LogOut className="w-4 h-4 md:w-5 md:h-5 group-hover:rotate-12 transition-transform" />
            </button>
          </div>
          <div className="w-7 h-7 md:w-10 md:h-10 rounded-full overflow-hidden border border-border">
            <Image src={avatar.imageUrl} alt="Admin" width={40} height={40} className="object-cover" />
          </div>
          
          {/* Mobile Menu Trigger */}
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
                    <SheetTitle className="font-display text-2xl text-primary font-bold">Admin Hub</SheetTitle>
                    <p className="font-mono text-[10px] text-on-surface-variant opacity-60 uppercase tracking-widest">Management Hub</p>
                  </SheetHeader>
                  <nav className="flex-1 space-y-1">
                    {navItems.map((item) => (
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
                        <span className="font-mono text-xs uppercase tracking-wider">{item.name}</span>
                      </Link>
                    ))}
                    <button 
                      onClick={handleLogout}
                      className="w-full flex items-center gap-4 py-3 px-6 text-destructive hover:bg-destructive/5 transition-all"
                    >
                      <LogOut className="w-5 h-5" />
                      <span className="font-mono text-xs uppercase tracking-wider">Sign Out</span>
                    </button>
                  </nav>
                  <div className="px-6 pb-10 mt-auto">
                    <Link href="/" className="flex items-center gap-2 text-on-surface-variant font-mono text-[10px] hover:text-secondary transition-all group mb-6 pl-1">
                      <ArrowLeft className="w-4 h-4" />
                      Back to Public Portal
                    </Link>
                    <Button className="w-full bg-secondary text-white py-6 rounded-xl font-mono text-[10px] flex items-center justify-center gap-3 uppercase tracking-widest font-bold">
                      <FileText className="w-4 h-4" />
                      Generate Report
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      {/* Sidebar (Desktop only) */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-background border-r border-border pt-24 pb-8 flex flex-col z-40 hidden md:flex">
        <div className="px-8 mb-12">
          <h2 className="font-display text-[24px] text-primary font-bold">Admin Hub</h2>
          <p className="font-mono text-[12px] text-on-surface-variant opacity-60 uppercase tracking-widest">Management Hub</p>
        </div>
        <nav className="flex-1 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-4 py-3 px-8 transition-all group",
                pathname === item.href 
                  ? "text-primary font-bold active-pill bg-surface-container-low" 
                  : "text-on-surface-variant hover:bg-surface-container-low"
              )}
            >
              <item.icon className={cn("w-5 h-5 transition-colors", pathname === item.href ? "text-secondary" : "group-hover:text-secondary")} />
              <span className="font-mono text-label-mono">{item.name}</span>
            </Link>
          ))}
        </nav>
        <div className="px-8 mt-auto flex flex-col gap-4">
          <Button className="w-full bg-secondary text-white py-6 rounded-lg font-mono text-label-mono hover:bg-secondary-container transition-colors flex items-center justify-center gap-2">
            <FileText className="w-4 h-4" />
            Generate Report
          </Button>
        </div>
      </aside>

      {/* Content */}
      <main className="md:ml-64 pt-20 md:pt-24 px-margin-mobile md:px-margin-desktop flex-1">
        {children}
      </main>

      {/* Footer */}
      <footer className="md:ml-64 bg-surface-bright border-t border-border py-8 md:py-12 relative z-50">
        <div className="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop flex flex-col md:flex-row justify-between items-start gap-8">
          <div className="space-y-4 text-center md:text-left">
            <span className="font-mono text-xs md:text-label-mono font-bold text-primary">I-World Networks</span>
            <p className="font-mono text-[10px] text-on-surface-variant">© 2026 I-World Networks. All rights reserved.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-8 md:gap-12 w-full md:w-auto">
            <div className="space-y-4">
              <h5 className="font-mono text-[10px] font-bold uppercase text-primary">Regional Hubs</h5>
              <nav className="flex flex-col gap-1.5 md:gap-2">
                {['Abeokuta', 'Ibadan', 'Osogbo', 'Akure'].map(city => (
                  <a key={city} className="font-mono text-[10px] text-on-surface-variant hover:text-secondary" href="#">{city}</a>
                ))}
              </nav>
            </div>
            <div className="space-y-4">
              <h5 className="font-mono text-[10px] font-bold uppercase text-primary">Legal</h5>
              <nav className="flex flex-col gap-1.5 md:gap-2">
                <a className="font-mono text-[10px] text-on-surface-variant hover:text-secondary" href="#">Privacy Policy</a>
                <a className="font-mono text-[10px] text-on-surface-variant hover:text-secondary" href="#">Terms</a>
              </nav>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
