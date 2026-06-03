
'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  Headset, 
  Wrench, 
  CreditCard, 
  Star, 
  Bell, 
  Settings,
  FileText
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { PlaceHolderImages } from '@/lib/placeholder-images';

interface AdminLayoutProps {
  children: React.ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname();
  const avatar = PlaceHolderImages.find(img => img.id === 'admin-avatar')!;

  const navItems = [
    { name: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
    { name: 'Support', href: '/admin/support', icon: Headset },
    { name: 'Installation', href: '/admin/installation', icon: Wrench },
    { name: 'Billing', href: '/admin/billing', icon: CreditCard },
    { name: 'Testimonials', href: '/admin/testimonials', icon: Star },
  ];

  return (
    <div className="bg-background min-h-screen">
      {/* Top Bar */}
      <header className="fixed top-0 w-full z-50 glass-nav px-margin-desktop h-20 flex justify-between items-center max-w-container-max mx-auto left-0 right-0 border-b border-border">
        <div className="flex items-center gap-4">
          <Link href="/" className="font-display text-display-lg font-black tracking-tighter text-primary text-[32px]">
            I-World Networks
          </Link>
        </div>
        <div className="hidden md:flex gap-8 items-center">
          <Link href="/" className="text-on-surface-variant font-mono text-label-mono hover:text-secondary transition-all">
            Public Portal
          </Link>
          <Link href="/admin/dashboard" className={cn(
            "font-mono text-label-mono transition-all",
            pathname.startsWith('/admin') ? "text-secondary border-b-2 border-secondary pb-1" : "text-on-surface-variant hover:text-secondary"
          )}>
            Admin Hub
          </Link>
        </div>
        <div className="flex items-center gap-6">
          <Bell className="w-5 h-5 text-on-surface-variant cursor-pointer hover:text-primary transition-colors" />
          <Settings className="w-5 h-5 text-on-surface-variant cursor-pointer hover:text-primary transition-colors" />
          <div className="w-10 h-10 rounded-full overflow-hidden border border-border">
            <Image src={avatar.imageUrl} alt="Admin" width={40} height={40} className="object-cover" />
          </div>
        </div>
      </header>

      {/* Sidebar */}
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
        <div className="px-8 mt-auto">
          <Button className="w-full bg-secondary text-white py-6 rounded-lg font-mono text-label-mono hover:bg-secondary-container transition-colors flex items-center justify-center gap-2">
            <FileText className="w-4 h-4" />
            Generate Report
          </Button>
        </div>
      </aside>

      {/* Content */}
      <main className="md:ml-64 pt-24 px-margin-mobile md:px-margin-desktop min-h-screen">
        {children}
      </main>

      {/* Footer */}
      <footer className="md:ml-64 bg-surface-bright border-t border-border py-12 relative z-50">
        <div className="max-w-container-max mx-auto px-margin-desktop flex flex-col md:flex-row justify-between items-start gap-8">
          <div className="space-y-4">
            <span className="font-mono text-label-mono font-bold text-primary">I-World Networks</span>
            <p className="font-mono text-xs text-on-surface-variant">© 2024 I-World Networks.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-12">
            <div className="space-y-4">
              <h5 className="font-mono text-xs font-bold uppercase text-primary">Locations</h5>
              <nav className="flex flex-col gap-2">
                {['Lagos', 'Abuja', 'Abeokuta'].map(city => (
                  <a key={city} className="font-mono text-xs text-on-surface-variant hover:text-secondary" href="#">{city}</a>
                ))}
              </nav>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
