// Scratch-DB proof of the operator "Move" (phone change of date): options, in-place move (same booking/payment/participants/link),
// audit with staff actor and reason, replay by key, refusals (permission, reason, price, room, other tour, reseller, state, started,
// target cutoff), staff may move inside the guest cutoff, and two concurrent moves into the last seat sell it once. Fixtures are depth-*.
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { createChannelBooking } from '../features/keystone/mutations/tour-checkout';
import { moveBooking, bookingMoveOptions, manageBooking, manageToken } from '../features/keystone/mutations/tour-self-service';
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
  const other = await p.tour.create({ data: { name: tag + ' other', slug: tag + 'o', status: 'active', maxParticipants: 100 } });
  const tk = await p.ticketType.create({ data: { tourId: tour.id, name: 'Adult', priceCents: 4000, active: true, seatsUsed: 1, countsTowardCapacity: true } });
  await p.ticketType.create({ data: { tourId: other.id, name: 'Adult', priceCents: 4000, active: true, seatsUsed: 1, countsTowardCapacity: true } });
  const dep = (t: any, hours: number, extra: any = {}) => { const startAt = new Date(Date.now() + hours * 3600000); return p.departure.create({ data: { tourId: t.id, departureKey: tag + hours + randomUUID(), startAt, endAt: new Date(+startAt + 3600000), capacity: 20, status: 'on_sale', bookingCutoffMinutes: 60, ...extra } }); };
  const dA = await dep(tour, 72), dB = await dep(tour, 96), dPeak = await dep(tour, 120), dOne = await dep(tour, 20, { capacity: 1 }) /* inside 24h: channel allocations do not reserve seats */, dOther = await dep(other, 100), dClosing = await dep(tour, 0.5);
  await p.pricingRule.create({ data: { name: tag + ' peak', tourId: tour.id, ticketTypeId: tk.id, validFrom: new Date(+dPeak.startAt - 3600000), validTo: new Date(+dPeak.startAt + 3600000), overridePriceCents: 5500 } });
  const book = async (d: any, qty = 1, source = 'phone', channelId?: string) => {
    const r: any = await createChannelBooking(null, { idempotencyKey: key(), input: { departureId: d.id, source, channelId, paymentMethod: 'cash', tickets: [{ id: tk.id, qty }], lead: { name: 'Phone Move', email: tag + randomUUID().slice(0, 4) + '@guest.example' }, participants: Array.from({ length: qty }, (_, i) => ({ ticketTypeId: tk.id, fullName: 'Guest ' + i, age: 30 })) } }, ops);
    return p.booking.findUnique({ where: { bookingRef: r.bookingRef } });
  };
  const mv = (b: any, departureId: string, k = key(), ctx = ops, reason = 'Guest phoned to change the date') => moveBooking(null, { input: { bookingId: b.id, departureId, reason }, idempotencyKey: k }, ctx);

  const b = await book(dA, 2);
  // Options: same tour, same price, with room; excludes the current, peak-priced, other-tour and closing departures.
  const opt: any = await bookingMoveOptions(null, { bookingId: b.id }, ops);
  const ids = opt.options.map((o: any) => o.id);
  assert.equal(opt.canMove, true); assert.ok(ids.includes(dB.id)); assert.ok(!ids.includes(dA.id) && !ids.includes(dPeak.id) && !ids.includes(dOther.id) && !ids.includes(dOne.id) && !ids.includes(dClosing.id));
  await assert.rejects(() => bookingMoveOptions(null, { bookingId: b.id }, guide), /Not authorized/);

  // Refusals, nothing changes.
  await assert.rejects(() => mv(b, dB.id, key(), anon), /Not authorized/);
  await assert.rejects(() => mv(b, dB.id, key(), guide), /Not authorized/);
  await assert.rejects(() => mv(b, dB.id, key(), ops, ' '), /reason is required/);
  await assert.rejects(() => mv(b, dPeak.id), /priced differently/);
  await assert.rejects(() => mv(b, dOne.id), /Not enough seats/);
  await assert.rejects(() => mv(b, dOther.id), /same tour/);
  await assert.rejects(() => mv(b, dClosing.id), /not open for booking/);
  await assert.rejects(() => mv(b, dA.id), /different departure/);
  assert.equal((await p.booking.findUnique({ where: { id: b.id } })).departureId, dA.id, 'refusals change nothing');

  // Success: same booking moves; payment, participants, hold, code and guest link stay; audited with actor and reason; replay by key.
  const k = key();
  const r: any = await mv(b, dB.id, k);
  assert.equal(r.bookingRef, b.bookingRef); assert.equal(new Date(r.startAt).getTime(), dB.startAt.getTime());
  const nb = await p.booking.findUnique({ where: { id: b.id }, include: { payments: true, participants: true, hold: true } });
  assert.deepEqual([nb.departureId, nb.status, nb.totalCents, nb.payments.length, nb.participants.length, nb.hold.departureId], [dB.id, 'confirmed', b.totalCents, 1, 2, dB.id]);
  assert.equal(new Date(nb.tourSnapshot.startAt).getTime(), dB.startAt.getTime());
  const ev = await p.auditEvent.findMany({ where: { action: 'booking.moved', targetId: b.id } });
  assert.equal(ev.length, 1); assert.deepEqual([ev[0].actorId, ev[0].reason, ev[0].before.departureId, ev[0].after.departureId], [user.id, 'Guest phoned to change the date', dA.id, dB.id]);
  const again: any = await mv(b, dB.id, k); assert.equal(again.bookingRef, b.bookingRef);
  assert.equal(await p.auditEvent.count({ where: { action: 'booking.moved', targetId: b.id } }), 1, 'replay writes nothing');
  assert.equal((await manageBooking(null, { bookingRef: b.bookingRef, token: manageToken(b.id) }, anon) as any).startAt.getTime(), dB.startAt.getTime(), 'guest link still works and shows the new time');

  // Staff may move inside the guest's self-service cutoff (until the departure starts); the guest could not.
  const late = await book(dA, 1);
  await p.departure.update({ where: { id: dA.id }, data: { bookingCutoffMinutes: 72 * 60 + 5 } });
  assert.equal((await manageBooking(null, { bookingRef: late.bookingRef, token: manageToken(late.id) }, anon) as any).canChange, false);
  await mv(late, dB.id); assert.equal((await p.booking.findUnique({ where: { id: late.id } })).departureId, dB.id);
  await p.departure.update({ where: { id: dA.id }, data: { bookingCutoffMinutes: 60 } });

  // Started departure, reseller and non-confirmed bookings are refused.
  const started = await book(dA, 1); await p.departure.update({ where: { id: dA.id }, data: { startAt: new Date(Date.now() - 60000) } });
  await assert.rejects(() => mv(started, dB.id), /has started/);
  assert.equal((await bookingMoveOptions(null, { bookingId: started.id }, ops) as any).canMove, false);
  await p.departure.update({ where: { id: dA.id }, data: { startAt: dA.startAt } });
  const ch = await p.channel.create({ data: { name: tag + ' reseller', commissionBps: 1000, active: true } });
  const rb = await book(dA, 1, 'reseller', ch.id); await assert.rejects(() => mv(rb, dB.id), /reseller/);
  const ci = await book(dA, 1); await p.booking.update({ where: { id: ci.id }, data: { status: 'checked_in' } });
  await assert.rejects(() => mv(ci, dB.id), /Only a confirmed booking/);

  // Last seat: two concurrent moves into dOne (capacity 1) sell it once.
  const x = await book(dA, 1), y = await book(dA, 1);
  const res = await Promise.allSettled([mv(x, dOne.id), mv(y, dOne.id)]);
  assert.equal(res.filter((q) => q.status === 'fulfilled').length, 1, 'exactly one move wins');
  assert.match(String((res.find((q) => q.status === 'rejected') as any).reason?.message), /Not enough seats|not open for booking/); // the winner flips the departure to full
  assert.equal(await p.booking.count({ where: { departureId: dOne.id, status: 'confirmed' } }), 1);
  console.log('PASS operator-move: options, refusals (permission, reason, price, room, tour, closing target, same), in-place move with audit and replay, guest link kept, staff past guest cutoff, started/reseller/state refusals, last-seat race');
  await p.$disconnect();
}
main().catch(async e => { console.error(e); await p.$disconnect(); process.exit(1); });
