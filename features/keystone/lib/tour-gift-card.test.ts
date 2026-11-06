import test from 'node:test';
import assert from 'node:assert/strict';
import { codeFromBytes, formatCode, normalizeCode, unusable, applyCard, issueAmount, CODE_ALPHABET } from './tour-gift-card';
import { allocateRefund } from './tour-tender';

test('codes use the unambiguous alphabet and a fixed shape', () => {
  const raw = codeFromBytes(new Uint8Array(Array.from({ length: 16 }, (_, i) => i * 17)));
  assert.equal(raw.length, 12);
  assert.ok([...raw].every(c => CODE_ALPHABET.includes(c)));
  assert.match(formatCode(raw), /^GC-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.throws(() => codeFromBytes(new Uint8Array(4)), /12 bytes/);
});
test('typed codes are normalized; junk is not looked up', () => {
  assert.equal(normalizeCode('gc-abcd-efgh-jkmn'), 'ABCDEFGHJKMN');
  assert.equal(normalizeCode(' ABCD EFGH JKMN '), 'ABCDEFGHJKMN');
  assert.equal(normalizeCode('GCABCDEFGHJKMN'), 'ABCDEFGHJKMN');
  assert.equal(normalizeCode('ABCD-EFGH-JKM'), '', 'too short');
  assert.equal(normalizeCode('ABCD-EFGH-JKM0'), '', '0 is not in the alphabet');
  assert.equal(normalizeCode(''), '');
});
test('a card pays only when active, unexpired, same currency and funded', () => {
  const now = new Date('2026-11-05T12:00:00Z');
  const ok = { status: 'active', balanceCents: 5000, currencyCode: 'USD', expiresAt: null };
  assert.equal(unusable(ok, 'USD', now), null);
  assert.equal(unusable(null, 'USD', now), 'Gift card not found');
  assert.match(unusable({ ...ok, status: 'void' }, 'USD', now)!, /no longer valid/);
  assert.match(unusable({ ...ok, expiresAt: '2026-11-05T11:59:59Z' }, 'USD', now)!, /expired/);
  assert.equal(unusable({ ...ok, expiresAt: '2026-11-06T00:00:00Z' }, 'USD', now), null);
  assert.match(unusable(ok, 'EUR', now)!, /in USD/);
  assert.match(unusable({ ...ok, balanceCents: 0 }, 'USD', now)!, /no balance/);
});
test('the card pays up to its balance; the rest goes on the bank card', () => {
  assert.deepEqual(applyCard(5000, 12000), { giftCents: 5000, cardCents: 7000 });
  assert.deepEqual(applyCard(20000, 12000), { giftCents: 12000, cardCents: 0 });
  assert.deepEqual(applyCard(0, 12000), { giftCents: 0, cardCents: 12000 });
});
test('issue amounts are bounded', () => {
  assert.equal(issueAmount(5000), 5000);
  assert.throws(() => issueAmount(99), /at least/);
  assert.throws(() => issueAmount(200001), /at most/);
  assert.throws(() => issueAmount(10.5), /at least/);
});
test('a split booking refunds to the gift card first (recorded last), then the bank card', () => {
  const t = [
    { id: 'card', amount: 7000, createdAt: '2026-11-05T12:00:00.000Z' },
    { id: 'gift', amount: 5000, createdAt: '2026-11-05T12:00:00.001Z', paymentMethod: 'gift_card' },
  ];
  assert.deepEqual(allocateRefund(t, 3000), [{ paymentId: 'gift', amount: 3000 }]);
  assert.deepEqual(allocateRefund(t, 12000), [{ paymentId: 'gift', amount: 5000 }, { paymentId: 'card', amount: 7000 }]);
  assert.deepEqual(allocateRefund([{ ...t[0] }, { ...t[1], refundedAmount: 5000 }], 2000), [{ paymentId: 'card', amount: 2000 }]);
});
