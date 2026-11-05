// Scratch-DB proof of the operator "Reset guest link": old link dies, new link works, other bookings untouched, lookup returns
// the new link, replay by key, reason required, permission required, state refusals, and the audit trail. Fixtures are depth-*, removed at the end.
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { createChannelBooking, lookupBooking } from '../features/keystone/mutations/tour-checkout';
import { manageBooking, cancelManagedBooking, resetGuestLink, manageToken } from '../features/keystone/mutations/tour-self-service';
import { parseManageHash } from '../features/keystone/lib/tour-self-service';
const p: any = new PrismaClient(), tag = 'depth-' + randomUUID().slice(0, 8);
const key = () => tag + randomUUID();
async function main() {
  const role = await p.role.create({ data: { name: tag + 'ops', canManageBookings: true, canManagePayments: true } });
  const weak = await p.role.create({ data: { name: tag + 'weak', canCheckIn: true } });
  const user = await p.user.create({ data: { name: tag, email: tag + '@test.example', password: 'disabled-runtime-fixture', roleId: role.id } });
  const wuser = await p.user.create({ data: { name: tag + 'w', email: tag + 'w@test.example', password: 'disabled-runtime-fixture', roleId: weak.id } });
  const ops: any = { prisma: p, session: { itemId: user.id, data: { role } } };
  const guide: any = { prisma: p, session: { itemId: wuser.id, data: { role: weak } } };
  const anon: any = { prisma: p, session: undefined };
  const tour = await p.tour.create({ data: { name: tag, slug: tag, status: 'active', maxParticipants: 100 } });
  const tk = await p.ticketType.create({ data: { tourId: tour.id, name: 'Adult', priceCents: 5000, active: true, seatsUsed: 1, countsTowardCapacity: true } });
  const startAt = new Date(Date.now() + 96 * 3600000);
  const dep = await p.departure.create({ data: { tourId: tour.id, departureKey: tag + randomUUID(), startAt, endAt: new Date(+startAt + 3600000), capacity: 20, status: 'on_sale', bookingCutoffMinutes: 60 } });
  const book = async (email: string) => {
    const r: any = await createChannelBooking(null, { idempotencyKey: key(), input: { departureId: dep.id, source: 'phone', paymentMethod: 'cash', tickets: [{ id: tk.id, qty: 1 }], lead: { name: 'Link Reset', email }, participants: [{ ticketTypeId: tk.id, fullName: 'Guest', age: 30 }] } }, ops);
    return p.booking.findUnique({ where: { bookingRef: r.bookingRef } });
  };
  try {
    const email = tag + '@guest.example';
    const b = await book(email), other = await book(tag + 'o@guest.example');
    const oldToken = manageToken(b.id), otherToken = manageToken(other.id);
    assert.equal((await lookupBooking(null, { bookingRef: b.bookingRef, email }, anon) as any).manageToken, oldToken, 'v0 link before reset');
    await manageBooking(null, { bookingRef: b.bookingRef, token: oldToken }, anon);

    // Refusals before anything changes.
    await assert.rejects(() => resetGuestLink(null, { input: { bookingId: b.id, reason: 'x' }, idempotencyKey: key() }, anon), /Not authorized/);
    await assert.rejects(() => resetGuestLink(null, { input: { bookingId: b.id, reason: 'x' }, idempotencyKey: key() }, guide), /Not authorized/);
    await assert.rejects(() => resetGuestLink(null, { input: { bookingId: b.id, reason: '  ' }, idempotencyKey: key() }, ops), /reason is required/);
    await assert.rejects(() => resetGuestLink(null, { input: { bookingId: 'nope', reason: 'x' }, idempotencyKey: key() }, ops), /Booking not found/);
    assert.equal((await p.booking.findUnique({ where: { id: b.id } })).manageTokenVersion, 0, 'refusals change nothing');

    // Reset: v1, old link dead, new link works, other booking untouched, lookup gives the new link, audit written.
    const k1 = key();
    const r1: any = await resetGuestLink(null, { input: { bookingId: b.id, reason: 'Guest forwarded the email to the wrong person' }, idempotencyKey: k1 }, ops);
    assert.equal(r1.version, 1); assert.equal(r1.bookingRef, b.bookingRef);
    const parsed = parseManageHash(r1.link.split('#')[1]);
    assert.ok(parsed && parsed.bookingRef === b.bookingRef, 'link parses'); const newToken = parsed!.token;
    assert.notEqual(newToken, oldToken);
    await assert.rejects(() => manageBooking(null, { bookingRef: b.bookingRef, token: oldToken }, anon), /Booking not found/);
    await assert.rejects(() => cancelManagedBooking(null, { bookingRef: b.bookingRef, token: oldToken, idempotencyKey: key() }, anon), /Booking not found/);
    assert.equal((await manageBooking(null, { bookingRef: b.bookingRef, token: newToken }, anon) as any).bookingRef, b.bookingRef);
    assert.equal((await manageBooking(null, { bookingRef: other.bookingRef, token: otherToken }, anon) as any).bookingRef, other.bookingRef, 'other booking unaffected');
    assert.equal((await lookupBooking(null, { bookingRef: b.bookingRef, email }, anon) as any).manageToken, newToken, 'lookup returns the new link');
    const ev = await p.auditEvent.findMany({ where: { action: 'booking.guest_link_reset', targetId: b.id } });
    assert.equal(ev.length, 1); assert.deepEqual([ev[0].actorId, ev[0].before.version, ev[0].after.version, ev[0].reason], [user.id, 0, 1, 'Guest forwarded the email to the wrong person']);
    assert.ok(!JSON.stringify(ev[0]).includes(newToken), 'token never stored in the audit');

    // Replay by key returns the same link and does not bump again; mismatched params with the same key refused.
    const r1b: any = await resetGuestLink(null, { input: { bookingId: b.id, reason: 'Guest forwarded the email to the wrong person' }, idempotencyKey: k1 }, ops);
    assert.equal(r1b.link, r1.link); assert.equal((await p.booking.findUnique({ where: { id: b.id } })).manageTokenVersion, 1);
    await assert.rejects(() => resetGuestLink(null, { input: { bookingId: b.id, reason: 'different' }, idempotencyKey: k1 }, ops));

    // Two concurrent resets with different keys: both serialize under the departure lock, ending at v3, two more audits, v1 link dead.
    const [ra, rb] = await Promise.all([
      resetGuestLink(null, { input: { bookingId: b.id, reason: 'again a' }, idempotencyKey: key() }, ops),
      resetGuestLink(null, { input: { bookingId: b.id, reason: 'again b' }, idempotencyKey: key() }, ops),
    ]) as any[];
    assert.deepEqual([ra.version, rb.version].sort(), [2, 3]);
    assert.equal((await p.booking.findUnique({ where: { id: b.id } })).manageTokenVersion, 3);
    assert.equal(await p.auditEvent.count({ where: { action: 'booking.guest_link_reset', targetId: b.id } }), 3);
    await assert.rejects(() => manageBooking(null, { bookingRef: b.bookingRef, token: newToken }, anon), /Booking not found/);
    const latest = manageToken(b.id, 3);
    // Cancel through the current link works; then reset is refused (not confirmed).
    const c: any = await cancelManagedBooking(null, { bookingRef: b.bookingRef, token: latest, idempotencyKey: key() }, anon);
    assert.ok(['cancelled', 'refunded'].includes(c.status), 'cancelled through the current link');
    await assert.rejects(() => resetGuestLink(null, { input: { bookingId: b.id, reason: 'late' }, idempotencyKey: key() }, ops), /Only a confirmed booking/);
    console.log('PASS guest-link-reset: permission/reason/not-found refusals, old link dead, new link works, other booking untouched, lookup returns new link, audit without token, replay, concurrency, state refusal');
  } finally {
    // Fixtures are depth-* and removed by scripts/depth-cleanup.ts (apply).
    await p.$disconnect();
  }
}
main().catch(async e => { console.error(e); await p.$disconnect(); process.exit(1); });
