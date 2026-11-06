import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, recordedTime, validateBatch, MAX_EVENTS } from './tour-offline-checkin';

const dep = 'dep1';
const booking = (id: string, status = 'confirmed', ps = [['p1', 'pending'], ['p2', 'pending']], departureId = dep) => ({ id, bookingRef: 'TG-' + id, status, departureId, participants: ps.map(([pid, s]) => ({ id: pid, fullName: 'Guest ' + pid, checkInStatus: s })) });
const tap = (key: string, kind: 'check_in' | 'no_show', target: string, at = '2026-11-05T10:00:00Z') => ({ key: key.padEnd(8, 'x'), kind, ...(kind === 'check_in' ? { participantId: target } : { bookingId: target }), recordedAt: at });

test('validateBatch rejects empty, oversize, keyless, duplicate and malformed taps', () => {
  assert.equal(validateBatch([]), 'Nothing to sync');
  assert.match(validateBatch(Array.from({ length: MAX_EVENTS + 1 }, (_, i) => tap('k' + i, 'check_in', 'p1')))!, /at most/);
  assert.equal(validateBatch([{ ...tap('a', 'check_in', 'p1'), key: 'bad key!' }]), 'Each tap needs a key');
  assert.equal(validateBatch([tap('a', 'check_in', 'p1'), tap('a', 'check_in', 'p2')]), 'The same tap was sent twice in one batch');
  assert.equal(validateBatch([{ ...tap('a', 'check_in', 'p1'), participantId: null }]), 'A check-in tap needs a participant');
  assert.equal(validateBatch([tap('a', 'check_in', 'p1')]), null);
});

test('check-ins apply in tap order and the whole party moves the booking to checked_in', () => {
  const r = decide([tap('b', 'check_in', 'p2', '2026-11-05T10:01:00Z'), tap('a', 'check_in', 'p1')], [booking('b1')], dep, new Set());
  assert.deepEqual(r.map((d) => [d.key.slice(0, 1), d.outcome]), [['a', 'applied'], ['b', 'applied']]);
});

test('a guest already checked in on another device is a duplicate, not an error', () => {
  const r = decide([tap('a', 'check_in', 'p1')], [booking('b1', 'confirmed', [['p1', 'checked_in'], ['p2', 'pending']])], dep, new Set());
  assert.equal(r[0].outcome, 'already');
});

test('conflicts: no show elsewhere, cancelled, moved to another departure, removed from the party', () => {
  const r = decide([tap('a', 'check_in', 'p1'), tap('b', 'check_in', 'p3'), tap('c', 'check_in', 'p5'), tap('d', 'check_in', 'gone')],
    [booking('b1', 'no_show'), booking('b2', 'cancelled', [['p3', 'pending']]), booking('b3', 'confirmed', [['p5', 'pending']], 'other')], dep, new Set());
  assert.deepEqual(r.map((d) => d.outcome), ['conflict', 'conflict', 'conflict', 'conflict']);
  assert.match((r[0] as any).reason, /no show on another device/);
  assert.match((r[1] as any).reason, /cancelled/);
  assert.match((r[2] as any).reason, /no longer on this departure/);
});

test('a no show tapped after someone in the booking checked in is refused; before, it applies and blocks later check-in', () => {
  const late = decide([tap('a', 'check_in', 'p1'), tap('b', 'no_show', 'b1', '2026-11-05T10:05:00Z')], [booking('b1')], dep, new Set());
  assert.deepEqual(late.map((d) => d.outcome), ['applied', 'conflict']);
  const early = decide([tap('b', 'no_show', 'b1'), tap('a', 'check_in', 'p1', '2026-11-05T10:05:00Z')], [booking('b1')], dep, new Set());
  assert.deepEqual(early.map((d) => d.outcome), ['applied', 'conflict']);
});

test('keys already synced replay as already; a future device clock is clamped to now', () => {
  const r = decide([tap('a', 'check_in', 'p1')], [booking('b1')], dep, new Set([tap('a', 'check_in', 'p1').key]));
  assert.equal(r[0].outcome, 'already');
  const now = new Date('2026-11-05T10:00:00Z');
  assert.equal(recordedTime('2026-11-06T10:00:00Z', now).toISOString(), now.toISOString());
  assert.equal(recordedTime('2026-11-05T09:00:00Z', now).toISOString(), '2026-11-05T09:00:00.000Z');
  assert.equal(recordedTime('junk', now), now);
});
