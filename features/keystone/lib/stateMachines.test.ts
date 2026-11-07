import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MACHINES, canTransition, assertMove, terminalStates, type MachineName } from './stateMachines';
const read = (f: string) => readFileSync(new URL(`../models/${f}.ts`, import.meta.url), 'utf8');
// The state([...]) list of the field declared on the given list (the text between `export const <List> =` and the next export).
const declared = (file: string, list: string, field: string) => {
  const src = read(file); const i = src.indexOf(`export const ${list} =`); const j = src.indexOf('\nexport const', i + 10);
  const body = src.slice(i, j < 0 ? undefined : j); const m = new RegExp(`${field}: state\\(\\[([^\\]]*)\\]`).exec(body);
  return m ? [...m[1].matchAll(/'([a-z_]+)'/g)].map(x => x[1]) : [];
};
const selected = (file: string) => { const src = read(file); const i = src.indexOf('status: select'); const j = src.indexOf(']', i); return [...src.slice(i, j).matchAll(/value: "([a-z_]+)"/g)].map(x => x[1]); };
test('every machine covers exactly the statuses declared on its model', () => {
  const pairs: [MachineName, string[]][] = [
    ['departure', declared('Departure', 'Departure', 'status')], ['booking', declared('Booking', 'Booking', 'status')], ['inventoryHold', declared('Booking', 'InventoryHold', 'status')],
    ['partyChange', declared('Booking', 'PartyChange', 'status')], ['waitlistEntry', declared('operations', 'WaitlistEntry', 'status')], ['promoRedemption', declared('operations', 'PromoRedemption', 'status')],
    ['guideAssignment', declared('staffing', 'GuideAssignment', 'status')], ['guidePayout', declared('staffing', 'GuidePayout', 'status')], ['channelStatement', declared('operations', 'ChannelStatement', 'status')],
    ['giftCard', declared('giftCards', 'GiftCard', 'status')], ['operationalTask', declared('operations', 'OperationalTask', 'status')], ['participantCheckIn', declared('waivers', 'Participant', 'checkInStatus')],
    ['waiver', declared('waivers', 'Participant', 'waiverStatus')], ['refund', selected('Refund')], ['payment', selected('Payment')], ['managerApproval', selected('ManagerApproval')], ['paymentWebhookEvent', selected('PaymentWebhookEvent')],
  ];
  for (const [name, states] of pairs) {
    assert.ok(states.length, `${name}: no statuses parsed`);
    const keys = Object.keys(MACHINES[name]);
    for (const s of states) assert.ok(keys.includes(s), `${name}: ${s} missing from the machine`);
    for (const k of keys) assert.ok(states.includes(k), `${name}: ${k} is not on the model`);
  }
});
test('every target is a known state', () => { for (const [n, m] of Object.entries(MACHINES)) for (const [from, to] of Object.entries(m)) for (const t of to) assert.ok(t in m, `${n}: ${from} -> ${t}`); });
test('illegal moves found in the audit are refused', () => {
  assert.equal(canTransition('booking', 'refunded', 'confirmed'), false);
  assert.equal(canTransition('booking', 'completed', 'confirmed'), false);
  assert.equal(canTransition('departure', 'completed', 'cancelled'), false);
  assert.equal(canTransition('departure', 'weather_cancelled', 'on_sale'), false);
  assert.equal(canTransition('inventoryHold', 'converted', 'released'), false);
  assert.equal(canTransition('giftCard', 'void', 'active'), false);
  assert.throws(() => assertMove('guideAssignment', 'worked', 'cancelled'), /cannot move/);
  assert.throws(() => assertMove('booking', 'checked_in', 'no_show'), /cannot move/);
});
test('no-show can be undone only back to confirmed; late payment may revive a lapsed booking', () => {
  assert.equal(canTransition('booking', 'no_show', 'confirmed'), true);
  assert.equal(canTransition('booking', 'cancelled', 'pending_payment'), true);
  assert.equal(canTransition('booking', 'pending_payment', 'checked_in'), false);
});
test('terminal states', () => { assert.deepEqual(terminalStates('refund').sort(), ['failed', 'succeeded']); assert.ok(terminalStates('departure').includes('weather_cancelled')); });
