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
      <div className="min-h-[80vh] rounded-2xl bg-[#0a0f1e] p-4 text-slate-100 md:p-6">
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {FINANCE_NAV.map(({ name, href, icon: Icon }) => {
            const active = href === '/admin/finance/paystack' ? pathname === href : pathname?.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest transition-colors',
                  active ? 'bg-emerald-500 text-[#0a0f1e]' : 'bg-white/5 text-slate-300 hover:bg-white/10',
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
            <Loader2 className="h-7 w-7 animate-spin text-emerald-300" />
          </div>
        ) : !user ? (
          <div className="mx-auto max-w-md py-16 text-center">
            <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-amber-300" />
            <h2 className="font-display text-lg font-black uppercase tracking-tight text-white">Access denied</h2>
            <p className="mt-1 font-mono text-[11px] text-slate-400">
              Sign in with a finance-authorized account to view Paystack collections.
            </p>
            <Link
              href="/admin/login"
              className="mt-4 inline-block rounded-full bg-emerald-500 px-5 py-2 font-mono text-[11px] font-bold uppercase tracking-widest text-[#0a0f1e]"
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
