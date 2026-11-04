import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { assignResource, unassignResource } from '../features/keystone/mutations/tour-operations';
import { createChannelBooking } from '../features/keystone/mutations/tour-checkout';
const p: any = new PrismaClient(), tag = 'depth-' + randomUUID();
const key = () => tag + randomUUID();
async function main() {
  const role = await p.role.create({ data: { name: tag, canManageResources: true, canManageBookings: true, canManagePayments: true } });
  const user = await p.user.create({ data: { name: tag, email: tag + '@test.example', password: 'disabled-runtime-fixture', roleId: role.id } });
  const plain = await p.role.create({ data: { name: tag + '-plain', canManageBookings: true } });
  const nobody = await p.user.create({ data: { name: tag + '-plain', email: tag + '-plain@test.example', password: 'disabled-runtime-fixture', roleId: plain.id } });
  const c: any = { prisma: p, session: { itemId: user.id, data: { role } } }, cn: any = { prisma: p, session: { itemId: nobody.id, data: { role: plain } } };
  const tour = await p.tour.create({ data: { name: tag, slug: tag, status: 'active', maxParticipants: 20, requiresResourceKind: 'van' } });
  const ticket = await p.ticketType.create({ data: { tourId: tour.id, name: 'Adult', priceCents: 1000, active: true, seatsUsed: 1, countsTowardCapacity: true } });
  const van = await p.resource.create({ data: { name: tag + '-van', kind: 'van', seats: 5, quantity: 1, status: 'active' } });
  const boat = await p.resource.create({ data: { name: tag + '-boat', kind: 'boat', seats: 30, quantity: 1, status: 'active' } });
  const t0 = Date.now() + 9 * 86400000;
  const mk = (offsetH: number, durH = 2) => p.departure.create({ data: { tourId: tour.id, departureKey: tag + offsetH, startAt: new Date(t0 + offsetH * 3600000), endAt: new Date(t0 + (offsetH + durH) * 3600000), capacity: 20, status: 'on_sale' } });
  const d1 = await mk(0), d2 = await mk(1), d3 = await mk(5);
  const as = (c2: any, dep: any, res: any, quantity = 1, k = key()) => assignResource(null, { input: { departureId: dep.id, resourceId: res.id, quantity }, idempotencyKey: k }, c2);
  // Assign sets capacity to the vehicle's seats; replay returns the same assignment.
  const k1 = key(); const a1 = await as(c, d1, van, 1, k1);
  assert.equal((await p.departure.findUnique({ where: { id: d1.id } })).capacity, 5);
  assert.equal((await as(c, d1, van, 1, k1)).id, a1.id);
  assert.equal(await p.resourceAssignment.count({ where: { departureId: d1.id } }), 1);
  // Conflicts: the single van is already out on an overlapping departure; a non-overlapping one is fine.
  await assert.rejects(() => as(c, d2, van), /overlaps another departure/);
  assert.equal(await p.resourceAssignment.count({ where: { departureId: d2.id } }), 0);
  await as(c, d3, van);
  // Wrong kind, bad quantity, no permission.
  await assert.rejects(() => as(c, d2, boat), /does not satisfy this tour/);
  await assert.rejects(() => as(c, d2, van, 2), /Invalid resource quantity/);
  await assert.rejects(() => as(cn, d2, van), /./);
  // Reservations above the vehicle's seats block a smaller vehicle.
  const dBig = await mk(30);
  await p.resourceAssignment.deleteMany({ where: { departureId: d3.id } });
  const small = await p.resource.create({ data: { name: tag + '-small', kind: 'van', seats: 2, quantity: 1, status: 'active' } });
  await p.departure.update({ where: { id: dBig.id }, data: { status: 'on_sale' } });
  await createChannelBooking(null, { idempotencyKey: key(), input: { departureId: dBig.id, source: 'phone', paymentMethod: 'cash', tickets: [{ id: ticket.id, qty: 3 }], lead: { name: 'Seat Guest', email: 'guest@test.example' }, participants: [0, 1, 2].map(n => ({ ticketTypeId: ticket.id, fullName: 'G' + n, age: 30 })) } }, c);
  await assert.rejects(() => as(c, dBig, small), /Resource seats below active reservations/);
  // Unassign: removes the assignment, audited, replay-safe; refuses when nothing is assigned; needs the permission.
  const ku = key(); const u1 = await unassignResource(null, { input: { departureId: d1.id }, idempotencyKey: ku }, c);
  assert.equal(u1.removed, 1); assert.equal(await p.resourceAssignment.count({ where: { departureId: d1.id } }), 0);
  assert.equal((await unassignResource(null, { input: { departureId: d1.id }, idempotencyKey: ku }, c)).removed, 1);
  assert.equal(await p.auditEvent.count({ where: { action: 'resource.unassigned', targetId: d1.id } }), 1);
  await assert.rejects(() => unassignResource(null, { input: { departureId: d1.id }, idempotencyKey: key() }, c), /No resource is assigned/);
  await assert.rejects(() => unassignResource(null, { input: { departureId: d1.id }, idempotencyKey: key() }, cn), /./);
  // Freed van can now take the overlapping departure.
  await as(c, d2, van);
  assert.equal(await p.resourceAssignment.count({ where: { resourceId: van.id } }), 1);
  // A finished departure keeps its resources.
  await p.departure.update({ where: { id: d2.id }, data: { status: 'completed' } });
  await assert.rejects(() => unassignResource(null, { input: { departureId: d2.id }, idempotencyKey: key() }, c), /finished/);
  console.log('PASS resource assignment');
  await p.$disconnect();
}
main().catch(async e => { console.error(e); await p.$disconnect(); process.exit(1); });
