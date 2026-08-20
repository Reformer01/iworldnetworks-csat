import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { logWarn } from '@/lib/logger';
import { getAdminFirestore } from '@/lib/firebase-admin';
import type { SalesRecord, SalesTarget } from '@/lib/sales-types';

/**
 * MariaDB data layer for sales (was Firestore: `sales_records`,
 * `sales_targets`, `sales_imports`). Reads and writes are MariaDB-first;
 * Firestore mirrors are best-effort (rollback only).
 */

function toNum(v: bigint | null | undefined): number | undefined {
  return v != null ? Number(v) : undefined;
}

export type SalesRecordRow = {
  id: string;
  serialNumber: number;
  customerName: string;
  location: string;
  region: string;
  segment: string;
  nrc: number;
  mrc: number;
  planCode: string;
  saleDate: string;
  quarter: string;
  month: string;
  packageType: string;
  salesAgent: string;
  meansOfSale: string;
  accountStatus: string;
  statusNotes: string;
  importBatchId: string;
  customerType: string;
  revivedByAgent: string;
  bts: string;
  deletedAt: bigint | null;
  createdAt: bigint | null;
  updatedAt: bigint | null;
};

export function salesRecordFromRow(row: SalesRecordRow): SalesRecord & { id: string } {
  // SAFETY: the enum columns (region/segment/quarter/packageType/accountStatus/
  // customerType) are only written by this module's validated import pipeline,
  // so the stored strings always match the sales-types unions.
  return {
    id: row.id,
    serialNumber: row.serialNumber,
    customerName: row.customerName,
    location: row.location,
    region: row.region as SalesRecord['region'],
    segment: row.segment as SalesRecord['segment'],
    nrc: row.nrc,
    mrc: row.mrc,
    planCode: row.planCode,
    saleDate: row.saleDate,
    quarter: row.quarter as SalesRecord['quarter'],
    month: row.month,
    packageType: row.packageType as SalesRecord['packageType'],
    salesAgent: row.salesAgent,
    meansOfSale: row.meansOfSale,
    accountStatus: row.accountStatus as SalesRecord['accountStatus'],
    statusNotes: row.statusNotes,
    importBatchId: row.importBatchId,
    customerType: (row.customerType as SalesRecord['customerType']) ?? 'new',
    revivedByAgent: row.revivedByAgent,
    bts: row.bts,
    createdAt: toNum(row.createdAt),
    updatedAt: toNum(row.updatedAt),
    deletedAt: toNum(row.deletedAt),
  };
}

type SalesRecordCreateInput = Omit<SalesRecord, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'revivedByAgent'> & {
  id?: string;
  createdAt?: number;
  updatedAt?: number;
  deletedAt?: number;
  revivedByAgent?: string;
};

/** Row data for SalesRecordEntry create/update. `undefined` skips the column. */
export type SalesRecordRowData = {
  serialNumber?: number;
  customerName?: string;
  location?: string;
  region?: string;
  segment?: string;
  nrc?: number;
  mrc?: number;
  planCode?: string;
  saleDate?: string;
  quarter?: string;
  month?: string;
  packageType?: string;
  salesAgent?: string;
  meansOfSale?: string;
  accountStatus?: string;
  statusNotes?: string;
  importBatchId?: string;
  customerType?: string;
  revivedByAgent?: string;
  bts?: string;
  deletedAt?: bigint | null;
  createdAt?: bigint;
  updatedAt?: bigint;
};

export function salesRecordRowData(doc: SalesRecordCreateInput): SalesRecordRowData {
  // Prisma semantics: `undefined` skips the field (partial updates), `null`
  // sets NULL (deletedAt), BigInt converts epoch-ms numbers.
  const bn = (v: number | null | undefined): bigint | undefined => (v != null ? BigInt(v) : undefined);
  return {
    serialNumber: doc.serialNumber,
    customerName: doc.customerName,
    location: doc.location,
    region: doc.region,
    segment: doc.segment,
    nrc: doc.nrc,
    mrc: doc.mrc,
    planCode: doc.planCode,
    saleDate: doc.saleDate,
    quarter: doc.quarter,
    month: doc.month,
    packageType: doc.packageType,
    salesAgent: doc.salesAgent,
    meansOfSale: doc.meansOfSale,
    accountStatus: doc.accountStatus,
    statusNotes: doc.statusNotes,
    importBatchId: doc.importBatchId,
    customerType: doc.customerType,
    revivedByAgent: doc.revivedByAgent,
    bts: doc.bts,
    deletedAt: doc.deletedAt !== undefined ? (doc.deletedAt === null ? null : BigInt(doc.deletedAt)) : undefined,
    createdAt: bn(doc.createdAt),
    updatedAt: bn(doc.updatedAt),
  };
}

