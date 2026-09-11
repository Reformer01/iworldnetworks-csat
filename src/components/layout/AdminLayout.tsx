'use client';

import React from 'react';
import {
  LayoutDashboard,
  Brain,
  TrendingUp,
  Receipt,
  Headset,
  Hammer,
  Wrench,
  CreditCard,
  Activity,
  Database,
  Users,
  Mail,
  Star,
  PhoneCall,
  Shield,
  FileText,
  BarChart3,
} from 'lucide-react';
import { DashboardLayout, type NavItem } from '@/components/layout/DashboardLayout';
import { useAuth, useUser } from '@/firebase';
import { isSuperAdmin } from '@/lib/admin-config';

const adminNavItems: NavItem[] = [
  // Overview
  { name: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
  { name: 'Intelligence', href: '/admin/intelligence', icon: Brain },
  { name: 'Reports', href: '/admin/reports', icon: BarChart3 },

  // Sales & Revenue
  { name: 'Sales KPIs', href: '/admin/sales', icon: TrendingUp },
  { name: 'Support Revenue', href: '/admin/support-revenue', icon: Receipt },
  { name: 'Income Report', href: '/admin/income-report', icon: Receipt },

  // Support & Operations
  { name: 'Support', href: '/admin/support', icon: Headset },
  { name: 'Stability', href: '/admin/stability', icon: Activity },
  { name: 'Field Support', href: '/admin/field-support', icon: Hammer },
  { name: 'Installation', href: '/admin/installation', icon: Wrench },
  { name: 'Billing', href: '/admin/billing', icon: CreditCard },

  // Engagement & Growth — Reachout Log on top for staff visibility
  { name: 'Reachout Log', href: '/admin/engagement', icon: PhoneCall },
  { name: 'Mailing', href: '/admin/mailing', icon: Mail },
  { name: 'Campaigns', href: '/admin/campaigns', icon: FileText },
  { name: 'Testimonials', href: '/admin/testimonials', icon: Star },

  // Team & System
  { name: 'Staff Performance', href: '/admin/staff', icon: Users },
  { name: 'Super Admin', href: '/admin/super', icon: Shield },
  { name: 'Manage Data', href: '/admin/crud', icon: Database },
];

const adminNavGroups = [
  { label: 'Overview', hrefs: ['/admin/dashboard', '/admin/intelligence', '/admin/reports'] },
  { label: 'Sales & Revenue', hrefs: ['/admin/sales', '/admin/support-revenue', '/admin/income-report', '/admin/billing'] },
  { label: 'Support', hrefs: ['/admin/support', '/admin/stability', '/admin/field-support', '/admin/installation'] },
  { label: 'Engagement', hrefs: ['/admin/engagement', '/admin/mailing', '/admin/campaigns', '/admin/testimonials'] },
  { label: 'Team', hrefs: ['/admin/staff', '/admin/super', '/admin/crud'] },
];

interface AdminLayoutProps {
  children: React.ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const auth = useAuth();
  const { user } = useUser(auth);
  const isSuper = user ? isSuperAdmin(user.email || '') : false;

  // Filter nav items based on role
  const filteredNavItems = adminNavItems.filter((item) => {
    if (item.href === '/admin/super') return isSuper;
    return true;
  });

  return (
    <DashboardLayout
      navItems={filteredNavItems}
      navGroups={adminNavGroups}
      showPublicPortal
      footerLabel="© 2026 I-World Networks. All rights reserved."
    >
      {children}
    </DashboardLayout>
  );
}
