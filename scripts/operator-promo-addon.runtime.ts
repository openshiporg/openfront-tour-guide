import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { createChannelBooking, operatorBookingByKey } from '../features/keystone/mutations/tour-checkout';
const p: any = new PrismaClient(), tag = 'depth-' + randomUUID();
const key = () => tag + randomUUID();
async function main() {
  const role = await p.role.create({ data: { name: tag, canManageBookings: true, canManagePayments: true } });
  const user = await p.user.create({ data: { name: tag, email: tag + '@test.example', password: 'disabled-runtime-fixture', roleId: role.id } });
  const c: any = { prisma: p, session: { itemId: user.id, data: { role } } };
  const tour = await p.tour.create({ data: { name: tag, slug: tag, status: 'active', maxParticipants: 100 } });
  const ticket = await p.ticketType.create({ data: { tourId: tour.id, name: 'Adult', priceCents: 10000, active: true, seatsUsed: 1, countsTowardCapacity: true } });
  const addOn = await p.addOn.create({ data: { tourId: tour.id, name: 'Photo pack', priceCents: 2500, inventory: 2 } });
  const promo = await p.promoCode.create({ data: { code: 'DEPTHPROMO' + tag.slice(6, 12).toUpperCase().replace(/[^A-Z0-9]/g, 'X'), discountType: 'percent_bps', value: 1000, maxUses: 1, status: 'active' } });
  const startAt = new Date(Date.now() + 7 * 86400000);
  const dep = await p.departure.create({ data: { tourId: tour.id, departureKey: tag, startAt, endAt: new Date(+startAt + 3600000), capacity: 20, status: 'on_sale' } });
  const mk = (extra: any, qty = 1) => ({ departureId: dep.id, source: 'phone', paymentMethod: 'cash', tickets: [{ id: ticket.id, qty }], lead: { name: 'Promo Guest', email: 'guest@test.example' }, participants: Array.from({ length: qty }, (_, n) => ({ ticketTypeId: ticket.id, fullName: 'Guest ' + n, age: 30 })), ...extra });
  // Add-on only: 10000 + 2500, one line each, payment recorded.
  const k1 = key(); const a = await createChannelBooking(null, { idempotencyKey: k1, input: mk({ addOns: [{ id: addOn.id, qty: 1 }] }) }, c);
  const ba = await p.booking.findUnique({ where: { bookingRef: a.bookingRef }, include: { lines: true, payments: true } });
  assert.equal(ba.totalCents, 12500); assert.equal(ba.addOnsCents, 2500); assert.equal(ba.lines.length, 2); assert.equal(ba.seats, 1); assert.equal(ba.payments[0].amount, 12500);
  // Replay returns the same booking; recovery by key finds it.
  assert.equal((await createChannelBooking(null, { idempotencyKey: k1, input: mk({ addOns: [{ id: addOn.id, qty: 1 }] }) }, c)).bookingRef, a.bookingRef);
  assert.equal((await operatorBookingByKey(null, { idempotencyKey: k1 }, c)).bookingRef, a.bookingRef);
  // Add-on inventory: 1 sold, 1 left; asking for 2 is refused and books nothing.
  const before = await p.booking.count({ where: { departureId: dep.id } });
  await assert.rejects(() => createChannelBooking(null, { idempotencyKey: key(), input: mk({ addOns: [{ id: addOn.id, qty: 2 }] }) }, c), /Add-on unavailable/);
  assert.equal(await p.booking.count({ where: { departureId: dep.id } }), before);
  // Promo: 10% off 10000 = 1000; redemption committed, usedCount 1.
  const k2 = key(); const b = await createChannelBooking(null, { idempotencyKey: k2, input: mk({ promoCode: promo.code.toLowerCase() }) }, c);
  const bb = await p.booking.findUnique({ where: { bookingRef: b.bookingRef }, include: { payments: true } });
  assert.equal(bb.discountCents, 1000); assert.equal(bb.totalCents, 9000); assert.equal(bb.payments[0].amount, 9000); assert.equal((bb.tourSnapshot as any).promo.code, promo.code);
  const red = await p.promoRedemption.findMany({ where: { bookingId: bb.id } });
  assert.equal(red.length, 1); assert.equal(red[0].status, 'committed'); assert.equal(red[0].amountCents, 1000);
  assert.equal((await p.promoCode.findUnique({ where: { id: promo.id } })).usedCount, 1);
  // Replay does not redeem twice.
  await createChannelBooking(null, { idempotencyKey: k2, input: mk({ promoCode: promo.code.toLowerCase() }) }, c);
  assert.equal((await p.promoCode.findUnique({ where: { id: promo.id } })).usedCount, 1);
  // Promo fully used / invalid; combined promo + add-on on a fresh code.
  await assert.rejects(() => createChannelBooking(null, { idempotencyKey: key(), input: mk({ promoCode: promo.code }) }, c), /fully used/);
  await assert.rejects(() => createChannelBooking(null, { idempotencyKey: key(), input: mk({ promoCode: 'NOPE-NOPE' }) }, c), /Promo code is not valid/);
  const promo2 = await p.promoCode.create({ data: { code: promo.code + 'B', discountType: 'amount_cents', value: 500, status: 'active' } });
  const both = await createChannelBooking(null, { idempotencyKey: key(), input: mk({ promoCode: promo2.code, addOns: [{ id: addOn.id, qty: 1 }] }) }, c);
  const bo = await p.booking.findUnique({ where: { bookingRef: both.bookingRef } });
  assert.equal(bo.totalCents, 12000); assert.equal(bo.discountCents, 500);
  assert.equal((await p.promoCode.findUnique({ where: { id: promo2.id } })).usedCount, 1);
  // Refunding-and-cancelling releases a committed promo (existing behaviour) - the redemption row is the same shape the online path writes.
  console.log('PASS operator promo + add-on fast path');
  await p.$disconnect();
}
main().catch(async e => { console.error(e); await p.$disconnect(); process.exit(1); });
