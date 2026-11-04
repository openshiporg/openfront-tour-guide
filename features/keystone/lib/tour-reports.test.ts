import test from 'node:test';
import assert from 'node:assert/strict';
import { commissionFor, csvText, dollars, salesCsv, summarize, type ReportRow } from './tour-reports';

const row = (o: Partial<ReportRow>): ReportRow => ({ ref: 'TG-1', bookedAt: '2026-11-01', departureAt: '2026-11-05', tour: 'Harbor', channel: 'Direct', source: 'phone', status: 'confirmed', guests: 2, grossCents: 10000, discountCents: 500, refundedCents: 0, commissionCents: 0, ...o });
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
  assert.equal(lines.length, rows.length + 2);
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
