import test from 'node:test';
import assert from 'node:assert/strict';
import { describePolicy, manageLinkPath, parseManageHash, samePrice, selfServiceWindow } from './tour-self-service';

test('self-service closes exactly at start minus the booking cutoff', () => {
  const start = new Date('2026-11-10T14:00:00Z'), cutoff = 60;
  assert.equal(selfServiceWindow(start, cutoff, new Date('2026-11-10T12:59:59Z')).open, true);
  assert.equal(selfServiceWindow(start, cutoff, new Date('2026-11-10T13:00:00Z')).open, false);
  assert.equal(selfServiceWindow(start, null, new Date('2026-11-10T13:59:00Z')).open, true);
  assert.equal(selfServiceWindow(start, cutoff).closesAt.toISOString(), '2026-11-10T13:00:00.000Z');
});
test('policy wording follows the rules, strictest last', () => {
  assert.deepEqual(describePolicy([{ hoursBefore: 0, refundBps: 0 }, { hoursBefore: 24, refundBps: 10000 }]), ['Full refund up to 24 hours before the start', 'No refund after that']);
  assert.deepEqual(describePolicy([{ hoursBefore: 72, refundBps: 10000 }, { hoursBefore: 24, refundBps: 5000 }]), ['Full refund up to 3 days before the start', '50% refund up to 24 hours before the start', 'No refund after that']);
  assert.deepEqual(describePolicy([]), ['No refund once booked']);
});
test('same price compares ticket and add-on subtotals only', () => {
  assert.equal(samePrice({ subtotalCents: 6000, addOnsCents: 500 }, { subtotalCents: 6000, addOnsCents: 500 }), true);
  assert.equal(samePrice({ subtotalCents: 6000, addOnsCents: 500 }, { subtotalCents: 6500, addOnsCents: 0 }), false);
});
test('the manage link round-trips and rejects junk', () => {
  const p = manageLinkPath('TG-ABCD2345', 'a'.repeat(43));
  assert.equal(p, `/manage#TG-ABCD2345.${'a'.repeat(43)}`);
  assert.deepEqual(parseManageHash(p.slice(p.indexOf('#'))), { bookingRef: 'TG-ABCD2345', token: 'a'.repeat(43) });
  assert.equal(parseManageHash('#nope'), null); assert.equal(parseManageHash(''), null); assert.equal(parseManageHash('#TG-ABCD2345.short'), null);
});
