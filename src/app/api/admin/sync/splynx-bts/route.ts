import { NextRequest } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { getAllActiveCustomers, getRouters, isSplynxConfigured, type SplynxCustomer, type SplynxRouter } from '@/lib/splynx-api';
import { getBtsForSplynxRouter, getBtsRegionFromSplynx, updateBtsMapping, type BtsSplynxMap } from '@/lib/splynx-bts-map';
import { success, unauthorized, tooMany, serverError, forbidden, validateOrigin } from '@/lib/api-response';
import { logError, logInfo, logWarn } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface BtsActiveStats {
  btsName: string;
  region: string;
  activeCustomers: number;
  totalCustomers: number;
  customersByTariff: Record<string, number>;
  lastSynced: number;
}

interface SyncResult {
  totalActiveCustomers: number;
  mappedCustomers: number;
  unmappedCustomers: number;
  btsStats: BtsActiveStats[];
  routerMapping: Record<string, string>;
  errors: string[];
}

function getRegionFromCity(city: string): string {
  const c = city.toLowerCase().trim();
  if (['ibadan', 'oriye', 'mowe', 'ibo', 'lagos'].includes(c)) return 'Oyo';
  if (['abeokuta', 'shagamu', 'ota', 'ijebu ode', 'orile imo', 'orile', 'sagamu'].includes(c)) return 'Ogun';
  if (['oshogbo', 'osogbo'].includes(c)) return 'Osun';
  if (['akure'].includes(c)) return 'Ondo';
  return 'Oyo';
}

export async function POST(request: NextRequest) {
  try {
    if (isRateLimited(request, 10, 60 * 60 * 1000)) {
      return tooMany();
    }

    if (!validateOrigin(request)) return forbidden();

    const authHeader = request.headers.get('authorization');
    const admin = await verifyAdminToken(authHeader);
    if (!admin) {
      return unauthorized();
    }

    if (!isSplynxConfigured()) {
      return serverError('Splynx API not configured. Set SPLYNX_API_HOST, SPLYNX_API_KEY, SPLYNX_API_SECRET');
    }

    const body = await request.json().catch(() => ({}));
    const { forceRefresh, updateMapping } = body;

    logInfo('[splynx-bts-sync] Starting sync', { admin: admin.email, forceRefresh, updateMapping });

    // Fetch data from Splynx
    const [customers, routers] = await Promise.all([getAllActiveCustomers(), getRouters()]);

    logInfo('[splynx-bts-sync] Fetched data', { customers: customers.length, routers: routers.length });

    // Build router lookup
    const routerMap = new Map<number, SplynxRouter>();
    for (const r of routers) routerMap.set(r.id, r);

    // Update mapping if provided
    if (updateMapping && Array.isArray(updateMapping)) {
      updateBtsMapping(updateMapping);
    }

    // Process customers
    const btsStatsMap = new Map<string, BtsActiveStats>();
    const routerMapping: Record<string, string> = {};
    const errors: string[] = [];
    let mappedCount = 0;
    let unmappedCount = 0;

    for (const customer of customers) {
      const routerId = customer.router_id;
      const routerName = customer.router_name || routerMap.get(routerId)?.name;

      const btsName = getBtsForSplynxRouter(routerId, routerName);
      const region = getBtsRegionFromSplynx(routerId, routerName) || getRegionFromCity(customer.city || '');

      if (btsName) {
        mappedCount++;
        if (routerId && !routerMapping[String(routerId)]) {
          routerMapping[String(routerId)] = btsName;
        }
      } else {
        unmappedCount++;
        if (routerId && !routerMapping[String(routerId)]) {
          routerMapping[String(routerId)] = `UNMAPPED (${routerName || 'unknown'})`;
        }
      }

      // Aggregate stats
      const key = btsName || `UNMAPPED:${routerName || routerId || 'unknown'}`;
      const existing = btsStatsMap.get(key) || {
        btsName: key,
        region,
        activeCustomers: 0,
        totalCustomers: 0,
        customersByTariff: {},
        lastSynced: Date.now(),
      };

      existing.activeCustomers += 1;
      existing.totalCustomers += 1;
      existing.customersByTariff[customer.tariff_name || 'Unknown'] =
        (existing.customersByTariff[customer.tariff_name || 'Unknown'] || 0) + 1;
      existing.lastSynced = Date.now();

      btsStatsMap.set(key, existing);
    }

    const btsStats = Array.from(btsStatsMap.values()).sort((a, b) => b.activeCustomers - a.activeCustomers);

    const result: SyncResult = {
      totalActiveCustomers: customers.length,
      mappedCustomers: mappedCount,
      unmappedCustomers: unmappedCount,
      btsStats,
      routerMapping,
      errors,
    };

    // Save to Firestore
    const db = getAdminFirestore();
    const batch = db.batch();

    const syncDocRef = db.collection('splynx_bts_sync').doc('latest');
    batch.set(syncDocRef, {
      ...result,
      syncedAt: Date.now(),
      syncedBy: admin.email,
    });

    // Also save individual BTS stats for querying
    for (const stat of btsStats) {
      const statRef = db.collection('splynx_bts_active_stats').doc(stat.btsName);
      batch.set(statRef, stat);
    }

    await batch.commit();

    logInfo('[splynx-bts-sync] Sync complete', {
      total: customers.length,
      mapped: mappedCount,
      unmapped: unmappedCount,
      btsCount: btsStats.length,
    });

    return success(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[splynx-bts-sync] Error', { error: message });
    return serverError(message);
  }
}

export async function GET(request: NextRequest) {
  try {
    if (isRateLimited(request, 60, 60 * 1000)) {
      return tooMany();
    }

    const authHeader = request.headers.get('authorization');
    const admin = await verifyAdminToken(authHeader);
    if (!admin) {
      return unauthorized();
    }

    const db = getAdminFirestore();
    const snapshot = await db.collection('splynx_bts_active_stats').orderBy('activeCustomers', 'desc').get();

    const stats = snapshot.docs.map((doc) => doc.data());

    return success({ stats, count: stats.length, lastUpdated: Date.now() });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[splynx-bts-sync] GET error', { error: message });
    return serverError(message);
  }
}
