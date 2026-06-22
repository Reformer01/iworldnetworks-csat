'use client';

import Link from 'next/link';
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
    <nav className="fixed top-0 w-full z-50 h-16 md:h-20 px-margin-mobile md:px-margin-desktop flex justify-between items-center max-w-container-max mx-auto left-0 right-0">
      <Link href="/" className="font-mono text-sm md:text-base font-bold text-primary uppercase tracking-tight">
        I-World Networks
      </Link>
      
      <div className="hidden md:flex gap-8 items-center">
        <Link href="/" className="text-secondary border-b-2 border-secondary pb-1 font-mono text-[12px] uppercase tracking-wider font-bold">
          Public Portal
        </Link>
        <Link href="/admin/dashboard" className="text-on-surface-variant font-mono text-[12px] uppercase tracking-wider hover:text-secondary transition-all duration-300">
          Admin Hub
        </Link>
        <div className="flex gap-4 items-center pl-4 border-l border-border">
          <Button 
            onClick={() => router.push('/admin/login')}
            variant="default" 
            className="rounded-full px-8 py-2 font-mono text-[12px] uppercase tracking-widest font-bold hover:scale-105 transition-transform bg-primary text-white"
          >
            Sign In
          </Button>
        </div>
      </div>

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
              <Link href="/" className="text-secondary font-mono text-[12px] uppercase font-bold border-l-4 border-secondary pl-4 py-1">
                Public Portal
              </Link>
              <Link href="/admin/dashboard" className="text-on-surface-variant font-mono text-[12px] uppercase hover:text-secondary transition-all pl-4 py-1">
                Admin Hub
              </Link>
              <hr className="border-border/50 my-2" />
              <Button 
                onClick={() => router.push('/admin/login')}
                variant="default" 
                className="rounded-xl w-full py-7 font-mono text-[12px] bg-primary text-white mt-6 uppercase tracking-widest font-bold"
              >
                Sign In
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