export interface ListSalesRecordsFilter {
  region?: string | null;
  status?: string | null;
  agent?: string | null;
  importBatchId?: string | null;
}

export async function listSalesRecordsDb(filter: ListSalesRecordsFilter = {}, limit = 2000): Promise<Array<SalesRecord & { id: string }>> {
  const rows = await prisma.salesRecordEntry.findMany({
    where: {
      deletedAt: null,
      ...(filter.region ? { region: filter.region } : null),
      ...(filter.status ? { accountStatus: filter.status } : null),
      ...(filter.agent ? { salesAgent: filter.agent } : null),
      ...(filter.importBatchId ? { importBatchId: filter.importBatchId } : null),
    },
    orderBy: { serialNumber: 'desc' },
    take: limit,
  });
  return rows.map((r) => salesRecordFromRow(r));
}

export async function createSalesRecordDb(doc: SalesRecordCreateInput): Promise<SalesRecord & { id: string }> {
  // SAFETY: the spread row object carries optional column keys that Prisma's
  // generated create-input type cannot express structurally; values are
  // validated by SalesRecordCreateInput before this point.
  const row = await prisma.salesRecordEntry.create({
    data: { id: doc.id ?? randomUUID(), ...salesRecordRowData(doc) } as never,
  });
  return salesRecordFromRow(row);
}

export async function updateSalesRecordDb(
  id: string,
  data: Partial<SalesRecordCreateInput>,
): Promise<(SalesRecord & { id: string }) | null> {
  // SAFETY: `data` was validated on the request path and only ever contains
  // SalesRecordCreateInput-shaped fields; the `as never` bridges Prisma's
  // generated update-input type for the partially-present row object.
  const row = await prisma.salesRecordEntry
    .update({ where: { id }, data: salesRecordRowData(data as SalesRecordCreateInput) as never })
    .catch(() => null);
  return row ? salesRecordFromRow(row) : null;
}

export async function softDeleteSalesRecordDb(id: string, deletedAt: number, updatedAt: number): Promise<boolean> {
  const res = await prisma.salesRecordEntry
    .update({ where: { id }, data: { deletedAt: BigInt(deletedAt), updatedAt: BigInt(updatedAt) } })
    .catch(() => null);
  return res != null;
}

export async function restoreSalesRecordDb(id: string): Promise<boolean> {
  const row = await prisma.salesRecordEntry.findUnique({ where: { id } }).catch(() => null);
  if (!row || row.deletedAt == null) return false;
  const res = await prisma.salesRecordEntry
    .update({ where: { id }, data: { deletedAt: null, updatedAt: BigInt(Date.now()) } })
    .catch(() => null);
  if (res) {
    try {
      await getAdminFirestore()
        .collection('sales_records')
        .doc(id)
        .update({ deletedAt: null, updatedAt: Number(res.updatedAt) });
    } catch {}
  }
  return res != null;
}

export async function getSalesRecordByIdDb(id: string): Promise<(SalesRecord & { id: string }) | null> {
  const row = await prisma.salesRecordEntry.findUnique({ where: { id } }).catch(() => null);
  return row ? salesRecordFromRow(row) : null;
}

export async function listSalesImportsDb(limit = 50) {
  const rows = await prisma.salesImport.findMany({ orderBy: { importedAt: 'desc' }, take: limit });
  return rows.map((r) => ({ ...r, importedAt: r.importedAt != null ? Number(r.importedAt) : null }));
}

export async function deleteSalesImportBatchDb(batchId: string, deletedBy: string): Promise<number> {
  const entries = await prisma.salesRecordEntry.findMany({ where: { importBatchId: batchId, deletedAt: null } });
  if (entries.length === 0) return 0;
  const now = BigInt(Date.now());
  await prisma.salesRecordEntry.updateMany({
    where: { importBatchId: batchId, deletedAt: null },
    data: { deletedAt: now, updatedAt: now },
  });
  await prisma.salesImport.updateMany({ where: { batchId }, data: { status: 'reverted' } }).catch(() => null);
  return entries.length;
}

export async function updateSalesTargetDb(
  id: string,
  data: { targetRevenue?: number; targetCustomers?: number; region?: string | null; agentName?: string | null },
): Promise<(SalesTarget & { id: string }) | null> {
  const row = await prisma.salesTarget
    .update({ where: { id }, data: { ...data, updatedAt: BigInt(Date.now()) } as never })
    .catch(() => null);
  return row ? salesTargetFromRow(row) : null;
}

