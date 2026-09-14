'use client';

import React from 'react';
import {
  UsersThree,
  Broadcast,
  CheckCircle,
  ChartLineUp,
  CreditCard,
  Megaphone,
  Database,
  UploadSimple,
  Target,
} from '@phosphor-icons/react';
import { DashboardLayout, type NavItem } from '@/components/layout/DashboardLayout';
import { useAuth, useUser } from '@/firebase';
import { canViewFinance } from '@/lib/finance-access';

const salesNavItems: NavItem[] = [
  { name: 'Customers', href: '/admin/customers', icon: UsersThree },
  { name: 'BTS Customers', href: '/admin/bts/customers', icon: UsersThree },
  { name: 'BTS Audit', href: '/admin/bts/audit', icon: Broadcast },
  { name: 'BTS Review', href: '/admin/bts/review', icon: CheckCircle },
  { name: 'Dashboard', href: '/admin/sales', icon: ChartLineUp },
  { name: 'Paystack Finance', href: '/admin/finance/paystack', icon: CreditCard },
  { name: 'Mailing', href: '/admin/mailing', icon: Megaphone },
  { name: 'Records', href: '/admin/sales/records', icon: Database },
  { name: 'Import Data', href: '/admin/sales/import', icon: UploadSimple },
  { name: 'Targets', href: '/admin/sales/targets', icon: Target },
];

const salesNavGroups = [
  { label: 'Customer Ops', hrefs: ['/admin/customers', '/admin/bts/customers', '/admin/bts/audit', '/admin/bts/review'] },
  {
    label: 'Sales & Revenue',
    hrefs: ['/admin/sales', '/admin/finance/paystack', '/admin/sales/records', '/admin/sales/import', '/admin/sales/targets'],
  },
  { label: 'Engagement', hrefs: ['/admin/mailing'] },
];

interface SalesLayoutProps {
  children: React.ReactNode;
}

export function SalesLayout({ children }: SalesLayoutProps) {
  const auth = useAuth();
  const { user } = useUser(auth);
  const filteredNavItems = salesNavItems.filter((item) => {
    if (item.href === '/admin/finance/paystack') return canViewFinance(user?.email);
    return true;
  });
  return (
    <DashboardLayout
      navItems={filteredNavItems}
      navGroups={salesNavGroups}
      backLink={{ href: '/admin/dashboard', label: 'Back to Admin' }}
      footerLabel="Sales Dashboard"
    >
      {children}
    </DashboardLayout>
  );
}
