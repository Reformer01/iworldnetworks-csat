import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifySupportToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { success, error, unauthorized, tooMany, serverError } from '@/lib/api-response';
import { logError, logInfo } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface SupportStaffKPI {
  staffId: string;
  staffName: string;
  role: string;
  periodStart: number;
  periodEnd: number;

  // Volume metrics
  ticketsAssigned: number;
  ticketsResolved: number;
  ticketsEscalated: number;
  ticketsReopened: number;
  ticketsClosed: number;

  // Time metrics (in hours)
  avgResolutionTimeHours: number;
  avgFirstResponseTimeHours: number;
  avgTimeToAssignHours: number;

  // Quality metrics
  slaComplianceRate: number; // percentage
  firstContactResolutionRate: number; // percentage
  customerSatisfactionScore: number; // 1-5 from feedback
  avgCustomerSatisfaction: number; // alias for client compatibility
  qualityScore: number; // 1-5 composite

  // SLA metrics
  slaBreaches: number;
  slaBreachRate: number; // percentage
  priority1Resolved: number;
  priority2Resolved: number;
  priority3Resolved: number;

  // Workload
  currentOpenTickets: number;
  avgDailyTickets: number;

  // Timestamps
  calculatedAt: number;
}

function calculatePeriodStart(period: 'weekly' | 'monthly' | 'quarterly'): number {
  const now = new Date();
  const start = new Date(now);

  switch (period) {
    case 'weekly':
      start.setDate(now.getDate() - 7);
      break;
    case 'monthly':
      start.setMonth(now.getMonth() - 1);
      break;
    case 'quarterly':
      start.setMonth(now.getMonth() - 3);
      break;
  }

  start.setHours(0, 0, 0, 0);
  return start.getTime();
}

function getPeriodEnd(): number {
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  return now.getTime();
}

async function getStaffMembers(db: ReturnType<typeof getAdminFirestore>): Promise<Array<{ id: string; name: string; role: string }>> {
  try {
    // Get backend support staff from staff collection
    const staffSnapshot = await db
      .collection('staff')
      .where('department', '==', 'Support')
      .where('role', 'in', ['Back-end Support', 'Front-end Support', 'Technical'])
      .get();

    const staff: Array<{ id: string; name: string; role: string }> = [];

    staffSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      staff.push({
        id: doc.id,
        name: data.name,
        role: data.role,
      });
    });

    // If no staff in DB, use default list from staff.ts
    if (staff.length === 0) {
      const defaultStaff = [
        { id: 'backend-yusuf-femi', name: 'Yusuf Femi', role: 'Back-end Support' },
        { id: 'backend-ibrahim-gbadamosi', name: 'Ibrahim Gbadamosi', role: 'Back-end Support' },
        { id: 'backend-omotunde-olamide', name: 'Omotunde Olamide', role: 'Back-end Support' },
        { id: 'backend-tunji-adebayo', name: 'Tunji Adebayo', role: 'Back-end Support' },
      ];
      return defaultStaff;
    }

    return staff;
  } catch (err) {
    logError('[support-staff-metrics] getStaffMembers error', { error: String(err) });
    // Return default staff if query fails
    return [
      { id: 'backend-yusuf-femi', name: 'Yusuf Femi', role: 'Back-end Support' },
      { id: 'backend-ibrahim-gbadamosi', name: 'Ibrahim Gbadamosi', role: 'Back-end Support' },
      { id: 'backend-omotunde-olamide', name: 'Omotunde Olamide', role: 'Back-end Support' },
      { id: 'backend-tunji-adebayo', name: 'Tunji Adebayo', role: 'Back-end Support' },
    ];
  }
}

async function getTicketsForStaff(
  db: ReturnType<typeof getAdminFirestore>,
  staffId: string,
  periodStart: number,
  periodEnd: number,
): Promise<any[]> {
  try {
    const ticketsSnapshot = await db
      .collection('tickets')
      .where('assignedTo', '==', staffId)
      .where('createdAt', '>=', periodStart)
      .where('createdAt', '<=', periodEnd)
      .get();

    return ticketsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    logError('[support-staff-metrics] getTicketsForStaff error', { staffId, error: String(err) });
    return [];
  }
}

