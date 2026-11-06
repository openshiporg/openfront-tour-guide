import test from 'node:test';
import assert from 'node:assert/strict';
import { planTicketLines, partyTotals, settleChange, seatsOf } from './tour-party-change';
import { allocateRefund, legKey } from './tour-tender';

const adult = { catalogId: 'A', name: 'Adult', unitPriceCents: 6000, qty: 2, seatsUsed: 1 };
const offers = { A: { name: 'Adult', unitPriceCents: 7000, seatsUsed: 1 }, C: { name: 'Child', unitPriceCents: 3000, seatsUsed: 1 } };

test('kept people keep their price; added people pay today\'s price', () => {
  assert.deepEqual(planTicketLines([adult], { A: 3 }, offers), [adult, { catalogId: 'A', name: 'Adult', unitPriceCents: 7000, qty: 1, seatsUsed: 1 }]);
  assert.deepEqual(planTicketLines([adult], { A: 1 }, offers), [{ ...adult, qty: 1 }]);
  // Same price today: merged into the kept line.
  assert.deepEqual(planTicketLines([adult], { A: 4 }, { A: { name: 'Adult', unitPriceCents: 6000, seatsUsed: 1 } }), [{ ...adult, qty: 4 }]);
});
test('switching a ticket type removes one and adds the other', () => {
  const lines = planTicketLines([adult], { A: 1, C: 1 }, offers);
  assert.deepEqual(lines.map(l => [l.catalogId, l.qty, l.unitPriceCents]), [['A', 1, 6000], ['C', 1, 3000]]);
  assert.equal(seatsOf(lines), 2);
});
test('refuses an empty party, an unsold ticket and bad quantities', () => {
  assert.throws(() => planTicketLines([adult], { A: 0 }, offers), /At least one person/);
  assert.throws(() => planTicketLines([adult], { A: 2, Z: 1 }, offers), /no longer sold/);
  assert.throws(() => planTicketLines([adult], { A: -1 }, offers), /Invalid quantity/);
});
test('totals reuse the promo snapshot and tax', () => {
  assert.deepEqual(partyTotals([adult], 1000, null, 1000), { subtotalCents: 12000, discountCents: 0, taxCents: 1300, totalCents: 14300 });
  assert.equal(partyTotals([adult], 0, { discountType: 'percent_bps', value: 1000 }, 0).totalCents, 10800);
  assert.equal(partyTotals([adult], 0, { discountType: 'amount_cents', value: 50000 }, 0).totalCents, 0);
  assert.equal(partyTotals([adult], 0, { discountType: 'comp', value: 0 }, 0).totalCents, 0);
});
test('more costs the difference; less refunds under the policy for guests and in full for staff', () => {
  const before = { totalCents: 12000 }, more = { totalCents: 19000 }, less = { totalCents: 6000 };
  assert.deepEqual(settleChange({ oldTotalCents: 12000, oldFeeCents: 0, before, after: more, guest: true, rules: [], hoursBefore: 100 }), { differenceCents: 7000, collectCents: 7000, refundCents: 0, keptCents: 0, feeCents: 0, totalCents: 19000 });
  const rules = [{ hoursBefore: 48, refundBps: 10000 }, { hoursBefore: 12, refundBps: 5000 }, { hoursBefore: 0, refundBps: 0 }];
  assert.deepEqual(settleChange({ oldTotalCents: 12000, oldFeeCents: 0, before, after: less, guest: true, rules, hoursBefore: 100 }), { differenceCents: -6000, collectCents: 0, refundCents: 6000, keptCents: 0, feeCents: 0, totalCents: 6000 });
  // Inside 48h: half back; the kept half stays on the booking as a fee.
  assert.deepEqual(settleChange({ oldTotalCents: 12000, oldFeeCents: 0, before, after: less, guest: true, rules, hoursBefore: 24 }), { differenceCents: -6000, collectCents: 0, refundCents: 3000, keptCents: 3000, feeCents: 3000, totalCents: 9000 });
  assert.equal(settleChange({ oldTotalCents: 12000, oldFeeCents: 0, before, after: less, guest: false, rules, hoursBefore: 24 }).refundCents, 6000);
});
test('refunds go to the newest payment first and are capped per payment', () => {
  const t = [{ id: 'card', amount: 12000, refundedAmount: 0, createdAt: '2026-11-01' }, { id: 'topup', amount: 7000, refundedAmount: 0, createdAt: '2026-11-03' }];
  assert.deepEqual(allocateRefund(t, 5000), [{ paymentId: 'topup', amount: 5000 }]);
  assert.deepEqual(allocateRefund(t, 10000), [{ paymentId: 'topup', amount: 7000 }, { paymentId: 'card', amount: 3000 }]);
  assert.deepEqual(allocateRefund([{ ...t[0] }, { ...t[1], refundedAmount: 7000 }], 1000), [{ paymentId: 'card', amount: 1000 }]);
  assert.throws(() => allocateRefund(t, 19001), /exceeds captured/);
  assert.deepEqual(allocateRefund(t, 0), []);
  assert.deepEqual([legKey('k', 0), legKey('k', 1)], ['k', 'k~1']);
});
