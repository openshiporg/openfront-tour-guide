import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPricingRules } from './tour-pricing';

const tz = 'America/New_York';
const sat = new Date('2026-11-07T15:00:00Z'); // Saturday 10:00 in New York
const rule = (o: any) => ({ id: 'r', ticketTypeId: null, validFrom: null, validTo: null, weekdays: null, adjustBps: null, overridePriceCents: null, ...o });

test('no rules or no match keeps the base price', () => {
  assert.deepEqual(applyPricingRules(5000, 't', sat, tz, []), { unitPriceCents: 5000, ruleId: null });
  assert.equal(applyPricingRules(5000, 't', sat, tz, [rule({ adjustBps: 1000, weekdays: [1] })]).unitPriceCents, 5000);
});
test('weekday uses the tour timezone and adjustments round once', () => {
  assert.equal(applyPricingRules(5001, 't', sat, tz, [rule({ adjustBps: 1000, weekdays: [6] })]).unitPriceCents, 5501);
  assert.equal(applyPricingRules(5000, 't', new Date('2026-11-08T03:00:00Z'), tz, [rule({ adjustBps: 1000, weekdays: [6] })]).unitPriceCents, 5500); // still Saturday evening in NY
  assert.equal(applyPricingRules(5000, 't', sat, tz, [rule({ adjustBps: -2000 })]).unitPriceCents, 4000);
});
test('date window, specificity and override precedence', () => {
  assert.equal(applyPricingRules(5000, 't', sat, tz, [rule({ adjustBps: 1000, validTo: new Date('2026-11-01T00:00:00Z') })]).unitPriceCents, 5000);
  const specific = applyPricingRules(5000, 't', sat, tz, [rule({ id: 'a', adjustBps: 500 }), rule({ id: 'b', ticketTypeId: 't', overridePriceCents: 7000 })]);
  assert.deepEqual(specific, { unitPriceCents: 7000, ruleId: 'b' });
  assert.equal(applyPricingRules(5000, 'other', sat, tz, [rule({ ticketTypeId: 't', overridePriceCents: 7000 })]).unitPriceCents, 5000);
});
test('invalid rules and bases are refused', () => {
  assert.throws(() => applyPricingRules(-1, 't', sat, tz, []));
  assert.throws(() => applyPricingRules(100, 't', sat, tz, [rule({ adjustBps: -10001 })]));
  assert.throws(() => applyPricingRules(100, 't', sat, tz, [rule({ overridePriceCents: 1.5 })]));
});
