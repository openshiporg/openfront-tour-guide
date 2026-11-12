import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { pricingRuleBoard, savePricingRule, removePricingRule } from '../features/keystone/mutations/tour-pricing-rules';
import { createChannelBooking } from '../features/keystone/mutations/tour-checkout';

// Real rows on the scratch DB: save/edit/remove, replay, wrong-tour refusal, revoked access, and the price a phone booking is actually sold at.
const p: any = new PrismaClient(), tag = 'b7price-' + randomUUID().slice(0, 8);
const key = () => tag + randomUUID();
async function main() {
  const role = await p.role.create({ data: { name: tag, canManageTours: true, canManageBookings: true, canManageDepartures: true } });
  const noRole = await p.role.create({ data: { name: tag + '-none', canManageBookings: true } });
  const user = await p.user.create({ data: { name: tag, email: tag + '@test.example', password: 'disabled-runtime-fixture', roleId: role.id } });
  const other = await p.user.create({ data: { name: tag + 'n', email: tag + 'n@test.example', password: 'disabled-runtime-fixture', roleId: noRole.id } });
  const c = { prisma: p, session: { itemId: user.id, data: { role } } }, cNo = { prisma: p, session: { itemId: other.id, data: { role: noRole } } };
  const tour = await p.tour.create({ data: { name: tag, slug: tag, status: 'active', maxParticipants: 50, timezone: 'America/New_York' } });
  const tour2 = await p.tour.create({ data: { name: tag + '2', slug: tag + '2', status: 'active', maxParticipants: 50 } });
  const adult = await p.ticketType.create({ data: { tourId: tour.id, name: 'Adult', priceCents: 5000, active: true, seatsUsed: 1, countsTowardCapacity: true } });
  const child = await p.ticketType.create({ data: { tourId: tour.id, name: 'Child', priceCents: 3000, active: true, seatsUsed: 1, countsTowardCapacity: true } });
  const foreign = await p.ticketType.create({ data: { tourId: tour2.id, name: 'Adult', priceCents: 1000, active: true } });
  // A Saturday departure 3 weeks out, 10:00 New York.
  const sat = new Date(); sat.setUTCDate(sat.getUTCDate() + 21); while (sat.getUTCDay() !== 6) sat.setUTCDate(sat.getUTCDate() + 1);
  const day = sat.toISOString().slice(0, 10), startAt = new Date(`${day}T15:00:00Z`), endAt = new Date(+startAt + 3600000);
  const dep = await p.departure.create({ data: { tourId: tour.id, departureKey: tag, startAt, endAt, capacity: 50, status: 'on_sale' } });
  const sell = async (ticket: any) => {
    const b = await createChannelBooking(null, { input: { departureId: dep.id, source: 'phone', paymentMethod: 'cash', tickets: [{ id: ticket.id, qty: 1 }], lead: { name: 'Price Check', email: 'g@test.example' }, participants: [{ ticketTypeId: ticket.id, fullName: 'Price Check', age: 30 }] }, idempotencyKey: key() }, c);
    return (await p.booking.findUnique({ where: { bookingRef: b.bookingRef } })).subtotalCents;
  };
  try {
    assert.equal(await sell(adult), 5000, 'no rule: listed price');
    const input = { tourId: tour.id, name: 'Saturdays +20%', from: day, to: day, weekdays: [6], adjustBps: 2000 };
    const args = { input, idempotencyKey: key() };
    const saved = await savePricingRule(null, args, c);
    assert.equal((await savePricingRule(null, args, c)).id, saved.id, 'replay returns the same rule');
    assert.equal(await p.pricingRule.count({ where: { tourId: tour.id } }), 1, 'replay did not add a second rule');
    await assert.rejects(() => savePricingRule(null, { input: { ...input, name: 'changed' }, idempotencyKey: args.idempotencyKey }, c), /different request/);
    assert.equal(await sell(adult), 6000, 'percentage rule sells at +20%');
    assert.equal(await sell(child), 3600);
    // Ticket-specific fixed price beats the tour-wide rule, for that ticket only.
    const fixed = await savePricingRule(null, { input: { tourId: tour.id, ticketTypeId: adult.id, name: 'Adult flat', overridePriceCents: 7500 }, idempotencyKey: key() }, c);
    assert.equal(await sell(adult), 7500); assert.equal(await sell(child), 3600);
    // Edit it back to a discount; an earlier booking is untouched.
    const before = await p.booking.count({ where: { departureId: dep.id } });
    await savePricingRule(null, { input: { id: fixed.id, tourId: tour.id, ticketTypeId: adult.id, name: 'Adult flat', overridePriceCents: 4000 }, idempotencyKey: key() }, c);
    assert.equal(await sell(adult), 4000);
    assert.equal((await p.booking.findMany({ where: { departureId: dep.id }, orderBy: { createdAt: 'asc' } }))[3].subtotalCents, 7500, 'earlier booking keeps its price');
    assert.ok(before >= 3);
    // Refusals.
    await assert.rejects(() => savePricingRule(null, { input: { tourId: tour.id, name: 'x' }, idempotencyKey: key() }, c), /either a percentage/);
    await assert.rejects(() => savePricingRule(null, { input: { tourId: tour.id, ticketTypeId: foreign.id, name: 'x', adjustBps: 100 }, idempotencyKey: key() }, c), /not on this tour/);
    await assert.rejects(() => savePricingRule(null, { input: { id: fixed.id, tourId: tour2.id, name: 'x', adjustBps: 100 }, idempotencyKey: key() }, c), /not found/);
    await assert.rejects(() => savePricingRule(null, { input, idempotencyKey: key() }, cNo), /Not authorized/);
    await assert.rejects(() => pricingRuleBoard(null, {}, cNo), /Not authorized/);
    await assert.rejects(() => removePricingRule(null, { input: { id: fixed.id }, idempotencyKey: key() }, cNo), /Not authorized/);
    // Board shows the saved window as the tour's local days; remove restores the tour-wide price.
    const board = await pricingRuleBoard(null, {}, c); const row = board.rules.find((r: any) => r.id === saved.id);
    assert.deepEqual([row.from, row.to, row.weekdays, row.adjustBps], [day, day, [6], 2000]);
    const rm = { input: { id: fixed.id }, idempotencyKey: key() };
    await removePricingRule(null, rm, c); assert.equal((await removePricingRule(null, rm, c)).id, fixed.id, 'remove replays');
    await assert.rejects(() => removePricingRule(null, { input: { id: fixed.id }, idempotencyKey: key() }, c), /not found/);
    assert.equal(await sell(adult), 6000);
    const actions = (await p.auditEvent.findMany({ where: { targetList: 'PricingRule', actorId: user.id }, select: { action: true } })).map((a: any) => a.action).sort();
    assert.deepEqual(actions, ['pricing_rule.created', 'pricing_rule.created', 'pricing_rule.removed', 'pricing_rule.updated'], 'one audit row per change, none for replays');
    console.log('PASS pricing-rules runtime');
  } finally {
    await p.auditEvent.deleteMany({ where: { OR: [{ actorId: user.id }, { targetId: { in: (await p.pricingRule.findMany({ where: { tourId: { in: [tour.id, tour2.id] } }, select: { id: true } })).map((r: any) => r.id) } }] } });
    await p.pricingRule.deleteMany({ where: { tourId: { in: [tour.id, tour2.id] } } });
    const bookings = await p.booking.findMany({ where: { departureId: dep.id }, select: { id: true } });
    const ids = bookings.map((b: any) => b.id);
    for (const m of ['participant', 'bookingLine', 'payment']) { try { await p[m].deleteMany({ where: m === 'payment' ? { orderId: { in: ids } } : { bookingId: { in: ids } } }); } catch { /* shape differs */ } }
    await p.booking.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
    await p.departure.deleteMany({ where: { id: dep.id } }).catch(() => {});
    await p.ticketType.deleteMany({ where: { tourId: { in: [tour.id, tour2.id] } } }).catch(() => {});
    await p.tour.deleteMany({ where: { id: { in: [tour.id, tour2.id] } } }).catch(() => {});
    await p.user.deleteMany({ where: { id: { in: [user.id, other.id] } } }).catch(() => {});
    await p.role.deleteMany({ where: { id: { in: [role.id, noRole.id] } } }).catch(() => {});
  }
}
main().then(() => p.$disconnect()).catch(async (e) => { console.error('FAIL', e?.message || e); await p.$disconnect(); process.exit(1); });
