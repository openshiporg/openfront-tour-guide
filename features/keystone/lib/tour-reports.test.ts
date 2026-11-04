import test from 'node:test';
import assert from 'node:assert/strict';
import { cancellationBps, commissionFor, csvText, dollars, occupancy, salesCsv, summarize, weekStart, weeklyTrend, type ReportRow } from './tour-reports';

const row = (o: Partial<ReportRow>): ReportRow => ({ day: '2026-11-02', ref: 'TG-1', bookedAt: '2026-11-01', departureAt: '2026-11-05', tour: 'Harbor', channel: 'Direct', source: 'phone', status: 'confirmed', guests: 2, grossCents: 10000, discountCents: 500, refundedCents: 0, commissionCents: 0, ...o });
const rows = [row({}), row({ ref: 'TG-2', tour: 'Dolphin', channel: 'Viator', source: 'reseller', grossCents: 8333, refundedCents: 3333, guests: 3, commissionCents: 500 }), row({ ref: 'TG-3', tour: 'Dolphin', channel: 'Viator', source: 'reseller', status: 'refunded', grossCents: 4000, refundedCents: 4000, guests: 1, discountCents: 0 })];

test('every grouping sums to the same totals', () => {
  const s = summarize(rows);
  for (const g of [s.byTour, s.byChannel, s.bySource]) for (const k of ['bookings', 'guests', 'grossCents', 'discountCents', 'refundedCents', 'netCents', 'commissionCents'] as const) assert.equal(g.reduce((n, x) => n + x[k], 0), s.totals[k]);
  assert.equal(s.totals.netCents, 10000 + 5000 + 0);
  assert.equal(s.totals.guests, 6);
});
test('commission follows the statement rule on the net of refunds', () => {
  assert.equal(commissionFor({ totalCents: 10000, refundedCents: 0, channelCommissionCents: 1500, hasChannel: true }), 1500);
  assert.equal(commissionFor({ totalCents: 10000, refundedCents: 4000, channelCommissionCents: 1500, hasChannel: true }), 900);
  assert.equal(commissionFor({ totalCents: 10000, refundedCents: 0, channelCommissionCents: 1500, hasChannel: false }), 0);
  assert.equal(commissionFor({ totalCents: 0, refundedCents: 0, channelCommissionCents: 0, hasChannel: true }), 0);
});
test('csv total row equals the page totals, to the cent', () => {
  const lines = salesCsv(rows).trim().split('\r\n'); const t = summarize(rows).totals;
  const cols = (l: string) => l.split(',');
  assert.equal(lines.length, rows.length + 2); assert.ok(lines.at(-1)!.includes('3 bookings; 1 cancelled'));
  const body = lines.slice(1, -1).map(cols); const total = cols(lines.at(-1)!);
  const cents = (s: string) => Math.round(Number(s) * 100);
  for (const [i, k] of [[8, 'grossCents'], [9, 'discountCents'], [10, 'refundedCents'], [11, 'netCents'], [12, 'commissionCents']] as const) {
    assert.equal(body.reduce((n, c) => n + cents(c[i]), 0), cents(total[i])); assert.equal(cents(total[i]), t[k]);
  }
});
test('csv text cells are formula-safe and quoted', () => {
  assert.equal(csvText('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  for (const s of ['+1', '-1', '@sum', '\tx']) assert.ok(csvText(s).startsWith(`'`));
  assert.equal(csvText('a,b'), '"a,b"'); assert.equal(csvText('line\nbreak'), 'line break'); assert.equal(csvText('Harbor'), 'Harbor');
  const csv = salesCsv([row({ tour: '=cmd|calc', channel: '@x' })]);
  assert.ok(csv.includes(`'=cmd|calc`) && csv.includes(`'@x`));
});
test('dollars refuses negative or fractional cents', () => {
  assert.equal(dollars(5), '0.05'); assert.equal(dollars(123456), '1234.56');
  assert.throws(() => dollars(-1)); assert.throws(() => dollars(1.5));
});

test('cancellation rate counts cancelled and fully refunded bookings over all sold bookings', () => {
  const rs = [row({}), row({ ref: 'b' }), row({ ref: 'c', status: 'cancelled', guests: 0 }), row({ ref: 'd', status: 'refunded', grossCents: 4000, refundedCents: 4000 })];
  const t = summarize(rs).totals as any;
  assert.equal(t.bookings, 4); assert.equal(t.cancelled, 2); assert.equal(t.cancellationBps, 5000);
  for (const g of [summarize(rs).byTour, summarize(rs).byChannel, summarize(rs).bySource]) assert.equal(g.reduce((n, x) => n + x.cancelled, 0), 2);
  assert.equal(cancellationBps({ bookings: 0, cancelled: 0 }), 0); assert.equal(cancellationBps({ bookings: 3, cancelled: 1 }), 3333);
  assert.equal(summarize([row({ status: 'partially_refunded' }), row({ status: 'no_show' })]).totals.cancelled, 0);
});
test('weeks start on Monday and the trend sums to the totals, with empty weeks kept', () => {
  assert.equal(weekStart('2026-11-02'), '2026-11-02'); assert.equal(weekStart('2026-11-08'), '2026-11-02'); assert.equal(weekStart('2026-11-09'), '2026-11-09'); assert.equal(weekStart('2026-11-01'), '2026-10-26');
  const rs = [row({ day: '2026-11-01' }), row({ day: '2026-11-03', grossCents: 5000, refundedCents: 1000 }), row({ day: '2026-11-18', grossCents: 700 })];
  const tr = weeklyTrend(rs, '2026-10-30', '2026-11-20');
  assert.deepEqual(tr.map(w => w.week), ['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16']);
  assert.deepEqual(tr.map(w => [w.bookings, w.netCents]), [[1, 10000], [1, 4000], [0, 0], [1, 700]]);
  const t = summarize(rs).totals; assert.equal(tr.reduce((n, w) => n + w.bookings, 0), t.bookings); assert.equal(tr.reduce((n, w) => n + w.netCents, 0), t.netCents);
});
test('occupancy is seats over capacity per tour and overall, capped at 100%', () => {
  const o = occupancy([{ id: '1', startAt: 'a', tour: 'Harbor', capacity: 10, seats: 5 }, { id: '2', startAt: 'b', tour: 'Harbor', capacity: 10, seats: 10 }, { id: '3', startAt: 'c', tour: 'Dolphin', capacity: 20, seats: 3 }, { id: '4', startAt: 'd', tour: 'Empty', capacity: 0, seats: 0 }]);
  assert.deepEqual(o.total, { name: 'All tours', departures: 4, capacity: 40, seats: 18, bps: 4500 });
  assert.deepEqual(o.byTour.map(t => [t.name, t.seats, t.capacity, t.bps]), [['Harbor', 15, 20, 7500], ['Dolphin', 3, 20, 1500], ['Empty', 0, 0, 0]]);
  assert.equal(o.byTour.reduce((n, t) => n + t.seats, 0), o.total.seats); assert.equal(o.departures[1].bps, 10000);
  assert.equal(occupancy([{ id: 'x', startAt: 'a', tour: 'T', capacity: 10, seats: 12 }]).total.bps, 10000);
});
