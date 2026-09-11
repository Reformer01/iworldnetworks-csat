/**
 * Diagnostic: what does the UISP Subscribers view actually contain?
 * Uses the same uispFetch as production sync.
 */
import { config } from 'dotenv';
config({ path: ['.env', '.env.production'] });

async function main() {
  const { uispFetch } = await import('../src/lib/uisp-api');

  const allSites = await uispFetch<Array<Record<string, unknown>>>('/sites?type=endpoint');
  console.log('endpoint sites:', allSites.length);

  const noUcrm = allSites.filter((s) => !s.ucrmId && !(s.description as Record<string, unknown> | undefined)?.ucrmId).length;
  console.log('endpoints WITHOUT ucrm link:', noUcrm, '/', allSites.length);

  const idents = allSites.map((s) => (s.identification ?? {}) as Record<string, unknown>);
  const byStatus: Record<string, number> = {};
  for (const i of idents) byStatus[String(i.status ?? 'null')] = (byStatus[i.status ? String(i.status) : 'null'] ?? 0) + 1;
  console.log('endpoint status:', JSON.stringify(byStatus));

  console.log('sample keys:', Object.keys(allSites[0] ?? {}).join(','));
  const desc = (allSites[0]?.description ?? {}) as Record<string, unknown>;
  console.log('description keys:', Object.keys(desc).join(','));
  console.log('sample:', JSON.stringify(allSites[0]).slice(0, 700));

  // Devices: how many stations, and do they carry site links?
  const devices = await uispFetch<Array<Record<string, unknown>>>('/devices');
  const roles: Record<string, number> = {};
  for (const d of devices) {
    const ident = (d.identification ?? {}) as Record<string, unknown>;
    const k = String(ident.role ?? 'null');
    roles[k] = (roles[k] ?? 0) + 1;
  }
  console.log('devices total:', devices.length, JSON.stringify(roles));

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
