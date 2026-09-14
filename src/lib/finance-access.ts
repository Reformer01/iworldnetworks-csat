import { NextResponse } from 'next/server';
import { isSuperAdmin } from '@/lib/admin-config';
import { forbidden } from '@/lib/api-response';

const FINANCE_VIEWER_EMAILS = ['dorcas.olayoole@iworldnetworks.net'];

function normalizeEmail(email: string | null | undefined): string {
  return (email || '').trim().toLowerCase();
}

export function canManageFinance(email: string | null | undefined): boolean {
  return isSuperAdmin(normalizeEmail(email));
}

export function canViewFinance(email: string | null | undefined): boolean {
  const normalized = normalizeEmail(email);
  if (isSuperAdmin(normalized)) return true;
  return FINANCE_VIEWER_EMAILS.includes(normalized);
}

export function requireFinanceViewer(admin: { email: string } | null): NextResponse | null {
  if (!admin || !canViewFinance(admin.email)) return forbidden('Finance access required.');
  return null;
}

export function requireFinanceManager(admin: { email: string } | null): NextResponse | null {
  if (!admin || !canManageFinance(admin.email)) return forbidden('Finance management access required.');
  return null;
}
