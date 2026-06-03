
'use client';

import Link from 'next/link';
import { Bell, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function PublicNavbar() {
  return (
    <nav className="fixed top-0 w-full z-50 glass-nav h-20 px-margin-mobile md:px-margin-desktop flex justify-between items-center max-w-container-max mx-auto left-0 right-0">
      <Link href="/" className="font-display text-[32px] font-black tracking-tighter text-primary">
        I-World Networks
      </Link>
      <div className="hidden md:flex gap-8 items-center">
        <Link href="/" className="text-secondary border-b-2 border-secondary pb-1 font-mono text-label-mono">
          Public Portal
        </Link>
        <Link href="/admin/login" className="text-on-surface-variant font-mono text-label-mono hover:text-secondary transition-all duration-300">
          Admin Hub
        </Link>
        <div className="flex gap-4 items-center">
          <Bell className="w-5 h-5 text-on-surface-variant cursor-pointer hover:text-secondary transition-colors" />
          <Settings className="w-5 h-5 text-on-surface-variant cursor-pointer hover:text-secondary transition-colors" />
          <Button variant="default" className="rounded-full px-6 py-2 font-mono text-label-mono hover:scale-105 transition-transform bg-primary text-white">
            Sign In
          </Button>
        </div>
      </div>
    </nav>
  );
}
