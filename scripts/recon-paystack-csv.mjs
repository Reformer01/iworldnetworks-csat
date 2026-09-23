/**
 * Paystack-export vs Splynx-mirror reconciliation.
 * Usage: node scripts/recon-paystack-csv.mjs <paystack.csv> <mirror.csv>
 * mirror.csv columns: reference,email,amountNaira,paidAt[,channel]
 * Exits 0 with a match report on stdout (JSON).
 *
 * No dependencies — runs anywhere with node.
 */
import fs from 'fs';

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let inQ = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQ) {
      if (c === '"') {
        if (src[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.length > 1 || (r[0] ?? '').trim() !== '');
}

const normRef = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const normEmail = (v) => String(v ?? '').trim().toLowerCase();
const num = (v) => {
  if (v == null) return NaN;
  const n = Number(String(v).replace(/[₦,\s]/g, ''));
  return Number.isFinite(n) ? n : NaN;
};
const dayOf = (v) => {
  const cleaned = String(v ?? '').replace(/(\d+)(st|nd|rd|th)/gi, '$1');
  const d = new Date(cleaned);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

function colIdx(header, names) {
  const h = header.map((x) => x.trim().toLowerCase());
  for (const n of names) {
    const i = h.findIndex((x) => x === n || x.includes(n));
    if (i >= 0) return i;
  }
  return -1;
}

function loadPaystack(path) {
  const [header, ...lines] = parseCSV(fs.readFileSync(path, 'utf8'));
  const iRef = colIdx(header, ['reference', 'trxref', 'txnref']);
  const iEmail = colIdx(header, ['customer email', 'email']);
  const iAmt = colIdx(header, ['amount']);
  const iStatus = colIdx(header, ['status']);
  const iDate = colIdx(header, ['paid at', 'paidat', 'transaction date', 'date']);
  const iChannel = colIdx(header, ['channel']);
  if (iRef < 0 || iAmt < 0) throw new Error('Paystack CSV needs at least reference + amount columns. Headers: ' + header.join('|'));
  return lines.map((r) => {
    let amount = num(r[iAmt]);
    // kobo auto-detect: Paystack exports kobo; values > 10M naira-equivalent are kobo
    const asNaira = amount > 10000000 ? amount / 100 : amount;
    return {
      reference: normRef(r[iRef]),
      email: iEmail >= 0 ? normEmail(r[iEmail]) : '',
      amountNaira: Math.round(asNaira * 100) / 100,
      rawAmount: amount,
      koboSuspect: amount > 10000000,
      status: iStatus >= 0 ? String(r[iStatus]).trim().toLowerCase() : '',
      day: iDate >= 0 ? dayOf(r[iDate]) : null,
      channel: iChannel >= 0 ? String(r[iChannel]).trim().toLowerCase() : '',
    };
  }).filter((x) => x.reference);
}

function loadMirror(path) {
  const [header, ...lines] = parseCSV(fs.readFileSync(path, 'utf8'));
  const iRef = colIdx(header, ['reference']);
  const iEmail = colIdx(header, ['email']);
  const iAmt = colIdx(header, ['amountnaira', 'amount']);
  const iDate = colIdx(header, ['paidat', 'date']);
  if (iRef < 0 || iAmt < 0) throw new Error('Mirror CSV needs reference + amountNaira columns.');
  return lines.map((r) => ({
    reference: normRef(r[iRef]),
    email: iEmail >= 0 ? normEmail(r[iEmail]) : '',
    amountNaira: num(r[iAmt]),
    day: iDate >= 0 ? dayOf(r[iDate]) : null,
  })).filter((x) => x.reference);
}

const [,, payPath, mirPath] = process.argv;
if (!payPath || !mirPath) {
  console.error('Usage: node scripts/recon-paystack-csv.mjs <paystack.csv> <mirror.csv>');
  process.exit(2);
}

const pay = loadPaystack(payPath);
const mir = loadMirror(mirPath);
const byRef = new Map(mir.map((m) => [m.reference, m]));
const byEmailAmt = new Map();
for (const m of mir) {
  if (!m.email) continue;
  const k = `${m.email}|${m.amountNaira.toFixed(2)}`;
  if (!byEmailAmt.has(k)) byEmailAmt.set(k, []);
  byEmailAmt.get(k).push(m);
}

const success = pay.filter((p) => !p.status || p.status === 'success');
const seen = new Set();
let matchedRef = 0, matchedEmailAmt = 0;
const paystackOnly = [];
for (const p of success) {
  if (byRef.has(p.reference)) { matchedRef++; seen.add(p.reference); continue; }
  const cands = p.email ? (byEmailAmt.get(`${p.email}|${p.amountNaira.toFixed(2)}`) ?? []) : [];
  if (cands.length) { matchedEmailAmt++; cands.forEach((c) => seen.add(c.reference)); continue; }
  paystackOnly.push(p);
}
const mirrorOnly = mir.filter((m) => !seen.has(m.reference));
const sum = (a, f) => Math.round(a.reduce((s, x) => s + f(x), 0) * 100) / 100;

console.log(JSON.stringify({
  paystackRows: pay.length,
  successfulRows: success.length,
  koboSuspectRows: pay.filter((p) => p.koboSuspect).length,
  mirrorRows: mir.length,
  matchedByReference: matchedRef,
  matchedByEmailAmount: matchedEmailAmt,
  paystackOnlyCount: paystackOnly.length,
  paystackOnlyNaira: sum(paystackOnly, (p) => p.amountNaira),
  mirrorOnlyCount: mirrorOnly.length,
  mirrorOnlyNaira: sum(mirrorOnly, (m) => m.amountNaira || 0),
  paystackOnlyTop: paystackOnly.sort((a, b) => b.amountNaira - a.amountNaira).slice(0, 15)
    .map((p) => ({ reference: p.reference, email: p.email, amountNaira: p.amountNaira, day: p.day, channel: p.channel })),
  mirrorOnlyTop: mirrorOnly.sort((a, b) => (b.amountNaira || 0) - (a.amountNaira || 0)).slice(0, 15)
    .map((m) => ({ reference: m.reference, email: m.email, amountNaira: m.amountNaira, day: m.day })),
}, null, 1));
