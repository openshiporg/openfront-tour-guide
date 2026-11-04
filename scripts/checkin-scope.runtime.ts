// Scratch-DB proof that check-in is scoped: guides see only their own accepted departures; operations staff see all. Fixtures are depth-*.
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { createChannelBooking } from '../features/keystone/mutations/tour-checkout';
import { departuresInRange, departureManifest } from '../features/keystone/mutations/tour-manifest';
import { checkInParticipant, markNoShow } from '../features/keystone/mutations/tour-operations';
import { captureWaiverOnSite, participantWaiver } from '../features/keystone/mutations/tour-waiver-capture';
import { pickupSheet } from '../features/keystone/mutations/tour-guide-day';
const p: any = new PrismaClient(), tag = 'depth-' + randomUUID().slice(0, 8);
const key = () => tag + randomUUID();
async function main() {
  const mk = async (suffix: string, perms: any) => {
    const role = await p.role.create({ data: { name: tag + suffix, ...perms } });
    const user = await p.user.create({ data: { name: tag + suffix, email: tag + suffix + '@test.example', password: 'disabled-runtime-fixture', roleId: role.id } });
    return { user, ctx: { prisma: p, session: { itemId: user.id, data: { role } } } as any };
  };
  const ops = await mk('ops', { canManageBookings: true, canManagePayments: true, canCheckIn: true, canManageDepartures: true });
  const bookingsOnly = await mk('bk', { canManageBookings: true, canCheckIn: true });
  const g1 = await mk('g1', { canCheckIn: true }), g2 = await mk('g2', { canCheckIn: true }), nolink = await mk('nl', { canCheckIn: true });
  const guide1 = await p.guide.create({ data: { name: tag + ' One', userId: g1.user.id, status: 'active' } });
  const guide2 = await p.guide.create({ data: { name: tag + ' Two', userId: g2.user.id, status: 'active' } });
  const tpl = await p.waiverTemplate.create({ data: { name: tag + ' w', version: 1, status: 'published', body: [{ type: 'paragraph', children: [{ text: 'Risk.' }] }] } });
  const tour = await p.tour.create({ data: { name: tag, slug: tag, status: 'active', maxParticipants: 100, requiresWaiverId: tpl.id } });
  const tk = await p.ticketType.create({ data: { tourId: tour.id, name: 'Adult', priceCents: 3000, active: true, seatsUsed: 1, countsTowardCapacity: true } });
  const base = Date.now() + 3600000;
  const dep = async (offsetMin: number) => { const startAt = new Date(base + offsetMin * 60000); return p.departure.create({ data: { tourId: tour.id, departureKey: tag + offsetMin + randomUUID(), startAt, endAt: new Date(+startAt + 3600000), capacity: 30, status: 'on_sale', bookingCutoffMinutes: 0 } }); };
  const dMine = await dep(0), dOther = await dep(30), dOffered = await dep(60), dNone = await dep(90);
  const asg = (d: any, g: any, status: string) => p.guideAssignment.create({ data: { departureId: d.id, guideId: g.id, role: 'lead', status } });
  await asg(dMine, guide1, 'accepted'); await asg(dOther, guide2, 'accepted'); await asg(dOffered, guide1, 'offered');
  const book = async (d: any, name: string) => { const r: any = await createChannelBooking(null, { idempotencyKey: key(), input: { departureId: d.id, source: 'phone', paymentMethod: 'cash', tickets: [{ id: tk.id, qty: 1 }], lead: { name, email: tag + randomUUID().slice(0, 4) + '@x.example' }, participants: [{ ticketTypeId: tk.id, fullName: name, age: 30 }] } }, ops.ctx); return p.participant.findFirst({ where: { booking: { bookingRef: r.bookingRef } }, include: { booking: true } }); };
  const pMine = await book(dMine, 'Mine Guest'), pOther = await book(dOther, 'Other Guest'), pMine2 = await book(dMine, 'Mine Second'), pOther2 = await book(dOther, 'Other Second');
  const win = { from: new Date(base - 3600000).toISOString(), to: new Date(base + 6 * 3600000).toISOString() };
  const ids = async (c: any) => ((await departuresInRange(null, win, c)) as any[]).map(d => d.id).filter(id => [dMine, dOther, dOffered, dNone].some(x => x.id === id)).sort();
  // 1. List: guide sees only own accepted; offered/not-assigned/other excluded; unlinked login sees none; operations (either right) see all.
  assert.deepEqual(await ids(g1.ctx), [dMine.id]);
  assert.deepEqual(await ids(g2.ctx), [dOther.id]);
  assert.deepEqual(await ids(nolink.ctx), []);
  const all = [dMine.id, dOther.id, dOffered.id, dNone.id].sort();
  assert.deepEqual(await ids(ops.ctx), all); assert.deepEqual(await ids(bookingsOnly.ctx), all);
  // 2. Manifest: own opens; another's refused; unaccepted offer refused; operations open any.
  assert.equal(((await departureManifest(null, { departureId: dMine.id }, g1.ctx)) as any).bookings.length, 2);
  for (const d of [dOther, dOffered, dNone]) await assert.rejects(() => departureManifest(null, { departureId: d.id }, g1.ctx), /not on your schedule/);
  await assert.rejects(() => departureManifest(null, { departureId: dMine.id }, g2.ctx), /not on your schedule/);
  await assert.rejects(() => departureManifest(null, { departureId: dMine.id }, nolink.ctx), /not on your schedule/);
  assert.equal(((await departureManifest(null, { departureId: dOther.id }, ops.ctx)) as any).bookings.length, 2);
  // 3. Writes at check-in obey the same scope (an id guessed from another departure is refused, nothing changes).
  await assert.rejects(() => checkInParticipant(null, { input: { participantId: pOther.id }, idempotencyKey: key() }, g1.ctx), /not on your schedule/);
  await assert.rejects(() => markNoShow(null, { input: { bookingId: pOther2.bookingId }, idempotencyKey: key() }, g1.ctx), /not on your schedule/);
  await assert.rejects(() => participantWaiver(null, { participantId: pOther.id }, g1.ctx), /not on your schedule/);
  await assert.rejects(() => captureWaiverOnSite(null, { input: { participantId: pOther.id, signerName: 'X Y' }, idempotencyKey: key() }, g1.ctx), /not on your schedule/);
  await assert.rejects(() => pickupSheet(null, { departureId: dOther.id }, g1.ctx), /not on your schedule/);
  assert.equal((await p.participant.findUnique({ where: { id: pOther.id } })).checkInStatus, 'pending');
  assert.equal((await p.booking.findUnique({ where: { id: pOther2.bookingId } })).status, 'confirmed');
  assert.equal(await p.waiverSignature.count({ where: { participantId: pOther.id } }), 0);
  assert.equal((await p.participant.findUnique({ where: { id: pOther.id } })).waiverStatus, 'required');
  // 4. Own departure works end to end for the guide.
  await captureWaiverOnSite(null, { input: { participantId: pMine.id, signerName: 'Mine Guest' }, idempotencyKey: key() }, g1.ctx);
  await checkInParticipant(null, { input: { participantId: pMine.id }, idempotencyKey: key() }, g1.ctx);
  await markNoShow(null, { input: { bookingId: pMine2.bookingId }, idempotencyKey: key() }, g1.ctx);
  assert.equal((await p.participant.findUnique({ where: { id: pMine.id } })).checkInStatus, 'checked_in');
  assert.equal((await p.booking.findUnique({ where: { id: pMine2.bookingId } })).status, 'no_show');
  // 5. Operations staff can still act on any departure.
  await checkInParticipant(null, { input: { participantId: pOther.id }, idempotencyKey: key() }, ops.ctx);
  assert.equal((await p.participant.findUnique({ where: { id: pOther.id } })).checkInStatus, 'checked_in');
  // 6. Accepting later grants access; declining/cancelling removes it.
  await p.guideAssignment.updateMany({ where: { departureId: dOffered.id, guideId: guide1.id }, data: { status: 'accepted' } });
  assert.deepEqual(await ids(g1.ctx), [dMine.id, dOffered.id].sort());
  await p.guideAssignment.updateMany({ where: { departureId: dOffered.id, guideId: guide1.id }, data: { status: 'cancelled' } });
  assert.deepEqual(await ids(g1.ctx), [dMine.id]);
  console.log('PASS check-in scope: guide sees only own accepted departures, operations see all, writes refused elsewhere');
  await p.$disconnect();
}
main().catch(async e => { console.error(e); await p.$disconnect(); process.exit(1); });
