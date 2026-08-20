import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { logWarn } from '@/lib/logger';
import { getAdminFirestore } from '@/lib/firebase-admin';
import type { Ticket } from '@/lib/sales-types';

/**
 * MariaDB data layer for the tickets module (was Firestore: `tickets`).
 * Reads are MariaDB-first; writes are MariaDB-first with best-effort
 * Firestore mirrors (rollback only) — Firestore throttling must never fail
 * a request.
 */

function toNum(v: bigint | null | undefined): number | undefined {
  return v != null ? Number(v) : undefined;
}

export function ticketFromRow(row: {
  id: string;
  ticketNumber: bigint | number;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  location: string | null;
  region: string | null;
  bts: string | null;
  complaintType: string | null;
  description: string | null;
  createdBy: string | null;
  assignedTo: string | null;
  escalatedTo: string | null;
  status: string | null;
  createdAt: bigint | null;
  assignedAt: bigint | null;
  escalatedAt: bigint | null;
  resolvedAt: bigint | null;
  closedAt: bigint | null;
  slaBreached: boolean | null;
  resolutionNotes: string | null;
  firstTimeFix: boolean | null;
  priority: number | null;
  delayReasons: unknown;
  delayNotes: string | null;
  followUps: unknown;
  createdByAgent: string | null;
  updatedAt: bigint | null;
  deletedAt: bigint | null;
}): Ticket {
  // SAFETY: tickets are written by this module with validated enums (region,
  // complaintType, status) and JSON columns that hold string[] / FollowUp[].
  const ticket: Ticket = {
    id: row.id,
    ticketNumber: Number(row.ticketNumber),
    customerName: row.customerName ?? '',
    customerPhone: row.customerPhone ?? '',
    customerEmail: row.customerEmail ?? undefined,
    location: row.location ?? '',
    region: (row.region as Ticket['region']) ?? 'Oyo',
    bts: row.bts ?? undefined,
    complaintType: (row.complaintType as Ticket['complaintType']) ?? 'Support',
    description: row.description ?? '',
    createdBy: row.createdBy ?? '',
    assignedTo: row.assignedTo ?? undefined,
    escalatedTo: row.escalatedTo ?? undefined,
    status: (row.status as Ticket['status']) ?? 'open',
    createdAt: toNum(row.createdAt) ?? 0,
    assignedAt: toNum(row.assignedAt),
    escalatedAt: toNum(row.escalatedAt),
    resolvedAt: toNum(row.resolvedAt),
    closedAt: toNum(row.closedAt),
    slaBreached: row.slaBreached ?? false,
    resolutionNotes: row.resolutionNotes ?? undefined,
    firstTimeFix: row.firstTimeFix ?? undefined,
    delayReasons: Array.isArray(row.delayReasons) ? (row.delayReasons as string[]) : [],
    delayNotes: row.delayNotes ?? undefined,
    followUps: Array.isArray(row.followUps) ? (row.followUps as Ticket['followUps']) : [],
    createdByAgent: row.createdByAgent ?? undefined,
    updatedAt: toNum(row.updatedAt) ?? 0,
    deletedAt: toNum(row.deletedAt),
  };
  return ticket;
}

export type TicketRowData = {
  ticketNumber: number;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  location: string | null;
  region: string | null;
  bts: string | null;
  complaintType: string | null;
  description: string | null;
  createdBy: string | null;
  assignedTo: string | null;
  escalatedTo: string | null;
  status: string | null;
  createdAt: bigint | null;
  assignedAt: bigint | null;
  escalatedAt: bigint | null;
  resolvedAt: bigint | null;
  closedAt: bigint | null;
  slaBreached: boolean | null;
  resolutionNotes: string | null;
  firstTimeFix: boolean | null;
  delayReasons: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
  delayNotes: string | null;
  followUps: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
  createdByAgent: string | null;
  updatedAt: bigint | null;
  deletedAt: bigint | null;
};

