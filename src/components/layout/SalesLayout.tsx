'use client';

import React from 'react';
import {
  UsersThree,
  Broadcast,
  CheckCircle,
  ChartLineUp,
  ChartBar,
  Megaphone,
  Database,
  UploadSimple,
  Target,
} from '@phosphor-icons/react';
import { DashboardLayout, type NavItem } from '@/components/layout/DashboardLayout';

const salesNavItems: NavItem[] = [
  { name: 'Customers', href: '/admin/customers', icon: UsersThree },
  { name: 'BTS Customers', href: '/admin/bts/customers', icon: UsersThree },
  { name: 'BTS Audit', href: '/admin/bts/audit', icon: Broadcast },
  { name: 'BTS Review', href: '/admin/bts/review', icon: CheckCircle },
  { name: 'Dashboard', href: '/admin/sales', icon: ChartLineUp },
  { name: 'Monthly Revenue', href: '/admin/sales/monthly-revenue', icon: ChartBar },
  { name: 'Mailing', href: '/admin/mailing', icon: Megaphone },
  { name: 'Records', href: '/admin/sales/records', icon: Database },
  { name: 'Import Data', href: '/admin/sales/import', icon: UploadSimple },
  { name: 'Targets', href: '/admin/sales/targets', icon: Target },
];

const salesNavGroups = [
  { label: 'Customer Ops', hrefs: ['/admin/customers', '/admin/bts/customers', '/admin/bts/audit', '/admin/bts/review'] },
  { label: 'Sales & Revenue', hrefs: ['/admin/sales', '/admin/sales/monthly-revenue', '/admin/sales/records', '/admin/sales/import', '/admin/sales/targets'] },
  { label: 'Engagement', hrefs: ['/admin/mailing'] },
];

interface SalesLayoutProps {
  children: React.ReactNode;
}

export function SalesLayout({ children }: SalesLayoutProps) {
  return (
    <DashboardLayout
      navItems={salesNavItems}
      navGroups={salesNavGroups}
      backLink={{ href: '/admin/dashboard', label: 'Back to Admin' }}
      footerLabel="Sales Dashboard"
    >
      {children}
    </DashboardLayout>
  );
}
