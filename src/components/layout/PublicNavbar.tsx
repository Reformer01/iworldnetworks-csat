'use client';

import Link from 'next/link';
import { Bell, Settings, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function PublicNavbar() {
  return (
    <nav className="fixed top-0 w-full z-50 glass-nav h-16 md:h-20 px-margin-mobile md:px-margin-desktop flex justify-between items-center max-w-container-max mx-auto left-0 right-0 border-b border-border/50">
      <Link href="/" className="font-mono text-sm md:text-base font-bold text-primary uppercase tracking-tight">
        I-World Networks
      </Link>
      
      {/* Desktop Menu */}
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

      {/* Mobile Menu */}
      <div className="md:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="hover:bg-transparent">
              <Menu className="w-7 h-7 text-primary" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[300px] border-l border-border">
            <SheetHeader className="mb-10">
              <SheetTitle className="text-left font-mono text-sm font-bold text-primary uppercase">
                I-World Networks
              </SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-6">
              <Link href="/" className="text-secondary font-mono text-label-mono border-l-4 border-secondary pl-4 py-1">
                Public Portal
              </Link>
              <Link href="/admin/login" className="text-on-surface-variant font-mono text-label-mono hover:text-secondary transition-all pl-4 py-1">
                Admin Hub
              </Link>
              <hr className="border-border/50 my-2" />
              <div className="flex flex-col gap-5 pl-4">
                 <div className="flex items-center gap-4 text-on-surface-variant group cursor-pointer">
                    <Bell className="w-5 h-5 group-hover:text-secondary transition-colors" />
                    <span className="font-mono text-[10px] uppercase tracking-wider">Notifications</span>
                 </div>
                 <div className="flex items-center gap-4 text-on-surface-variant group cursor-pointer">
                    <Settings className="w-5 h-5 group-hover:text-secondary transition-colors" />
                    <span className="font-mono text-[10px] uppercase tracking-wider">Settings</span>
                 </div>
              </div>
              <Button variant="default" className="rounded-xl w-full py-7 font-mono text-label-mono bg-primary text-white mt-6 uppercase tracking-widest font-bold">
                Sign In
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