export function ticketRowData(t: Ticket): TicketRowData {
  const bn = (v: number | null | undefined): bigint | null => (v != null ? BigInt(v) : null);
  return {
    ticketNumber: t.ticketNumber,
    customerName: t.customerName ?? null,
    customerPhone: t.customerPhone ?? null,
    customerEmail: t.customerEmail ?? null,
    location: t.location ?? null,
    region: t.region ?? null,
    bts: t.bts ?? null,
    complaintType: t.complaintType ?? null,
    description: t.description ?? null,
    createdBy: t.createdBy ?? null,
    assignedTo: t.assignedTo ?? null,
    escalatedTo: t.escalatedTo ?? null,
    status: t.status ?? null,
    createdAt: bn(t.createdAt),
    assignedAt: bn(t.assignedAt),
    escalatedAt: bn(t.escalatedAt),
    resolvedAt: bn(t.resolvedAt),
    closedAt: bn(t.closedAt),
    slaBreached: t.slaBreached ?? null,
    resolutionNotes: t.resolutionNotes ?? null,
    firstTimeFix: t.firstTimeFix ?? null,
    delayReasons: t.delayReasons && t.delayReasons.length > 0 ? t.delayReasons : Prisma.DbNull,
    delayNotes: t.delayNotes ?? null,
    followUps: t.followUps && t.followUps.length > 0 ? (t.followUps as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
    createdByAgent: t.createdByAgent ?? null,
    updatedAt: bn(t.updatedAt),
    deletedAt: bn(t.deletedAt),
  };
}

export interface TicketFilters {
  status?: string | null;
  assignedTo?: string | null;
  createdBy?: string | null;
}

export async function listTicketsDb(filters: TicketFilters = {}, limit = 1000): Promise<Ticket[]> {
  const rows = await prisma.ticket.findMany({
    where: {
      deletedAt: null,
      ...(filters.status ? { status: filters.status } : null),
      ...(filters.assignedTo ? { assignedTo: filters.assignedTo } : null),
      ...(filters.createdBy ? { createdBy: filters.createdBy } : null),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return rows.map((r) => ticketFromRow(r));
}

export async function createTicketDb(data: Ticket): Promise<Ticket> {
  const max = await prisma.ticket.aggregate({ _max: { ticketNumber: true } });
  // Prisma returns BigInt for BIGINT aggregates — convert before arithmetic.
  const ticketNumber = Number(max._max.ticketNumber ?? 0) + 1;
  const row = await prisma.ticket.create({
    data: { id: data.id ?? randomUUID(), ...ticketRowData({ ...data, ticketNumber }) },
  });
  return ticketFromRow(row);
}

export async function updateTicketDb(id: string, data: Partial<Ticket>): Promise<Ticket | null> {
  // SAFETY: `data` comes from the validated request path and only carries
  // Ticket-shaped fields; spreading it fills the optional fields with defaults.
  const row = await prisma.ticket.update({ where: { id }, data: ticketRowData({ ...data } as Ticket) }).catch(() => null);
  return row ? ticketFromRow(row) : null;
}

export async function softDeleteTicketDb(id: string, deletedAt: number, updatedAt: number): Promise<boolean> {
  const res = await prisma.ticket
    .update({ where: { id }, data: { deletedAt: BigInt(deletedAt), updatedAt: BigInt(updatedAt) } })
    .catch(() => null);
  return res != null;
}

export async function restoreTicketDb(id: string): Promise<boolean> {
  const row = await prisma.ticket.findUnique({ where: { id } }).catch(() => null);
  if (!row || row.deletedAt == null) return false;
  const res = await prisma.ticket.update({ where: { id }, data: { deletedAt: null, updatedAt: BigInt(Date.now()) } }).catch(() => null);
  if (res) {
    try {
      await getAdminFirestore()
        .collection('tickets')
        .doc(id)
        .update({ deletedAt: null, updatedAt: Number(res.updatedAt) });
    } catch {}
  }
  return res != null;
}

export async function getTicketByIdDb(id: string): Promise<Ticket | null> {
  const row = await prisma.ticket.findUnique({ where: { id } }).catch(() => null);
  return row ? ticketFromRow(row) : null;
}

export async function listDeletedTicketsDb(limit = 100): Promise<Ticket[]> {
  const rows = await prisma.ticket.findMany({ where: { deletedAt: { not: null } }, orderBy: { deletedAt: 'desc' }, take: limit });
  return rows.map((r) => ticketFromRow(r));
}

// ---- Best-effort Firestore mirrors (rollback only) ----

export async function mirrorTicketCreated(doc: Ticket): Promise<void> {
  try {
    const { deletedAt: _deletedAt, ...rest } = doc;
    // SAFETY: created tickets are always persisted with a generated cuid id.
    await getAdminFirestore()
      .collection('tickets')
      .doc(doc.id as string)
      .set(rest);
  } catch (e) {
    logWarn('[tickets] Firestore mirror create failed', { id: doc.id, error: String(e) });
  }
}

export async function mirrorTicketUpdated(id: string, data: Partial<Ticket>): Promise<void> {
  try {
    const { id: _id, deletedAt, ...rest } = data;
    await getAdminFirestore().collection('tickets').doc(id).update(rest);
    void deletedAt;
  } catch (e) {
    logWarn('[tickets] Firestore mirror update failed', { id, error: String(e) });
  }
}

export async function mirrorTicketDeleted(id: string, deletedAt: number, updatedAt: number): Promise<void> {
  try {
    await getAdminFirestore().collection('tickets').doc(id).update({ deletedAt, updatedAt });
  } catch (e) {
    logWarn('[tickets] Firestore mirror delete failed', { id, error: String(e) });
  }
}
