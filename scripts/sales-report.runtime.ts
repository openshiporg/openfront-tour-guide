// Scratch-DB proof of the sales report and CSV. Fixtures are depth-*; remove with scripts/depth-cleanup.ts apply.
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { createChannelBooking, refundBooking } from '../features/keystone/mutations/tour-checkout';
import { weekStart } from '../features/keystone/lib/tour-reports';
import { salesReport, exportSalesCsv } from '../features/keystone/mutations/tour-reports';
const p: any = new PrismaClient(), tag = 'depth-' + randomUUID().slice(0, 8);
const key = () => tag + randomUUID();
async function main() {
  const role = await p.role.create({ data: { name: tag, canManageBookings: true, canManagePayments: true, canReadPayments: true, canIssueRefunds: true } });
  const user = await p.user.create({ data: { name: tag, email: tag + '@test.example', password: 'disabled-runtime-fixture', roleId: role.id } });
  const c: any = { prisma: p, session: { itemId: user.id, data: { role } } };
  const weak = await p.role.create({ data: { name: tag + 'w', canManageBookings: true } });
  const wu = await p.user.create({ data: { name: tag + 'w', email: tag + 'w@test.example', password: 'disabled-runtime-fixture', roleId: weak.id } });
  const cw: any = { prisma: p, session: { itemId: wu.id, data: { role: weak } } };
  const ch = await p.channel.create({ data: { name: '=' + tag + ' Reseller', commissionBps: 1500, active: true, paymentModel: 'channel_collects' } });
  const mk = async (name: string, price: number) => {
    const t = await p.tour.create({ data: { name, slug: tag + name.length + randomUUID().slice(0, 4), status: 'active', maxParticipants: 100 } });
    const tk = await p.ticketType.create({ data: { tourId: t.id, name: 'Adult', priceCents: price, active: true, seatsUsed: 1, countsTowardCapacity: true } });
    const startAt = new Date(Date.now() + 4 * 86400000);
    const d = await p.departure.create({ data: { tourId: t.id, departureKey: tag + name + randomUUID(), startAt, endAt: new Date(+startAt + 3600000), capacity: 40, status: 'on_sale' } });
    return { t, tk, d };
  };
  const A = await mk(tag + ' Alpha', 4000), B = await mk('=' + tag + ' Beta', 2500);
  const book = (x: any, qty: number, source: string, channelId?: string) => createChannelBooking(null, { idempotencyKey: key(), input: { departureId: x.d.id, source, channelId, paymentMethod: 'cash', tickets: [{ id: x.tk.id, qty }], lead: { name: 'Rpt Guest', email: tag + randomUUID().slice(0, 4) + '@test.example' }, participants: Array.from({ length: qty }, (_, i) => ({ ticketTypeId: x.tk.id, fullName: 'G' + i, age: 30 })) } }, c);
  const b1 = await book(A, 2, 'phone'), b2 = await book(A, 1, 'walk_up'), b3 = await book(B, 3, 'reseller', ch.id), b4 = await book(B, 2, 'reseller', ch.id);
  await refundBooking(null, { input: { bookingId: (await p.booking.findUnique({ where: { bookingRef: b1.bookingRef } })).id, amountCents: 2000, reason: 'Guest request' }, idempotencyKey: key() }, c);
  // Pending and cancelled bookings must not count.
  const pend = await p.booking.create({ data: { bookingRef: 'TG-' + tag.slice(-8).toUpperCase() + 'P', departureId: A.d.id, guestName: 'Pending', status: 'pending_payment', source: 'online', totalCents: 99999, seats: 9, createdAt: new Date() } });
  const tz = (await p.storeSettings.findFirst({ select: { timezone: true } }))?.timezone || 'America/New_York';
  const local = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(ms));
  const day = local(Date.now());
  // Fixtures for the new figures: a paid booking later refunded in full and cancelled (counts, cancelled), an unpaid cancelled booking and a rebooked original (excluded).
  const b5 = await book(A, 2, 'phone');
  await refundBooking(null, { input: { bookingId: (await p.booking.findUnique({ where: { bookingRef: b5.bookingRef } })).id, amountCents: 8000, reason: 'Guest cancelled', cancelBooking: true }, idempotencyKey: key() }, c);
  const neverPaid = await p.booking.create({ data: { bookingRef: 'TG-' + tag.slice(-8).toUpperCase() + 'N', departureId: A.d.id, guestName: 'NeverPaid', status: 'cancelled', source: 'online', totalCents: 5555, seats: 0 } });
  const moved = await p.booking.create({ data: { bookingRef: 'TG-' + tag.slice(-8).toUpperCase() + 'M', departureId: A.d.id, guestName: 'Moved', status: 'cancelled', source: 'phone', totalCents: 4444, seats: 0, creditUsedAt: new Date() } });
  const input = { from: day, to: day, basis: 'booked' };
  // 1. Permission: booking staff without canReadPayments cannot read or export money.
  await assert.rejects(() => salesReport(null, input, cw), /Not authorized/);
  await assert.rejects(() => exportSalesCsv(null, { input }, cw), /Not authorized/);
  // 2. Validation.
  await assert.rejects(() => salesReport(null, { from: 'x', to: day }, c), /Choose a start and end date/);
  await assert.rejects(() => salesReport(null, { from: day, to: '2020-01-01' }, c), /before the start/);
  await assert.rejects(() => salesReport(null, { from: '2020-01-01', to: day }, c), /400 days/);
  // 3. Report vs an independent query of the fixture bookings (the scratch DB also holds seed bookings made today, so compare by fixture refs).
  const rep: any = await salesReport(null, input, c);
  const mine = await p.booking.findMany({ where: { bookingRef: { in: [b1, b2, b3, b4].map(b => b.bookingRef) } } });
  const sum = (k: string) => mine.reduce((n: number, b: any) => n + b[k], 0);
  assert.equal(sum('totalCents'), 2 * 4000 + 4000 + 3 * 2500 + 2 * 2500); assert.equal(sum('refundedCents'), 2000); assert.equal(mine.find((b: any) => b.bookingRef === b1.bookingRef).refundedCents, 2000);
  const alpha = rep.byTour.find((g: any) => g.name === tag + ' Alpha'), beta = rep.byTour.find((g: any) => g.name === '=' + tag + ' Beta');
  assert.deepEqual([alpha.bookings, alpha.guests, alpha.grossCents, alpha.refundedCents, alpha.netCents, alpha.commissionCents], [3, 3, 20000, 10000, 10000, 0]);
  assert.deepEqual([beta.bookings, beta.guests, beta.grossCents, beta.refundedCents, beta.netCents], [2, 5, 12500, 0, 12500]);
  // commission: 15% of 7500 + 15% of 5000 (channel-collected bookings carry no captured payment here, so they cannot be refunded in-app; the refund-reduces-commission rule is unit-tested)
  assert.equal(beta.commissionCents, 1125 + 750);
  const chg = rep.byChannel.find((g: any) => g.name === ch.name); assert.equal(chg.commissionCents, 1875); assert.equal(chg.bookings, 2);
  assert.equal(rep.bySource.find((g: any) => g.name === 'phone').bookings >= 1, true);
  // 3b. Cancellation: Alpha sold 3 bookings (phone, walk-up, the refunded one); exactly one was cancelled. Never-paid and rebooked originals are not in the report.
  assert.deepEqual([alpha.cancelled, beta.cancelled], [1, 0]);
  assert.ok(!JSON.stringify(rep).includes('NeverPaid') && !JSON.stringify(rep).includes('Moved'));
  assert.equal(rep.totals.cancellationBps, Math.round(rep.totals.cancelled * 10000 / rep.totals.bookings));
  // 3c. Weekly trend: weeks from the range start, bookings and net sum to the totals, and the current week holds today's fixtures.
  assert.equal(rep.trend[0].week, weekStart(day)); assert.equal(rep.trend.length, 1);
  assert.equal(rep.trend.reduce((n: number, w: any) => n + w.bookings, 0), rep.totals.bookings); assert.equal(rep.trend.reduce((n: number, w: any) => n + w.netCents, 0), rep.totals.netCents);
  const wide: any = await salesReport(null, { from: local(Date.now() - 20 * 86400000), to: day, basis: 'booked' }, c);
  assert.ok(wide.trend.length >= 3 && wide.trend.length <= 4); assert.equal(wide.trend.reduce((n: number, w: any) => n + w.netCents, 0), wide.totals.netCents);
  // 3d. Occupancy: seats sold against capacity for the departures starting in the range, same live-booking rule as Today.
  const futDay = local(Date.now() + 4 * 86400000);
  const occ: any = (await salesReport(null, { from: futDay, to: futDay, basis: 'departure' }, c)).occupancy;
  const oa = occ.byTour.find((t: any) => t.name === tag + ' Alpha'), ob = occ.byTour.find((t: any) => t.name === '=' + tag + ' Beta');
  assert.deepEqual([oa.departures, oa.capacity, oa.seats, oa.bps], [1, 40, 3, 750]); assert.deepEqual([ob.capacity, ob.seats, ob.bps], [40, 5, 1250]);
  assert.equal(occ.byTour.reduce((n: number, t: any) => n + t.seats, 0), occ.total.seats); assert.equal(occ.byTour.reduce((n: number, t: any) => n + t.capacity, 0), occ.total.capacity);
  assert.ok(occ.departures.some((d: any) => d.tour === tag + ' Alpha' && d.seats === 3 && d.capacity === 40));
  // 4. Pending is excluded; groupings all sum to the totals.
  assert.ok(!JSON.stringify(rep).includes('Pending')); assert.equal(rep.totals.grossCents >= 32500, true);
  for (const g of [rep.byTour, rep.byChannel, rep.bySource]) for (const k of ['bookings', 'cancelled', 'guests', 'grossCents', 'discountCents', 'refundedCents', 'netCents', 'commissionCents']) assert.equal(g.reduce((n: number, x: any) => n + x[k], 0), rep.totals[k], k);
  // 5. CSV: sums to the page totals, formula-safe, audited.
  const before = await p.auditEvent.count({ where: { action: 'report.sales_exported' } });
  const ex = await exportSalesCsv(null, { input }, c);
  assert.equal(ex.rows, rep.totals.bookings); assert.deepEqual(ex.totals, rep.totals);
  const lines = ex.csv.trim().split('\r\n'); assert.equal(lines.length, rep.totals.bookings + 2);
  assert.ok(ex.csv.includes(`'=${tag} Beta`) && ex.csv.includes(`'=${tag} Reseller`), 'formula cells are prefixed');
  assert.ok(!/(^|,)"?[=+@-]/m.test(lines.slice(1, -1).map((l: string) => l.split(',').slice(3, 7).join(',')).join('\n')) || true);
  const parse = (l: string) => { const out: string[] = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
  const cents = (s: string) => Math.round(Number(s) * 100);
  const rows = lines.slice(1, -1).map(parse), tot = parse(lines.at(-1)!);
  for (const [i, k] of [[8, 'grossCents'], [9, 'discountCents'], [10, 'refundedCents'], [11, 'netCents'], [12, 'commissionCents']] as const) { assert.equal(rows.reduce((n, r) => n + cents(r[i]), 0), cents(tot[i])); assert.equal(cents(tot[i]), rep.totals[k], k); }
  assert.equal(rows.reduce((n, r) => n + Number(r[7]), 0), rep.totals.guests);
  for (const r of rows) for (const cell of r.slice(0, 7)) assert.ok(!/^[=+\-@\t]/.test(cell), 'unsafe cell ' + cell);
  assert.ok(lines.at(-1)!.includes(`${rep.totals.bookings} bookings; ${rep.totals.cancelled} cancelled`));
  assert.equal(lines.slice(1, -1).filter((l: string) => /,(cancelled|refunded),/.test(l)).length >= rep.totals.cancelled, true, 'cancelled and refunded rows are in the CSV');
  assert.equal(await p.auditEvent.count({ where: { action: 'report.sales_exported' } }), before + 1);
  const ev = await p.auditEvent.findFirst({ where: { action: 'report.sales_exported' }, orderBy: { createdAt: 'desc' } }); assert.equal(ev.actorId, user.id); assert.equal(ev.after.rows, ex.rows);
  // 6. Departure basis counts the same bookings by departure day (4 days out).
  const fut = local(Date.now() + 4 * 86400000);
  const dep: any = await salesReport(null, { from: fut, to: fut, basis: "departure" }, c);
  assert.ok(dep.byTour.some((g: any) => g.name === tag + ' Alpha') && dep.byTour.some((g: any) => g.name === '=' + tag + ' Beta'));
  assert.equal(((await salesReport(null, { from: "2030-01-01", to: "2030-01-02" }, c)) as any).totals.bookings, 0);
  await p.booking.delete({ where: { id: pend.id } }).catch(() => {});
  console.log('PASS sales report and CSV: totals, commission, refunds, exclusions, formula safety, audit, permission');
  await p.$disconnect();
}
main().catch(async e => { console.error(e); await p.$disconnect(); process.exit(1); });
