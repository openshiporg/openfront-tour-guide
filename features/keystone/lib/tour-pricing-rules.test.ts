import test from 'node:test';
import assert from 'node:assert/strict';
import { checkRule } from './tour-pricing-rules';
import { applyPricingRules } from './tour-pricing';

const tz = 'America/New_York';
const base = { tourId: 't', name: 'Summer weekends' };

test('a rule needs exactly one of a percentage or a fixed price', () => {
  assert.throws(() => checkRule({ ...base }, tz), /either a percentage/);
  assert.throws(() => checkRule({ ...base, adjustBps: 100, overridePriceCents: 500 }, tz), /either a percentage/);
  assert.equal(checkRule({ ...base, adjustBps: 0 }, tz).adjustBps, 0);
  assert.equal(checkRule({ ...base, overridePriceCents: 0 }, tz).overridePriceCents, 0);
});
test('bounds, names, dates and weekdays are refused when wrong', () => {
  assert.throws(() => checkRule({ ...base, name: '  ', adjustBps: 100 }, tz), /name/);
  assert.throws(() => checkRule({ ...base, adjustBps: -9001 }, tz), /between/);
  assert.throws(() => checkRule({ ...base, adjustBps: 1.5 }, tz), /between/);
  assert.throws(() => checkRule({ ...base, overridePriceCents: -1 }, tz), /fixed price/);
  assert.throws(() => checkRule({ ...base, overridePriceCents: 100_000_001 }, tz), /fixed price/);
  assert.throws(() => checkRule({ ...base, adjustBps: 100, from: '2026-12-01', to: '2026-11-01' }, tz), /before/);
  assert.throws(() => checkRule({ ...base, adjustBps: 100, from: '12/01/2026' }, tz), /YYYY-MM-DD/);
  assert.throws(() => checkRule({ ...base, adjustBps: 100, weekdays: [7] }, tz), /Weekdays/);
});
test('all seven weekdays is stored as every day, and weekdays are sorted and unique', () => {
  assert.equal(checkRule({ ...base, adjustBps: 100, weekdays: [0, 1, 2, 3, 4, 5, 6] }, tz).weekdays, null);
  assert.deepEqual(checkRule({ ...base, adjustBps: 100, weekdays: [6, 0, 6] }, tz).weekdays, [0, 6]);
  assert.equal(checkRule({ ...base, adjustBps: 100, weekdays: [] }, tz).weekdays, null);
});
test('the last day is inclusive in the tour timezone and a saved rule drives the quote', () => {
  const c = checkRule({ ...base, overridePriceCents: 7000, from: '2026-11-07', to: '2026-11-07', weekdays: [6] }, tz);
  const rule = (id: string) => ({ id, ticketTypeId: null, validFrom: c.validFrom, validTo: c.validTo, weekdays: c.weekdays, adjustBps: c.adjustBps, overridePriceCents: c.overridePriceCents });
  assert.equal(applyPricingRules(5000, 't', new Date('2026-11-08T03:00:00Z'), tz, [rule('r')]).unitPriceCents, 7000); // Saturday 22:00 in New York
  assert.equal(applyPricingRules(5000, 't', new Date('2026-11-08T06:00:00Z'), tz, [rule('r')]).unitPriceCents, 5000); // Sunday 01:00
  assert.equal(applyPricingRules(5000, 't', new Date('2026-11-07T04:59:00Z'), tz, [rule('r')]).unitPriceCents, 5000); // Friday 23:59
});
