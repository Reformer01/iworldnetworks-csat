import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { logWarn } from '@/lib/logger';
import { getAdminFirestore } from '@/lib/firebase-admin';
import type { SupportRevenueDoc } from '@/lib/support-revenue-types';

/**
 * MariaDB data layer for support revenue (was Firestore: `support_revenue`).
 * Reads and writes are MariaDB-first; Firestore mirrors are best-effort.
 */

function toNum(v: bigint | null | undefined): number | undefined {
  return v != null ? Number(v) : undefined;
}

export function supportRevenueFromRow(row: {
  id: string;
  customerName: string | null;
  location: string | null;
  region: string | null;
  projectType: string | null;
  items: unknown;
  totalAmount: number | null;
  description: string | null;
  notes: string | null;
  date: string | null;
  agentName: string | null;
  createdAt: bigint | null;
  updatedAt: bigint | null;
  deletedAt: bigint | null;
}): SupportRevenueDoc {
  return {
    id: row.id,
    customerName: row.customerName ?? '',
    location: row.location ?? '',
    region: (row.region as SupportRevenueDoc['region']) ?? 'Ogun',
    projectType: row.projectType ?? '',
    items: Array.isArray(row.items) ? (row.items as SupportRevenueDoc['items']) : [],
    totalAmount: row.totalAmount ?? 0,
    description: row.description ?? undefined,
    notes: row.notes ?? '',
    date: row.date ?? '',
    agentName: row.agentName ?? '',
    createdAt: toNum(row.createdAt),
    updatedAt: toNum(row.updatedAt),
    deletedAt: toNum(row.deletedAt),
  };
}

export function supportRevenueRowData(doc: SupportRevenueDoc): {
  customerName: string | null;
  location: string | null;
  region: string | null;
  projectType: string | null;
  items: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
  totalAmount: number | null;
  description: string | null;
  notes: string | null;
  date: string | null;
  agentName: string | null;
  createdAt: bigint | null;
  updatedAt: bigint | null;
  deletedAt: bigint | null;
} {
  const bn = (v: number | null | undefined): bigint | null => (v != null ? BigInt(v) : null);
  return {
    customerName: doc.customerName ?? null,
    location: doc.location ?? null,
    region: doc.region ?? null,
    projectType: doc.projectType ?? null,
    items: doc.items && doc.items.length > 0 ? (doc.items as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
    totalAmount: doc.totalAmount ?? null,
    description: doc.description ?? null,
    notes: doc.notes ?? null,
    date: doc.date ?? null,
    agentName: doc.agentName ?? null,
    createdAt: bn(doc.createdAt),
    updatedAt: bn(doc.updatedAt),
    deletedAt: bn(doc.deletedAt),
  };
}

export async function listSupportRevenueDb(projectType?: string | null, limit = 2000): Promise<SupportRevenueDoc[]> {
  const rows = await prisma.supportRevenue.findMany({
    where: {
      deletedAt: null,
      ...(projectType ? { projectType } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return rows.map((r) => supportRevenueFromRow(r));
}

export async function createSupportRevenueDb(doc: SupportRevenueDoc): Promise<SupportRevenueDoc> {
  const row = await prisma.supportRevenue.create({
    data: { id: doc.id ?? randomUUID(), ...supportRevenueRowData(doc) },
  });
  return supportRevenueFromRow(row);
}

export async function updateSupportRevenueDb(id: string, data: Partial<SupportRevenueDoc>): Promise<SupportRevenueDoc | null> {
  const row = await prisma.supportRevenue
    .update({ where: { id }, data: supportRevenueRowData(data as SupportRevenueDoc) })
    .catch(() => null);
  return row ? supportRevenueFromRow(row) : null;
}

export async function softDeleteSupportRevenueDb(id: string, deletedAt: number, updatedAt: number): Promise<boolean> {
  const res = await prisma.supportRevenue
    .update({ where: { id }, data: { deletedAt: BigInt(deletedAt), updatedAt: BigInt(updatedAt) } })
    .catch(() => null);
  return res != null;
}

export async function restoreSupportRevenueDb(id: string): Promise<boolean> {
  const row = await prisma.supportRevenue.findUnique({ where: { id } }).catch(() => null);
  if (!row || row.deletedAt == null) return false;
  const res = await prisma.supportRevenue
    .update({ where: { id }, data: { deletedAt: null, updatedAt: BigInt(Date.now()) } })
    .catch(() => null);
  if (res) {
    try {
      await getAdminFirestore()
        .collection('support_revenue')
        .doc(id)
        .update({ deletedAt: null, updatedAt: Number(res.updatedAt) });
    } catch {}
  }
  return res != null;
}

export async function getSupportRevenueByIdDb(id: string): Promise<SupportRevenueDoc | null> {
  const row = await prisma.supportRevenue.findUnique({ where: { id } }).catch(() => null);
  return row ? supportRevenueFromRow(row) : null;
}

// ---- Best-effort Firestore mirrors (rollback only) ----

export async function mirrorSupportRevenueCreated(doc: SupportRevenueDoc): Promise<void> {
  try {
    const { deletedAt, ...rest } = doc;
    void deletedAt;
    await getAdminFirestore()
      .collection('support_revenue')
      .doc(doc.id as string)
      .set(rest);
  } catch (e) {
    logWarn('[support-revenue] Firestore mirror create failed', { id: doc.id, error: String(e) });
  }
}

export async function mirrorSupportRevenueUpdated(id: string, data: Partial<SupportRevenueDoc>): Promise<void> {
  try {
    const { id: _id, deletedAt, ...rest } = data;
    void deletedAt;
    await getAdminFirestore().collection('support_revenue').doc(id).update(rest);
  } catch (e) {
    logWarn('[support-revenue] Firestore mirror update failed', { id, error: String(e) });
  }
}

export async function mirrorSupportRevenueDeleted(id: string, deletedAt: number, updatedAt: number): Promise<void> {
  try {
    await getAdminFirestore().collection('support_revenue').doc(id).update({ deletedAt, updatedAt });
  } catch (e) {
    logWarn('[support-revenue] Firestore mirror delete failed', { id, error: String(e) });
  }
}
