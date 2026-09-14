'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileBarChart, LayoutDashboard, Loader2, ReceiptText, Scale, ShieldAlert, Users } from 'lucide-react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { useAuth, useUser } from '@/firebase';
import { cn } from '@/lib/utils';

const FINANCE_NAV = [
  { name: 'Overview', href: '/admin/finance/paystack', icon: LayoutDashboard },
  { name: 'Transactions', href: '/admin/finance/paystack/transactions', icon: ReceiptText },
  { name: 'Reconciliation', href: '/admin/finance/paystack/reconciliation', icon: Scale },
  { name: 'Customers', href: '/admin/finance/paystack/customers', icon: Users },
  { name: 'Reports', href: '/admin/finance/paystack/reports', icon: FileBarChart },
];

export default function PaystackFinanceLayout({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const { user, loading } = useUser(auth);
  const pathname = usePathname();

  return (
    <AdminLayout>
      <div>
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {FINANCE_NAV.map(({ name, href, icon: Icon }) => {
            const active = href === '/admin/finance/paystack' ? pathname === href : pathname?.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest transition-colors border',
                  active ? 'bg-secondary text-white border-secondary' : 'bg-white border-border hover:bg-gray-50',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {name}
              </Link>
            );
          })}
        </div>
        {loading ? (
          <div className="flex h-64 items-center justify-center" role="status" aria-label="Loading finance">
            <Loader2 className="h-7 w-7 animate-spin text-secondary" />
          </div>
        ) : !user ? (
          <div className="mx-auto max-w-md py-16 text-center">
            <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-amber-600" />
            <h2 className="font-display text-lg font-black uppercase tracking-tight">Access denied</h2>
            <p className="mt-1 font-mono text-[11px] opacity-60">Sign in with a finance-authorized account to view Paystack collections.</p>
            <Link
              href="/admin/login"
              className="mt-4 inline-block rounded-full bg-secondary px-5 py-2 font-mono text-[11px] font-bold uppercase tracking-widest text-white"
            >
              Sign in
            </Link>
          </div>
        ) : (
          children
        )}
      </div>
    </AdminLayout>
  );
}
