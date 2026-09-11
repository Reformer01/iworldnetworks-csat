'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function PublicNavbar() {
  const router = useRouter();

  return (
    <nav className="fixed top-0 w-full z-50 h-14 px-4 md:px-6 flex justify-between items-center bg-background/80 backdrop-blur-sm border-b border-border/40">
      <Link href="/" className="flex items-center">
        <Image src="/logo.png" alt="I-World Logo" width={90} height={27} className="h-6 w-auto object-contain" priority />
      </Link>
      
      <div className="hidden md:flex gap-8 items-center">
        <Link href="/" className="text-secondary border-b-2 border-secondary pb-1 font-mono text-[10px] uppercase tracking-wider font-bold">
          Public Portal
        </Link>
        <Link href="/admin/dashboard" className="text-on-surface-variant font-mono text-[10px] uppercase tracking-wider hover:text-secondary transition-all duration-300">
          Admin Hub
        </Link>
        <div className="flex gap-4 items-center pl-4 border-l border-border">
          <Button 
            onClick={() => router.push('/admin/login')}
            variant="default" 
            className="rounded-full px-8 py-2 font-mono text-[10px] uppercase tracking-widest font-bold hover:scale-105 transition-transform bg-primary text-white"
          >
            Sign In
          </Button>
        </div>
      </div>

      <div className="md:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="h-11 w-11">
              <Menu className="w-5 h-5 text-primary" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[280px] p-0 border-r border-border">
            <div className="h-full flex flex-col pt-10">
              <SheetHeader className="px-6 mb-8 text-left">
                <SheetTitle className="text-left">
                  <Image src="/logo.png" alt="I-World Logo" width={90} height={27} className="h-6 w-auto object-contain" />
                </SheetTitle>
              </SheetHeader>
              <nav className="flex-1 space-y-1">
                <Link
                  href="/"
                  className="flex items-center gap-3 py-3 px-6 text-secondary bg-surface-container-low rounded-xl font-mono text-[10px] uppercase font-bold tracking-wider transition-all"
                >
                  Public Portal
                </Link>
                <Link
                  href="/admin/dashboard"
                  className="flex items-center gap-3 py-3 px-6 text-on-surface-variant hover:bg-surface-container-low rounded-xl font-mono text-[10px] uppercase font-bold tracking-wider transition-all"
                >
                  Admin Hub
                </Link>
              </nav>
              <div className="px-6 pb-6 pt-4 border-t border-border">
                <button
                  onClick={() => router.push('/admin/login')}
                  className="flex items-center gap-2 text-primary hover:text-secondary transition-colors font-mono text-[10px] uppercase font-bold"
                >
                  Sign In
                </button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
