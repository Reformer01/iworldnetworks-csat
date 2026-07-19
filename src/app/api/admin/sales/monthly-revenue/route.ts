import { NextRequest } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { salesAgents, regionalTargets, SalesRegion, SalesSegment, SEGMENTS_THAT_ROLL_UP_TO_SME } from '@/lib/sales-staff';
import { success, unauthorized, tooMany, serverError } from '@/lib/api-response';
import { logError } from '@/lib/logger';

type RecordDoc = {
  id: string;
  month: string;
  region: SalesRegion;
  segment: SalesSegment;
  salesAgent: string;
  nrc: number;
  mrc: number;
  accountStatus: string;
  customerType: 'new' | 'revived';
};

interface MonthlyRevenueData {
  month: string;
  monthKey: string;
  revenue: number;
  nrcRevenue: number;
  mrr: number;
  newCustomers: number;
}

function getMonthKey(month: string): string {
  const idx = MONTH_ORDER.findIndex((m) => m.toLowerCase() === month.toLowerCase());
  return idx >= 0 ? String(idx).padStart(2, '0') : '99';
}

const MONTH_ORDER = [
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
];

function aggregateMonthlyData(records: RecordDoc[]): MonthlyRevenueData[] {
  const map = new Map<string, MonthlyRevenueData>();

  for (const r of records) {
    const month = r.month;
    if (!month) continue;

    const existing = map.get(month) || {
      month,
      monthKey: getMonthKey(month),
      revenue: 0,
      nrcRevenue: 0,
      mrr: 0,
      newCustomers: 0,
    };

    const revenue = (r.nrc || 0) + (r.mrc || 0);
    existing.revenue += revenue;
    existing.nrcRevenue += r.nrc || 0;
    existing.mrr += r.mrc || 0;

    if (r.customerType === 'new') existing.newCustomers += 1;

    map.set(month, existing);
  }

  return Array.from(map.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    if (isRateLimited(request, 120, 60 * 1000)) {
      return tooMany();
    }

    const authHeader = request.headers.get('authorization');
    const admin = await verifyAdminToken(authHeader);
    if (!admin) {
      return unauthorized();
    }

    const { searchParams } = new URL(request.url);
    const region = searchParams.get('region') as SalesRegion | null;
    const agent = searchParams.get('agent');

    const db = getAdminFirestore();
    const snapshot = await db.collection('sales_records').orderBy('serialNumber', 'desc').limit(5000).get();
    const records: RecordDoc[] = snapshot.docs
      .filter((doc) => !doc.data().deletedAt)
      .map((doc) => ({ id: doc.id, ...doc.data() }) as RecordDoc);

    // Filter by region if specified
    let filteredRecords = records;
    if (region) {
      filteredRecords = records.filter((r) => r.region === region);
    }
    // Filter by agent if specified
    if (agent) {
      filteredRecords = filteredRecords.filter((r) => r.salesAgent === agent);
    }

    // Overall monthly data
    const overallMonthly = aggregateMonthlyData(filteredRecords);

    // By region
    const regionsToProcess = region ? [region] : regionalTargets.map((rt) => rt.region);
    const regionMonthly = regionsToProcess.map((rt) => {
      const regionRecords = filteredRecords.filter((r) => r.region === rt);
      return {
        region: rt,
        monthlyData: aggregateMonthlyData(regionRecords),
      };
    });

    // By agent
    const agentsToProcess = agent ? salesAgents.filter((a) => a.name === agent) : salesAgents.filter((a) => !region || a.region === region);
    const agentMonthly = agentsToProcess.map((a) => {
      const agentRecords = filteredRecords.filter((r) => r.salesAgent === a.name);
      return {
        agent: a.name,
        region: a.region,
        monthlyData: aggregateMonthlyData(agentRecords),
      };
    });

    // By segment
    const segments: SalesSegment[] = ['HOME', 'SME', 'ENTERPRISE', 'NEIGHBOURHOOD', 'MANAGED_SERVICES'];
    const segmentMonthly = segments.map((seg) => {
      let segmentRecords = filteredRecords.filter((r) => r.segment === seg);
      if (seg === 'SME') {
        segmentRecords = filteredRecords.filter((r) => SEGMENTS_THAT_ROLL_UP_TO_SME.includes(r.segment));
      }
      return {
        segment: seg,
        monthlyData: aggregateMonthlyData(segmentRecords),
      };
    });

    return success({
      overallMonthly,
      regionMonthly,
      agentMonthly,
      segmentMonthly,
      monthOrder: MONTH_ORDER,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[sales-monthly-revenue] GET error', { error: message });
    return serverError();
  }
}