async function getFeedbackForStaff(
  db: ReturnType<typeof getAdminFirestore>,
  staffName: string,
  periodStart: number,
  periodEnd: number,
): Promise<any[]> {
  try {
    const feedbackSnapshot = await db
      .collection('feedbacks')
      .where('timestamp', '>=', periodStart)
      .where('timestamp', '<=', periodEnd)
      .where('category', '==', 'Support')
      .get();

    const feedbacks: any[] = [];
    feedbackSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      const staffNameValue = data.staffName;
      if (typeof staffNameValue === 'string' && staffNameValue.toLowerCase().includes(staffName.toLowerCase())) {
        feedbacks.push({ id: doc.id, ...data });
      }
    });

    return feedbacks;
  } catch (err) {
    logError('[support-staff-metrics] getFeedbackForStaff error', { staffName, error: String(err) });
    return [];
  }
}

function calculateKPIs(
  staff: { id: string; name: string; role: string },
  tickets: any[],
  feedbacks: any[],
  periodStart: number,
  periodEnd: number,
): SupportStaffKPI {
  const ticketsAssigned = tickets.length;
  const ticketsResolved = tickets.filter((t) => t.status === 'resolved').length;
  const ticketsClosed = tickets.filter((t) => t.status === 'closed').length;
  const ticketsEscalated = tickets.filter((t) => t.escalatedTo).length;
  const ticketsReopened = tickets.filter((t) => t.reopenedAt).length;

  // Time metrics (in hours)
  const resolvedTickets = tickets.filter((t) => t.resolvedAt && t.createdAt);
  const firstResponseTickets = tickets.filter((t) => t.assignedAt && t.createdAt);

  const avgResolutionTimeHours =
    resolvedTickets.length > 0
      ? resolvedTickets.reduce((sum, t) => sum + (t.resolvedAt - t.createdAt) / (1000 * 60 * 60), 0) / resolvedTickets.length
      : 0;

  const avgFirstResponseTimeHours =
    firstResponseTickets.length > 0
      ? firstResponseTickets.reduce((sum, t) => sum + (t.assignedAt - t.createdAt) / (1000 * 60 * 60), 0) / firstResponseTickets.length
      : 0;

  const assignedTickets = tickets.filter((t) => t.assignedAt && t.createdAt);
  const avgTimeToAssignHours =
    assignedTickets.length > 0
      ? assignedTickets.reduce((sum, t) => sum + (t.assignedAt - t.createdAt) / (1000 * 60 * 60), 0) / assignedTickets.length
      : 0;

  // SLA metrics
  const slaBreaches = tickets.filter((t) => t.slaBreached === true).length;
  const slaBreachRate = ticketsAssigned > 0 ? (slaBreaches / ticketsAssigned) * 100 : 0;
  const slaComplianceRate = 100 - slaBreachRate;

  // First contact resolution
  const fcrTickets = tickets.filter((t) => t.firstTimeFix === true);
  const firstContactResolutionRate = ticketsResolved > 0 ? (fcrTickets.length / ticketsResolved) * 100 : 0;

  // Customer satisfaction from feedback
  let customerSatisfactionScore = 0;
  let qualityScore = 0;

  if (feedbacks.length > 0) {
    const ratings = feedbacks.map((f) => f.ratings?.professionalism || 0).filter((r) => r > 0);
    if (ratings.length > 0) {
      customerSatisfactionScore = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
      qualityScore = customerSatisfactionScore;
    }
  }

  // Priority breakdown
  const priority1Resolved = tickets.filter((t) => t.priority === 1 && t.status === 'resolved').length;
  const priority2Resolved = tickets.filter((t) => t.priority === 2 && t.status === 'resolved').length;
  const priority3Resolved = tickets.filter((t) => t.priority === 3 && t.status === 'resolved').length;

  // Current workload
  const currentOpenTickets = tickets.filter((t) => t.status === 'open' || t.status === 'assigned' || t.status === 'in_progress').length;

  const daysInPeriod = (periodEnd - periodStart) / (1000 * 60 * 60 * 24);
  const avgDailyTickets = daysInPeriod > 0 ? ticketsAssigned / daysInPeriod : 0;

  return {
    staffId: staff.id,
    staffName: staff.name,
    role: staff.role,
    periodStart,
    periodEnd,

    ticketsAssigned,
    ticketsResolved,
    ticketsEscalated,
    ticketsReopened,
    ticketsClosed,

    avgResolutionTimeHours: Math.round(avgResolutionTimeHours * 100) / 100,
    avgFirstResponseTimeHours: Math.round(avgFirstResponseTimeHours * 100) / 100,
    avgTimeToAssignHours: Math.round(avgTimeToAssignHours * 100) / 100,

    slaComplianceRate: Math.round(slaComplianceRate * 100) / 100,
    firstContactResolutionRate: Math.round(firstContactResolutionRate * 100) / 100,
    customerSatisfactionScore: Math.round(customerSatisfactionScore * 10) / 10,
    avgCustomerSatisfaction: Math.round(customerSatisfactionScore * 10) / 10,
    qualityScore: Math.round(qualityScore * 10) / 10,

    slaBreaches,
    slaBreachRate: Math.round(slaBreachRate * 100) / 100,
    priority1Resolved,
    priority2Resolved,
    priority3Resolved,

    currentOpenTickets,
    avgDailyTickets: Math.round(avgDailyTickets * 100) / 100,

    calculatedAt: Date.now(),
  };
}

