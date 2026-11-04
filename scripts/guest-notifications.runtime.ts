// Scratch-DB proof that booking confirmations and day-before reminders are queued as records that honour NotificationPreference.
// No transport is called anywhere. Fixtures are depth-*; remove with scripts/depth-cleanup.ts apply.
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { createChannelBooking, queueDayBeforeReminders } from '../features/keystone/mutations/tour-checkout';
const p: any = new PrismaClient(), tag = 'depth-' + randomUUID();
const key = () => tag + randomUUID();
const notes = (bookingId: string) => p.auditEvent.findMany({ where: { targetList: 'Notification', targetId: { endsWith: ':' + bookingId } }, orderBy: { createdAt: 'asc' } });
async function main() {
  const role = await p.role.create({ data: { name: tag, canManageBookings: true, canManagePayments: true } });
  const user = await p.user.create({ data: { name: tag, email: tag + '@test.example', password: 'disabled-runtime-fixture', roleId: role.id } });
  const c: any = { prisma: p, session: { itemId: user.id, data: { role } } };
  const tour = await p.tour.create({ data: { name: tag, slug: tag, status: 'active', maxParticipants: 100, timezone: 'America/New_York' } });
  const ticket = await p.ticketType.create({ data: { tourId: tour.id, name: 'Adult', priceCents: 10000, active: true, seatsUsed: 1, countsTowardCapacity: true } });
  const startAt = new Date(Date.now() + 10 * 3600000);
  const dep = await p.departure.create({ data: { tourId: tour.id, departureKey: tag, startAt, endAt: new Date(+startAt + 3600000), capacity: 20, status: 'on_sale' } });
  const book = async (email: string, extra: any = {}) => {
    const r = await createChannelBooking(null, { idempotencyKey: key(), input: { departureId: dep.id, source: 'phone', paymentMethod: 'cash', tickets: [{ id: ticket.id, qty: 1 }], lead: { name: 'Sam Guest', email }, participants: [{ ticketTypeId: ticket.id, fullName: 'Sam Guest', age: 30 }], ...extra } }, c);
    return p.booking.findUnique({ where: { bookingRef: r.bookingRef } });
  };
  const okEmail = `${tag}-ok@test.example`, outEmail = `${tag}-out@test.example`, weatherOnly = `${tag}-wx@test.example`;
  await p.notificationPreference.create({ data: { email: outEmail, bookingUpdates: false } });
  await p.notificationPreference.create({ data: { email: weatherOnly, bookingUpdates: true, weatherCancellation: false } });

  // 1. No preference on file: confirmation queued with the guest address, tour and reference. Fast path is the operator path.
  const a = await book(okEmail.toUpperCase());
  let n = await notes(a.id); assert.equal(n.length, 1); assert.equal(n[0].action, 'notification.queued');
  assert.equal(n[0].after.to, okEmail); assert.equal(n[0].after.channel, 'email'); assert.match(n[0].after.subject, new RegExp(a.bookingRef)); assert.match(n[0].after.text, /Sam Guest/); assert.equal(n[0].targetId, 'booking_confirmation:' + a.id);
  // 2. Opted out of booking updates: recorded as suppressed with a reason, nothing queued.
  const o = await book(outEmail);
  n = await notes(o.id); assert.equal(n.length, 1); assert.equal(n[0].action, 'notification.suppressed'); assert.match(n[0].reason, /opted out/);
  // 3. A weather-only opt-out leaves booking updates on.
  const w = await book(weatherOnly); n = await notes(w.id); assert.equal(n[0].action, 'notification.queued');
  // 4. Replay of the same idempotency key adds no second notification.
  const k = key(); const input = { departureId: dep.id, source: 'phone', paymentMethod: 'cash', tickets: [{ id: ticket.id, qty: 1 }], lead: { name: 'Replay', email: `${tag}-replay@test.example` }, participants: [{ ticketTypeId: ticket.id, fullName: 'Replay', age: 30 }] };
  const r1 = await createChannelBooking(null, { idempotencyKey: k, input }, c); await createChannelBooking(null, { idempotencyKey: k, input }, c);
  const rb = await p.booking.findUnique({ where: { bookingRef: r1.bookingRef } }); assert.equal((await notes(rb.id)).length, 1);
  // 5. Day-before reminders: one per confirmed booking, honours the opt-out, and a second sweep adds nothing.
  const first = await p.$transaction((tx: any) => queueDayBeforeReminders(tx, user.id, [dep.id]));
  assert.equal(first.reminders, 3); assert.equal(first.suppressedReminders, 1);
  const again = await p.$transaction((tx: any) => queueDayBeforeReminders(tx, user.id, [dep.id]));
  assert.deepEqual(again, { reminders: 0, suppressedReminders: 0 });
  n = await notes(a.id); assert.equal(n.length, 2); const rem = n.find((x: any) => x.targetId.startsWith('day_before_reminder:'));
  assert.equal(rem.action, 'notification.queued'); assert.match(rem.after.subject, /Tomorrow/); assert.match(rem.after.text, /(AM|PM)/);
  n = await notes(o.id); assert.deepEqual(n.map((x: any) => x.action), ['notification.suppressed', 'notification.suppressed']);
  // 6. A departure outside the window is not reminded; a cancelled booking is not reminded.
  const far = await p.departure.create({ data: { tourId: tour.id, departureKey: tag + 'f', startAt: new Date(Date.now() + 5 * 86400000), endAt: new Date(Date.now() + 5 * 86400000 + 3600000), capacity: 20, status: 'on_sale' } });
  assert.deepEqual(await p.$transaction((tx: any) => queueDayBeforeReminders(tx, user.id, [far.id])), { reminders: 0, suppressedReminders: 0 });
  await p.booking.update({ where: { id: w.id }, data: { status: 'cancelled' } });
  await p.auditEvent.deleteMany({ where: { targetId: 'day_before_reminder:' + w.id } });
  assert.equal((await p.$transaction((tx: any) => queueDayBeforeReminders(tx, user.id, [dep.id]))).reminders, 0);
  console.log('PASS guest notifications queue (no transport)');
  await p.$disconnect();
}
main().catch(async e => { console.error(e); await p.$disconnect(); process.exit(1); });
