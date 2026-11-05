import test from 'node:test';
import assert from 'node:assert/strict';
import { pickOffers, offerExpiry, positionOf, parseWaitlistHash, waitlistLinkPath } from './tour-waitlist';

const e = (id: string, seats: number, min: number) => ({ id, seats, createdAt: new Date(Date.UTC(2026, 10, 5, 12, min)) });

test('offers go oldest first and never exceed the free seats', () => {
  assert.deepEqual(pickOffers([e('b', 2, 2), e('a', 1, 1), e('c', 1, 3)], 3), ['a', 'b']);
  assert.deepEqual(pickOffers([e('a', 1, 1)], 0), []);
  assert.deepEqual(pickOffers([], 5), []);
});
test('a party that does not fit keeps its place and a smaller one behind it is offered', () => {
  assert.deepEqual(pickOffers([e('big', 4, 1), e('small', 2, 2), e('next', 1, 3)], 3), ['small', 'next']);
  assert.deepEqual(pickOffers([e('big', 4, 1)], 3), []);
});
test('offer window is capped by the booking cutoff and refused when under 10 minutes', () => {
  const now = new Date('2026-11-05T12:00:00Z');
  assert.equal(offerExpiry(now, '2026-11-07T12:00:00Z', 60, 12)!.toISOString(), '2026-11-06T00:00:00.000Z');
  assert.equal(offerExpiry(now, '2026-11-05T15:00:00Z', 60, 12)!.toISOString(), '2026-11-05T14:00:00.000Z');
  assert.equal(offerExpiry(now, '2026-11-05T13:05:00Z', 60, 12), null);
  assert.equal(offerExpiry(now, '2026-11-05T11:00:00Z', 0, 12), null);
});
test('position counts only parties still waiting, by join time', () => {
  const w = [e('c', 1, 3), e('a', 1, 1), e('b', 2, 2)];
  assert.equal(positionOf('a', w), 1); assert.equal(positionOf('c', w), 3); assert.equal(positionOf('x', w), null);
});
test('waitlist link keeps the proof in the fragment and parses back', () => {
  const path = waitlistLinkPath('c0123456789abcdef', 'A'.repeat(43));
  assert.ok(path.startsWith('/waitlist#'));
  assert.deepEqual(parseWaitlistHash(path.slice('/waitlist'.length)), { entryId: 'c0123456789abcdef', token: 'A'.repeat(43) });
  assert.equal(parseWaitlistHash('#bad'), null);
  assert.equal(parseWaitlistHash(''), null);
});