export async function GET(request: NextRequest) {
  try {
    if (isRateLimited(request, 60, 60 * 1000)) {
      return tooMany();
    }

    const authHeader = request.headers.get('authorization');
    const user = await verifySupportToken(authHeader);
    if (!user) {
      return unauthorized();
    }

    const { searchParams } = new URL(request.url);
    const period = (searchParams.get('period') as 'weekly' | 'monthly' | 'quarterly') || 'monthly';
    const staffId = searchParams.get('staffId');

    const periodStart = calculatePeriodStart(period);
    const periodEnd = getPeriodEnd();

    const db = getAdminFirestore();
    const staffMembers = await getStaffMembers(db);

    // Filter by staffId if provided
    const staffToProcess = staffId ? staffMembers.filter((s) => s.id === staffId) : staffMembers;

    const kpis: SupportStaffKPI[] = [];

    for (const staff of staffToProcess) {
      const tickets = await getTicketsForStaff(db, staff.id, periodStart, periodEnd);
      const feedbacks = await getFeedbackForStaff(db, staff.name, periodStart, periodEnd);

      const kpi = calculateKPIs(staff, tickets, feedbacks, periodStart, periodEnd);
      kpis.push(kpi);
    }

    // Calculate team aggregates
    const teamTotals = kpis.reduce(
      (acc, kpi) => ({
        totalTicketsAssigned: acc.totalTicketsAssigned + kpi.ticketsAssigned,
        totalTicketsResolved: acc.totalTicketsResolved + kpi.ticketsResolved,
        totalTicketsEscalated: acc.totalTicketsEscalated + kpi.ticketsEscalated,
        totalSlaBreaches: acc.totalSlaBreaches + kpi.slaBreaches,
        avgResolutionTime: acc.avgResolutionTime + kpi.avgResolutionTimeHours,
        avgSatisfaction: acc.avgSatisfaction + kpi.customerSatisfactionScore,
        avgFcr: acc.avgFcr + kpi.firstContactResolutionRate,
        totalOpenTickets: acc.totalOpenTickets + kpi.currentOpenTickets,
      }),
      {
        totalTicketsAssigned: 0,
        totalTicketsResolved: 0,
        totalTicketsEscalated: 0,
        totalSlaBreaches: 0,
        avgResolutionTime: 0,
        avgSatisfaction: 0,
        avgFcr: 0,
        totalOpenTickets: 0,
      },
    );

    const teamCount = kpis.length;
    const teamAverages = {
      avgResolutionTimeHours: Math.round((teamTotals.avgResolutionTime / teamCount) * 100) / 100,
      avgCustomerSatisfaction: Math.round((teamTotals.avgSatisfaction / teamCount) * 10) / 10,
      avgFirstContactResolutionRate: Math.round((teamTotals.avgFcr / teamCount) * 100) / 100,
      totalTicketsAssigned: teamTotals.totalTicketsAssigned,
      totalTicketsResolved: teamTotals.totalTicketsResolved,
      totalTicketsEscalated: teamTotals.totalTicketsEscalated,
      totalSlaBreaches: teamTotals.totalSlaBreaches,
      totalOpenTickets: teamTotals.totalOpenTickets,
    };

    return NextResponse.json({
      success: true,
      data: {
        period,
        periodStart,
        periodEnd,
        teamAverages,
        staffKPIs: kpis,
        calculatedAt: Date.now(),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[support-staff-metrics] GET error', { error: message });
    return serverError();
  }
}

export async function POST(request: NextRequest) {
  try {
    if (isRateLimited(request, 10, 60 * 1000)) {
      return tooMany();
    }

    const authHeader = request.headers.get('authorization');
    const user = await verifySupportToken(authHeader);
    if (!user) {
      return unauthorized();
    }

    const { searchParams } = new URL(request.url);
    const period = (searchParams.get('period') as 'weekly' | 'monthly' | 'quarterly') || 'monthly';

    const periodStart = calculatePeriodStart(period);
    const periodEnd = getPeriodEnd();

    const db = getAdminFirestore();
    const staffMembers = await getStaffMembers(db);

    const kpis: SupportStaffKPI[] = [];

    for (const staff of staffMembers) {
      const tickets = await getTicketsForStaff(db, staff.id, periodStart, periodEnd);
      const feedbacks = await getFeedbackForStaff(db, staff.name, periodStart, periodEnd);
      const kpi = calculateKPIs(staff, tickets, feedbacks, periodStart, periodEnd);
      kpis.push(kpi);
    }

    // Save KPI snapshot to Firestore
    const snapshotId = `${period}_${periodStart}`;
    const snapshotRef = db.collection('staff_kpi_snapshots').doc(snapshotId);
    await snapshotRef.set({
      period,
      periodStart,
      periodEnd,
      kpis,
      calculatedAt: Date.now(),
      calculatedBy: user.email,
    });

    // Also save individual staff KPI records for historical tracking
    const batch = db.batch();
    for (const kpi of kpis) {
      const kpiDocId = `${kpi.staffId}_${periodStart}`;
      const kpiRef = db.collection('staff_kpi_records').doc(kpiDocId);
      batch.set(kpiRef, kpi);
    }
    await batch.commit();

    logInfo('[support-staff-metrics] KPI snapshot saved', { period, staffCount: kpis.length });

    // Calculate team aggregates (same as GET)
    const teamTotals = kpis.reduce(
      (acc, kpi) => ({
        totalTicketsAssigned: acc.totalTicketsAssigned + kpi.ticketsAssigned,
        totalTicketsResolved: acc.totalTicketsResolved + kpi.ticketsResolved,
        totalTicketsEscalated: acc.totalTicketsEscalated + kpi.ticketsEscalated,
        totalSlaBreaches: acc.totalSlaBreaches + kpi.slaBreaches,
        avgResolutionTime: acc.avgResolutionTime + kpi.avgResolutionTimeHours,
        avgSatisfaction: acc.avgSatisfaction + kpi.customerSatisfactionScore,
        avgFcr: acc.avgFcr + kpi.firstContactResolutionRate,
        totalOpenTickets: acc.totalOpenTickets + kpi.currentOpenTickets,
      }),
      {
        totalTicketsAssigned: 0,
        totalTicketsResolved: 0,
        totalTicketsEscalated: 0,
        totalSlaBreaches: 0,
        avgResolutionTime: 0,
        avgSatisfaction: 0,
        avgFcr: 0,
        totalOpenTickets: 0,
      },
    );

    const teamCount = kpis.length;
    const teamAverages = {
      avgResolutionTimeHours: Math.round((teamTotals.avgResolutionTime / teamCount) * 100) / 100,
      avgCustomerSatisfaction: Math.round((teamTotals.avgSatisfaction / teamCount) * 10) / 10,
      avgFirstContactResolutionRate: Math.round((teamTotals.avgFcr / teamCount) * 100) / 100,
      totalTicketsAssigned: teamTotals.totalTicketsAssigned,
      totalTicketsResolved: teamTotals.totalTicketsResolved,
      totalTicketsEscalated: teamTotals.totalTicketsEscalated,
      totalSlaBreaches: teamTotals.totalSlaBreaches,
      totalOpenTickets: teamTotals.totalOpenTickets,
    };

    return NextResponse.json({
      success: true,
      data: {
        period,
        periodStart,
        periodEnd,
        teamAverages,
        staffKPIs: kpis,
        saved: true,
        snapshotId,
        calculatedAt: Date.now(),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[support-staff-metrics] POST error', { error: message });
    return serverError();
  }
}