export async function deleteSalesTargetDb(id: string): Promise<boolean> {
  const res = await prisma.salesTarget.delete({ where: { id } }).catch(() => null);
  return res != null;
}

export async function getSalesTargetByIdDb(id: string): Promise<(SalesTarget & { id: string }) | null> {
  const row = await prisma.salesTarget.findUnique({ where: { id } }).catch(() => null);
  return row ? salesTargetFromRow(row) : null;
}

// ---- Sales targets ----

export type SalesTargetRow = {
  id: string;
  month: string;
  region: string | null;
  agentName: string | null;
  targetRevenue: number;
  targetCustomers: number;
  createdAt: bigint | null;
  updatedAt: bigint | null;
};

export function salesTargetFromRow(row: SalesTargetRow): SalesTarget & { id: string } {
  // SAFETY: sales_targets rows are only written by createSalesTargetDb, which
  // accepts a validated region string (SalesRegion or undefined).
  return {
    id: row.id,
    month: row.month,
    region: (row.region as SalesTarget['region']) ?? undefined,
    agentName: row.agentName ?? undefined,
    targetRevenue: row.targetRevenue,
    targetCustomers: row.targetCustomers,
    createdAt: toNum(row.createdAt),
    updatedAt: toNum(row.updatedAt),
  };
}

export async function listSalesTargetsDb(limit = 60): Promise<Array<SalesTarget & { id: string }>> {
  const rows = await prisma.salesTarget.findMany({ orderBy: { month: 'desc' }, take: limit });
  return rows.map((r) => salesTargetFromRow(r));
}

export async function createSalesTargetDb(data: {
  month: string;
  region?: string;
  agentName?: string;
  targetRevenue: number;
  targetCustomers: number;
  createdAt?: number;
}): Promise<SalesTarget & { id: string }> {
  const row = await prisma.salesTarget.create({
    data: {
      month: data.month,
      region: data.region ?? null,
      agentName: data.agentName ?? null,
      targetRevenue: data.targetRevenue,
      targetCustomers: data.targetCustomers,
      createdAt: BigInt(data.createdAt ?? Date.now()),
    },
  });
  return salesTargetFromRow(row);
}

// ---- Sales imports ----

export async function createSalesImportDb(data: {
  batchId: string;
  source?: string;
  fileName?: string;
  recordCount: number;
  importedBy: string;
  importedAt?: number;
}): Promise<void> {
  await prisma.salesImport.create({
    data: {
      batchId: data.batchId,
      source: data.source ?? 'csv_upload',
      fileName: data.fileName ?? '',
      recordCount: data.recordCount,
      importedBy: data.importedBy,
      importedAt: BigInt(data.importedAt ?? Date.now()),
    },
  });
}

// ---- Best-effort Firestore mirrors (rollback only) ----

export async function mirrorSalesRecordCreated(doc: SalesRecord & { id: string }): Promise<void> {
  try {
    const { deletedAt, ...rest } = doc;
    void deletedAt;
    await getAdminFirestore().collection('sales_records').doc(doc.id).set(rest);
  } catch (e) {
    logWarn('[sales-db] Firestore mirror record create failed', { id: doc.id, error: String(e) });
  }
}

export async function mirrorSalesRecordUpdated(id: string, data: Partial<SalesRecord>): Promise<void> {
  try {
    const { id: _id, deletedAt, ...rest } = data;
    void deletedAt;
    await getAdminFirestore().collection('sales_records').doc(id).update(rest);
  } catch (e) {
    logWarn('[sales-db] Firestore mirror record update failed', { id, error: String(e) });
  }
}

export async function mirrorSalesRecordDeleted(id: string, deletedAt: number, updatedAt: number): Promise<void> {
  try {
    await getAdminFirestore().collection('sales_records').doc(id).update({ deletedAt, updatedAt });
  } catch (e) {
    logWarn('[sales-db] Firestore mirror record delete failed', { id, error: String(e) });
  }
}

export async function mirrorSalesTargetCreated(doc: SalesTarget & { id: string }): Promise<void> {
  try {
    await getAdminFirestore()
      .collection('sales_targets')
      .doc(doc.id)
      .set({
        month: doc.month,
        region: doc.region ?? null,
        agentName: doc.agentName ?? null,
        targetRevenue: doc.targetRevenue,
        targetCustomers: doc.targetCustomers,
        createdAt: doc.createdAt ?? Date.now(),
      });
  } catch (e) {
    logWarn('[sales-db] Firestore mirror target create failed', { id: doc.id, error: String(e) });
  }
}
