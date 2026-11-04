import { settlement } from './tour-money';

// Sales report: one row per counted booking, grouped three ways. Every grouping and the CSV are built from the SAME rows, so they sum to the same totals.
// Gross = what the guest was charged (after discounts, including tax). Discounts is shown for information (already out of gross).
// Net = gross - refunds. Commission uses the same rule as channel statements: rounded basis points of (total - refunded).
export const COUNTED_STATUSES = ['confirmed', 'checked_in', 'completed', 'no_show', 'refunded', 'partially_refunded'];
export type ReportRow = { day: string; ref: string; bookedAt: string; departureAt: string; tour: string; channel: string; source: string; status: string; guests: number; grossCents: number; discountCents: number; refundedCents: number; commissionCents: number };
export type Totals = { bookings: number; cancelled: number; guests: number; grossCents: number; discountCents: number; refundedCents: number; netCents: number; commissionCents: number };
export type Group = Totals & { name: string };

export function commissionFor(b: { totalCents: number; refundedCents: number; channelCommissionCents: number; hasChannel: boolean }) {
  if (!b.hasChannel || !b.totalCents) return 0;
  const bps = Math.min(10000, Math.round(b.channelCommissionCents * 10000 / b.totalCents));
  return settlement(Math.max(0, b.totalCents - b.refundedCents), bps).commissionCents;
}
const empty = (): Totals => ({ bookings: 0, cancelled: 0, guests: 0, grossCents: 0, discountCents: 0, refundedCents: 0, netCents: 0, commissionCents: 0 });
function add(t: Totals, r: ReportRow) {
  t.bookings += 1; if (isCancelled(r.status)) t.cancelled += 1; t.guests += r.guests; t.grossCents += r.grossCents; t.discountCents += r.discountCents; t.refundedCents += r.refundedCents; t.netCents += r.grossCents - r.refundedCents; t.commissionCents += r.commissionCents;
}
// A booking that was sold and then cancelled or fully refunded. Bookings closed by a weather rebook or a rebook credit are moves, not
// losses, and never reach the report (the replacement is counted instead).
export const isCancelled = (status: string) => status === 'cancelled' || status === 'refunded';
export const cancellationBps = (t: { bookings: number; cancelled: number }) => (t.bookings ? Math.round(t.cancelled * 10000 / t.bookings) : 0);

// Weeks start on Monday. `day` is the local calendar day (YYYY-MM-DD) of the report basis, so a week never depends on the server zone.
export function weekStart(day: string) {
  const d = new Date(`${day}T12:00:00Z`); const back = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - back * 86400000).toISOString().slice(0, 10);
}
export type Week = { week: string; bookings: number; netCents: number };
export function weeklyTrend(rows: ReportRow[], from: string, to: string): Week[] {
  const by = new Map<string, Week>();
  for (let w = weekStart(from); w <= to; w = new Date(new Date(`${w}T12:00:00Z`).getTime() + 7 * 86400000).toISOString().slice(0, 10)) by.set(w, { week: w, bookings: 0, netCents: 0 });
  for (const r of rows) { const w = by.get(weekStart(r.day)); if (w) { w.bookings += 1; w.netCents += r.grossCents - r.refundedCents; } }
  return [...by.values()];
}

// Occupancy: seats sold against capacity for departures in the range that are still running (cancelled departures have no capacity to fill).
export type OccDeparture = { id: string; startAt: string; tour: string; capacity: number; seats: number };
export type Occ = { name: string; departures: number; capacity: number; seats: number; bps: number };
const occBps = (seats: number, capacity: number) => (capacity ? Math.round(Math.min(seats, capacity) * 10000 / capacity) : 0);
export function occupancy(deps: OccDeparture[]) {
  const by = new Map<string, Occ>(); const total: Occ = { name: 'All tours', departures: 0, capacity: 0, seats: 0, bps: 0 };
  for (const d of deps) for (const o of [total, by.get(d.tour) || (by.set(d.tour, { name: d.tour, departures: 0, capacity: 0, seats: 0, bps: 0 }), by.get(d.tour)!)]) { o.departures += 1; o.capacity += d.capacity; o.seats += d.seats; }
  const byTour = [...by.values()].map(o => ({ ...o, bps: occBps(o.seats, o.capacity) })).sort((a, b) => b.bps - a.bps || a.name.localeCompare(b.name));
  return { total: { ...total, bps: occBps(total.seats, total.capacity) }, byTour, departures: deps.map(d => ({ ...d, bps: occBps(d.seats, d.capacity) })) };
}

export function summarize(rows: ReportRow[]) {
  const totals = empty(); const maps = { tour: new Map<string, Group>(), channel: new Map<string, Group>(), source: new Map<string, Group>() };
  for (const r of rows) {
    add(totals, r);
    for (const k of ['tour', 'channel', 'source'] as const) { const name = r[k]; if (!maps[k].has(name)) maps[k].set(name, { name, ...empty() }); add(maps[k].get(name)!, r); }
  }
  const sorted = (m: Map<string, Group>) => [...m.values()].sort((a, b) => b.grossCents - a.grossCents || a.name.localeCompare(b.name));
  return { totals: { ...totals, cancellationBps: cancellationBps(totals) }, byTour: sorted(maps.tour), byChannel: sorted(maps.channel), bySource: sorted(maps.source) };
}

// Spreadsheet formula injection: a text cell that starts with = + - @ tab or CR is prefixed with an apostrophe. Numbers are written
// from non-negative integer cents, so they never start with a sign.
export function csvText(value: unknown) {
  let s = String(value ?? '').replace(/\r?\n/g, ' ');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const dollars = (cents: number) => { if (!Number.isInteger(cents) || cents < 0) throw new Error('Report amounts must be non-negative whole cents'); return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`; };
const HEAD = ['Booking', 'Booked', 'Departure', 'Tour', 'Channel', 'Source', 'Status', 'Guests', 'Gross', 'Discounts', 'Refunds', 'Net', 'Channel commission'];
export function salesCsv(rows: ReportRow[]) {
  const t = summarize(rows).totals; const lines = [HEAD.join(',')];
  for (const r of rows) lines.push([csvText(r.ref), csvText(r.bookedAt), csvText(r.departureAt), csvText(r.tour), csvText(r.channel), csvText(r.source), csvText(r.status), r.guests, dollars(r.grossCents), dollars(r.discountCents), dollars(r.refundedCents), dollars(r.grossCents - r.refundedCents), dollars(r.commissionCents)].join(','));
  lines.push(['TOTAL', '', '', '', '', '', `${t.bookings} bookings; ${t.cancelled} cancelled`, t.guests, dollars(t.grossCents), dollars(t.discountCents), dollars(t.refundedCents), dollars(t.netCents), dollars(t.commissionCents)].join(','));
  return lines.join('\r\n') + '\r\n';
}
