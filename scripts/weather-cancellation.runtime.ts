// Scratch-DB proof of the weather cancellation workflow: required reason, audit, one notice per booking honouring weatherCancellation,
// a rebook, a refund, and an over-threshold refund that needs a second manager. No transport. Fixtures are depth-*.
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { createChannelBooking, refundBooking, requestRefundApproval, approveRefund } from '../features/keystone/mutations/tour-checkout';
import { weatherCancelDeparture, rebookWeatherBooking, weatherCancellations } from '../features/keystone/mutations/tour-weather';
const p: any = new PrismaClient(), tag = 'depth-' + randomUUID();
const key = () => tag + randomUUID();
async function main() {
  const role = await p.role.create({ data: { name: tag, canManageBookings: true, canManageDepartures: true, canIssueRefunds: true, canManagePayments: true } });
  const mkUser = (n: string) => p.user.create({ data: { name: n + tag.slice(6, 12), email: tag + n + '@test.example', password: 'disabled-runtime-fixture', roleId: role.id } });
  const a = await mkUser('a'), b = await mkUser('b');
  const ca: any = { prisma: p, session: { itemId: a.id, data: { role } } }, cb: any = { prisma: p, session: { itemId: b.id, data: { role } } };
  const noRole = await p.role.create({ data: { name: tag + 'x', canManageBookings: true } });
  const nu = await p.user.create({ data: { name: 'n' + tag.slice(6, 12), email: tag + 'n@test.example', password: 'disabled-runtime-fixture', roleId: noRole.id } });
  const cn: any = { prisma: p, session: { itemId: nu.id, data: { role: noRole } } };
  const tour = await p.tour.create({ data: { name: tag, slug: tag, status: 'active', maxParticipants: 100, timezone: 'America/New_York' } });
  const cheap = await p.ticketType.create({ data: { tourId: tour.id, name: 'Adult', priceCents: 5000, active: true, seatsUsed: 1, countsTowardCapacity: true } });
  const dear = await p.ticketType.create({ data: { tourId: tour.id, name: 'Premium', priceCents: 15000, active: true, seatsUsed: 1, countsTowardCapacity: true } });
  const at = (days: number, k: string) => { const startAt = new Date(Date.now() + days * 86400000); return p.departure.create({ data: { tourId: tour.id, departureKey: tag + k, startAt, endAt: new Date(+startAt + 3600000), capacity: 20, status: 'on_sale' } }); };
  const dep = await at(3, 'a'), other = await at(5, 'b'), full = await at(6, 'c');
  const book = async (departureId: string, ticket: any, email: string) => {
    const r = await createChannelBooking(null, { idempotencyKey: key(), input: { departureId, source: 'phone', paymentMethod: 'cash', tickets: [{ id: ticket.id, qty: 1 }], lead: { name: 'Guest ' + email.split('@')[0].slice(-4), email }, participants: [{ ticketTypeId: ticket.id, fullName: 'Guest', age: 30 }] } }, ca);
    return p.booking.findUnique({ where: { bookingRef: r.bookingRef } });
  };
  const e = (n: string) => `${tag}-${n}@test.example`;
  await p.notificationPreference.create({ data: { email: e('wxout'), bookingUpdates: true, weatherCancellation: false } });
  await p.notificationPreference.create({ data: { email: e('updout'), bookingUpdates: false, weatherCancellation: true } });
  const rebookB = await book(dep.id, cheap, e('rebook')), refundB = await book(dep.id, cheap, e('refund')), bigB = await book(dep.id, dear, e('big'));
  const wxOutB = await book(dep.id, cheap, e('wxout')), updOutB = await book(dep.id, cheap, e('updout'));
  const wx = (id: string) => p.auditEvent.findMany({ where: { targetList: 'Notification', targetId: 'weather_cancellation:' + id } });

  // 1. A reason is required; permission is required; nothing changes on refusal.
  await assert.rejects(() => weatherCancelDeparture(null, { input: { departureId: dep.id, reason: '  ' }, idempotencyKey: key() }, ca), /reason is required/);
  await assert.rejects(() => weatherCancelDeparture(null, { input: { departureId: dep.id, reason: 'Gale warning' }, idempotencyKey: key() }, cn), /Not authorized/);
  assert.equal((await p.departure.findUnique({ where: { id: dep.id } })).status, 'confirmed');
  // 2. Cancel: departure weather_cancelled, audited with the reason, bookings stay live awaiting the guest's choice (nothing auto-refunded).
  const k = key();
  const res = await weatherCancelDeparture(null, { input: { departureId: dep.id, reason: 'Gale warning' }, idempotencyKey: k }, ca);
  assert.deepEqual([res.awaitingChoice, res.noticesQueued, res.noticesHeldBack], [5, 4, 1]);
  assert.equal((await p.departure.findUnique({ where: { id: dep.id } })).status, 'weather_cancelled');
  const ev = await p.auditEvent.findMany({ where: { action: 'departure.weather_cancelled', targetId: dep.id } });
  assert.equal(ev.length, 1); assert.equal(ev[0].reason, 'Gale warning'); assert.equal(ev[0].actorId, a.id);
  for (const bk of [rebookB, refundB, bigB]) assert.equal((await p.booking.findUnique({ where: { id: bk.id } })).status, 'confirmed');
  // 3. Notices honour weatherCancellation (not bookingUpdates); the message offers rebook or full refund.
  assert.equal((await wx(rebookB.id))[0].action, 'notification.queued');
  assert.match((await wx(rebookB.id))[0].after.text, /rebook/); assert.match((await wx(rebookB.id))[0].after.text, /\$50\.00/);
  const held = (await wx(wxOutB.id))[0]; assert.equal(held.action, 'notification.suppressed'); assert.match(held.reason, /weather/);
  assert.equal((await wx(updOutB.id))[0].action, 'notification.queued');
  // 4. Replay of the same key, and a second cancel with a new key, add no duplicate notices.
  await weatherCancelDeparture(null, { input: { departureId: dep.id, reason: 'Gale warning' }, idempotencyKey: k }, ca);
  const again = await weatherCancelDeparture(null, { input: { departureId: dep.id, reason: 'Gale warning' }, idempotencyKey: key() }, ca);
  assert.deepEqual([again.noticesQueued, again.noticesHeldBack], [0, 0]); assert.equal((await wx(rebookB.id)).length, 1);
  // 5. Operator view lists the waiting guests with same-tour options that have room.
  const view = (await weatherCancellations(null, {}, ca)).departures.find((d: any) => d.id === dep.id);
  assert.equal(view.reason, 'Gale warning'); assert.equal(view.bookings.length, 5);
  const row = view.bookings.find((x: any) => x.id === rebookB.id); assert.equal(row.notice, 'queued'); assert.ok(row.options.some((o: any) => o.id === other.id)); assert.ok(!row.options.some((o: any) => o.id === dep.id));
  assert.equal(view.bookings.find((x: any) => x.id === wxOutB.id).notice, 'held back');

  // 6. REBOOK: onto another departure of the same tour at the same price. New booking confirmed, old one closed, audit, replay safe.
  const rk = key();
  const moved = await rebookWeatherBooking(null, { input: { bookingId: rebookB.id, departureId: other.id }, idempotencyKey: rk }, ca);
  const nb = await p.booking.findUnique({ where: { bookingRef: moved.bookingRef } });
  assert.equal(nb.departureId, other.id); assert.equal(nb.status, 'confirmed'); assert.equal(nb.seats, 1); assert.equal(nb.guestEmail, e('rebook'));
  const oldNow = await p.booking.findUnique({ where: { id: rebookB.id } }); assert.equal(oldNow.status, 'cancelled'); assert.equal(oldNow.seats, 0); assert.ok(oldNow.creditUsedAt);
  assert.equal((await p.auditEvent.findMany({ where: { action: 'booking.weather_rebooked', targetId: rebookB.id } })).length, 1);
  assert.equal((await rebookWeatherBooking(null, { input: { bookingId: rebookB.id, departureId: other.id }, idempotencyKey: rk }, ca)).bookingRef, moved.bookingRef);
  assert.equal(await p.booking.count({ where: { departureId: other.id, guestEmail: e('rebook') } }), 1);
  // Refusals: already resolved, wrong tour, same departure, price mismatch, non-weather departure.
  await assert.rejects(() => rebookWeatherBooking(null, { input: { bookingId: rebookB.id, departureId: other.id }, idempotencyKey: key() }, ca), /already been resolved/);
  const tour2 = await p.tour.create({ data: { name: tag + '2', slug: tag + '2', status: 'active', maxParticipants: 10 } });
  const d2 = await p.departure.create({ data: { tourId: tour2.id, departureKey: tag + 'z', startAt: new Date(Date.now() + 5 * 86400000), endAt: new Date(Date.now() + 5 * 86400000 + 3600000), capacity: 5, status: 'on_sale' } });
  await assert.rejects(() => rebookWeatherBooking(null, { input: { bookingId: refundB.id, departureId: d2.id }, idempotencyKey: key() }, ca), /same tour/);
  await assert.rejects(() => rebookWeatherBooking(null, { input: { bookingId: refundB.id, departureId: dep.id }, idempotencyKey: key() }, ca), /different departure/);
  await p.ticketType.update({ where: { id: cheap.id }, data: { priceCents: 6000 } });
  await assert.rejects(() => rebookWeatherBooking(null, { input: { bookingId: updOutB.id, departureId: other.id }, idempotencyKey: key() }, ca), /costs \$60\.00 but the guest paid \$50\.00/);
  await p.ticketType.update({ where: { id: cheap.id }, data: { priceCents: 5000 } });
  assert.equal((await p.booking.findUnique({ where: { id: updOutB.id } })).status, 'confirmed');
  await assert.rejects(() => rebookWeatherBooking(null, { input: { bookingId: nb.id, departureId: full.id }, idempotencyKey: key() }, ca), /weather-cancelled/);

  // 7. REFUND: full refund through the normal refundBooking path (under the threshold, no approval needed).
  const fk = key();
  await refundBooking(null, { input: { bookingId: refundB.id, amountCents: 5000, reason: 'Weather cancellation: Gale warning', cancelBooking: true }, idempotencyKey: fk }, ca);
  const rf = await p.booking.findUnique({ where: { id: refundB.id } }); assert.equal(rf.status, 'refunded'); assert.equal(rf.refundedCents, 5000); assert.equal(rf.seats, 0);
  assert.equal(await p.refund.count({ where: { orderId: refundB.id, status: 'succeeded', amount: 5000 } }), 1);
  await refundBooking(null, { input: { bookingId: refundB.id, amountCents: 5000, reason: 'Weather cancellation: Gale warning', cancelBooking: true }, idempotencyKey: fk }, ca);
  assert.equal(await p.refund.count({ where: { orderId: refundB.id } }), 1);
  // 8. Over the approval threshold ($150 > $100): refused without approval, then request -> second manager approves -> refunded once.
  const big = { bookingId: bigB.id, amountCents: 15000, reason: 'Weather cancellation: Gale warning', cancelBooking: true };
  await assert.rejects(() => refundBooking(null, { input: big, idempotencyKey: key() }, ca), /over the approval threshold/);
  const req = await requestRefundApproval(null, { bookingId: bigB.id, reason: big.reason, amount: 15000 }, ca);
  await assert.rejects(() => approveRefund(null, { approvalId: req.id }, ca), /cannot approve their own/);
  await approveRefund(null, { approvalId: req.id }, cb);
  await refundBooking(null, { input: big, idempotencyKey: key() }, ca);
  assert.equal((await p.booking.findUnique({ where: { id: bigB.id } })).status, 'refunded');
  assert.equal((await p.managerApproval.findUnique({ where: { id: req.id } })).status, 'consumed');
  // 9. The operator view now shows only the two still waiting (wxout, updout).
  const after = (await weatherCancellations(null, {}, ca)).departures.find((d: any) => d.id === dep.id);
  assert.equal(after.bookings.length, 2); assert.equal(after.resolved, 3);
  // 10. A normal departure and a plain operator cancel are untouched by this path.
  await assert.rejects(() => weatherCancelDeparture(null, { input: { departureId: 'nope', reason: 'Gale warning' }, idempotencyKey: key() }, ca), /Departure not found/);
  console.log('PASS weather cancellation: reason/audit/notices/rebook/refund/approval');
  await p.$disconnect();
}
main().catch(async e => { console.error(e); await p.$disconnect(); process.exit(1); });
