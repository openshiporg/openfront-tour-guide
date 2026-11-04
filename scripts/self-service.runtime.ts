// Scratch-DB proof of guest self-service (manage link): token proof, view, reschedule at same price, cancel under policy,
// idempotency, cutoff refusal, reseller refusal and the audit trail. Fixtures are depth-*.
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { createChannelBooking } from '../features/keystone/mutations/tour-checkout';
import { manageBooking, cancelManagedBooking, rescheduleManagedBooking, manageToken } from '../features/keystone/mutations/tour-self-service';
const p: any = new PrismaClient(), tag = 'depth-' + randomUUID().slice(0, 8);
const key = () => tag + randomUUID();
async function main() {
  const role = await p.role.create({ data: { name: tag + 'ops', canManageBookings: true, canManagePayments: true } });
  const user = await p.user.create({ data: { name: tag, email: tag + '@test.example', password: 'disabled-runtime-fixture', roleId: role.id } });
  const ops: any = { prisma: p, session: { itemId: user.id, data: { role } } };
  const anon: any = { prisma: p, session: undefined };
  const policy = await p.cancellationPolicy.create({ data: { name: tag + ' policy', rules: [{ hoursBefore: 48, refundBps: 10000 }, { hoursBefore: 12, refundBps: 5000 }, { hoursBefore: 0, refundBps: 0 }] } });
  const tour = await p.tour.create({ data: { name: tag, slug: tag, status: 'active', maxParticipants: 100, cancellationPolicyId: policy.id } });
  const other = await p.tour.create({ data: { name: tag + ' other', slug: tag + 'o', status: 'active', maxParticipants: 100 } });
  const tk = await p.ticketType.create({ data: { tourId: tour.id, name: 'Adult', priceCents: 6000, active: true, seatsUsed: 1, countsTowardCapacity: true } });
  const tko = await p.ticketType.create({ data: { tourId: other.id, name: 'Adult', priceCents: 6000, active: true, seatsUsed: 1, countsTowardCapacity: true } });
  const dep = (t: any, hours: number, extra: any = {}) => { const startAt = new Date(Date.now() + hours * 3600000); return p.departure.create({ data: { tourId: t.id, departureKey: tag + hours + randomUUID(), startAt, endAt: new Date(+startAt + 3600000), capacity: 20, status: 'on_sale', bookingCutoffMinutes: 60, ...extra } }); };
  const dA = await dep(tour, 120), dB = await dep(tour, 144), dC = await dep(tour, 168), dFull = await dep(tour, 192, { capacity: 1 }), dOther = await dep(other, 130), dPast = await dep(tour, 6), dSoon = await dep(tour, 30);
  // dC costs more: a ticket-specific override for its calendar day only.
  await p.pricingRule.create({ data: { name: tag + ' peak', tourId: tour.id, ticketTypeId: tk.id, validFrom: new Date(+dC.startAt - 3600000), validTo: new Date(+dC.startAt + 3600000), overridePriceCents: 9000 } });
  const book = async (d: any, t: any, qty = 2, source = 'phone', channelId?: string) => {
    const r: any = await createChannelBooking(null, { idempotencyKey: key(), input: { departureId: d.id, source, channelId, paymentMethod: 'cash', tickets: [{ id: t.id, qty }], lead: { name: 'Self Service', email: tag + randomUUID().slice(0, 4) + '@guest.example' }, participants: Array.from({ length: qty }, (_, i) => ({ ticketTypeId: t.id, fullName: 'Guest ' + i, age: 30 })) } }, ops);
    return p.booking.findUnique({ where: { bookingRef: r.bookingRef } });
  };
  const tokenOf = (b: any) => manageToken(b.id);
  const args = (b: any, extra: any = {}) => ({ bookingRef: b.bookingRef, token: tokenOf(b), ...extra });

  // 1. Proof: wrong token, other booking's token, lowercase ref ok, no session needed.
  const b1 = await book(dA, tk), b2 = await book(dA, tk);
  await assert.rejects(() => manageBooking(null, { bookingRef: b1.bookingRef, token: 'x'.repeat(43) }, anon), /Booking not found/);
  await assert.rejects(() => manageBooking(null, { bookingRef: b1.bookingRef, token: tokenOf(b2) }, anon), /Booking not found/);
  await assert.rejects(() => manageBooking(null, { bookingRef: 'TG-NOPE0000', token: tokenOf(b1) }, anon), /Booking not found/);
  const v: any = await manageBooking(null, { bookingRef: b1.bookingRef.toLowerCase(), token: tokenOf(b1) }, anon);
  assert.equal(v.canChange, true); assert.equal(v.refundIfCancelledCents, 12000); assert.equal(v.policy[0], 'Full refund up to 2 days before the start');
  assert.ok(!JSON.stringify(v).includes('@guest.example'), 'no email in the view'); assert.ok(!JSON.stringify(v).includes('medical'));
  // Options: same tour, same price only (B yes; C priced 9000 no; full no; other tour no; soon departure inside window yes; past/cutoff no).
  const optIds = v.options.map((o: any) => o.id);
  assert.ok(optIds.includes(dB.id) && optIds.includes(dSoon.id)); assert.ok(!optIds.includes(dC.id), 'different price excluded'); assert.ok(!optIds.includes(dFull.id), 'no room excluded'); assert.ok(!optIds.includes(dOther.id), 'other tour excluded'); assert.ok(!optIds.includes(dA.id), 'current excluded');
  // 2. Reschedule: the SAME booking moves (code, token, payment, participants stay), audited, replays by key, no extra rows.
  const rkey = key(); const before = await p.booking.count({ where: { guestEmail: b1.guestEmail } });
  const moved: any = await rescheduleManagedBooking(null, args(b1, { departureId: dB.id, idempotencyKey: rkey }), anon);
  const nb = await p.booking.findUnique({ where: { id: b1.id }, include: { payments: true, participants: true, hold: true } });
  assert.equal(moved.bookingRef, b1.bookingRef); assert.equal(moved.manageToken, tokenOf(b1));
  assert.deepEqual([nb.departureId, nb.status, nb.totalCents, nb.seats, nb.payments.length, nb.payments[0].amount, nb.participants.length], [dB.id, 'confirmed', b1.totalCents, 2, 1, b1.totalCents, 2]);
  assert.equal(nb.hold.departureId, dB.id); assert.equal(new Date(nb.tourSnapshot.startAt).getTime(), dB.startAt.getTime());
  assert.equal(await p.booking.count({ where: { guestEmail: b1.guestEmail } }), before, 'no second booking');
  const ev = await p.auditEvent.findMany({ where: { action: 'booking.self_rescheduled', targetId: b1.id } }); assert.equal(ev.length, 1); assert.equal(ev[0].before.departureId, dA.id); assert.equal(ev[0].after.departureId, dB.id);
  const again: any = await rescheduleManagedBooking(null, args(b1, { departureId: dB.id, idempotencyKey: rkey }), anon);
  assert.equal(again.bookingRef, moved.bookingRef, 'same key replays'); assert.equal(await p.auditEvent.count({ where: { action: 'booking.self_rescheduled', targetId: b1.id } }), 1);
  await assert.rejects(() => rescheduleManagedBooking(null, args(b1, { departureId: dB.id, idempotencyKey: key() }), anon), /different departure/);
  assert.equal(((await manageBooking(null, args(b1), anon)) as any).startAt.getTime(), dB.startAt.getTime(), 'the view shows the new time');
  assert.equal(await p.auditEvent.count({ where: { action: 'booking.self_rescheduled', targetId: b1.id } }), 1);
  // Moving back works (it is just another departure of the tour) and then a refund still has the original payment to draw on.
  await rescheduleManagedBooking(null, args(b1, { departureId: dA.id, idempotencyKey: key() }), anon);
  await cancelManagedBooking(null, args(b1, { idempotencyKey: key() }), anon);
  assert.deepEqual([(await p.booking.findUnique({ where: { id: b1.id } })).status, (await p.payment.findFirst({ where: { orderId: b1.id } })).status], ['refunded', 'refunded']);
  // 3. Refusals: different price, no room, other tour, same departure.
  await assert.rejects(() => rescheduleManagedBooking(null, args(b2, { departureId: dC.id, idempotencyKey: key() }), anon), /priced differently/);
  await assert.rejects(() => rescheduleManagedBooking(null, args(b2, { departureId: dFull.id, idempotencyKey: key() }), anon), /seats/i);
  await assert.rejects(() => rescheduleManagedBooking(null, args(b2, { departureId: dOther.id, idempotencyKey: key() }), anon), /same tour/);
  await assert.rejects(() => rescheduleManagedBooking(null, args(b2, { departureId: dA.id, idempotencyKey: key() }), anon), /different departure/);
  assert.equal((await p.booking.findUnique({ where: { id: b2.id } })).status, 'confirmed', 'refusals change nothing');
  // 4. Cancel under policy: 5 days out = full refund through issueRefund; replay; second token use refused.
  const c1 = await book(dA, tk, 1);
  const ck = key();
  const r1: any = await cancelManagedBooking(null, args(c1, { idempotencyKey: ck }), anon);
  assert.deepEqual([r1.status, r1.refundCents, r1.replay], ['refunded', 6000, false]);
  const refunds = await p.refund.findMany({ where: { orderId: c1.id } }); assert.equal(refunds.length, 1); assert.equal(refunds[0].amount, 6000); assert.equal(refunds[0].status, 'succeeded');
  assert.equal(refunds[0].approvedById, null, 'policy refund is guest-initiated: no approval row');
  const r2: any = await cancelManagedBooking(null, args(c1, { idempotencyKey: key() }), anon);
  assert.equal(r2.replay, true); assert.equal(await p.refund.count({ where: { orderId: c1.id } }), 1, 'double click refunds once');
  assert.equal(await p.auditEvent.count({ where: { action: 'booking.cancelled', targetId: c1.id } }), 1);
  // 5. Partial tier: 30h out is inside the 48h tier, so 50%; 6h out is inside 12h, so nothing.
  const c2 = await book(dSoon, tk, 2); const r3: any = await cancelManagedBooking(null, args(c2, { idempotencyKey: key() }), anon);
  assert.deepEqual([r3.refundCents, r3.status], [6000, 'cancelled']); assert.equal((await p.booking.findUnique({ where: { id: c2.id } })).refundedCents, 6000);
  const c3 = await book(dPast, tk, 1); const r4: any = await cancelManagedBooking(null, args(c3, { idempotencyKey: key() }), anon);
  assert.deepEqual([r4.refundCents, r4.status], [0, 'cancelled']); assert.equal(await p.refund.count({ where: { orderId: c3.id } }), 0);
  // 6. Inside the operator's cutoff: both actions refused, nothing changes. Cutoff raised after booking, as an operator would.
  const d3 = await book(dA, tk, 1); await p.departure.update({ where: { id: dA.id }, data: { bookingCutoffMinutes: 120 * 60 + 5 } });
  const vv: any = await manageBooking(null, args(d3), anon); assert.equal(vv.canChange, false); assert.match(vv.reason, /closed/); assert.deepEqual(vv.options, []);
  await assert.rejects(() => cancelManagedBooking(null, args(d3, { idempotencyKey: key() }), anon), /closed/);
  await assert.rejects(() => rescheduleManagedBooking(null, args(d3, { departureId: dB.id, idempotencyKey: key() }), anon), /closed/);
  assert.equal((await p.booking.findUnique({ where: { id: d3.id } })).status, 'confirmed'); assert.equal(await p.refund.count({ where: { orderId: d3.id } }), 0);
  await p.departure.update({ where: { id: dA.id }, data: { bookingCutoffMinutes: 60 } });
  // 7. Reseller bookings are the reseller's to change.
  const ch = await p.channel.create({ data: { name: tag + ' reseller', commissionBps: 1000, active: true, settlementMode: 'channel_collects' } }).catch(() => p.channel.create({ data: { name: tag + ' reseller', commissionBps: 1000, active: true } }));
  const rb = await book(dB, tk, 1, 'reseller', ch.id); const rv: any = await manageBooking(null, args(rb), anon);
  assert.equal(rv.canChange, false); assert.match(rv.reason, /reseller/);
  await assert.rejects(() => cancelManagedBooking(null, args(rb, { idempotencyKey: key() }), anon), /reseller/);
  // 8. Weather-cancelled / checked-in-style states are not self-service.
  const ws = await book(dB, tk, 1); await p.booking.update({ where: { id: ws.id }, data: { status: 'checked_in' } });
  assert.equal(((await manageBooking(null, args(ws), anon)) as any).canChange, false);
  console.log('PASS self-service: proof, view, same-price reschedule, policy cancel, idempotency, cutoff and reseller refusals, audit');
  await p.$disconnect();
}
main().catch(async e => { console.error(e); await p.$disconnect(); process.exit(1); });
