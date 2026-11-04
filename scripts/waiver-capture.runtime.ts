// Scratch-DB proof of on-site waiver capture at check-in. Fixtures are depth-*; remove with scripts/depth-cleanup.ts apply.
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { createChannelBooking } from '../features/keystone/mutations/tour-checkout';
import { participantWaiver, captureWaiverOnSite } from '../features/keystone/mutations/tour-waiver-capture';
import { departureManifest } from '../features/keystone/mutations/tour-manifest';
const p: any = new PrismaClient(), tag = 'depth-' + randomUUID();
const key = () => tag + randomUUID();
async function main() {
  const role = await p.role.create({ data: { name: tag, canManageBookings: true, canManagePayments: true, canCheckIn: true } });
  const user = await p.user.create({ data: { name: tag, email: tag + '@test.example', password: 'disabled-runtime-fixture', roleId: role.id } });
  const c: any = { prisma: p, session: { itemId: user.id, data: { role } } };
  const noRole = await p.role.create({ data: { name: tag + 'x', canManageBookings: true } });
  const nu = await p.user.create({ data: { name: tag + 'n', email: tag + 'n@test.example', password: 'disabled-runtime-fixture', roleId: noRole.id } });
  const cn: any = { prisma: p, session: { itemId: nu.id, data: { role: noRole } } };
  const tpl = await p.waiverTemplate.create({ data: { name: tag + ' waiver', version: 3, status: 'published', body: [{ type: 'paragraph', children: [{ text: 'I accept the risks of kayaking.' }] }] } });
  const tour = await p.tour.create({ data: { name: tag, slug: tag, status: 'active', maxParticipants: 100, requiresWaiverId: tpl.id } });
  const ticket = await p.ticketType.create({ data: { tourId: tour.id, name: 'Adult', priceCents: 5000, active: true, seatsUsed: 1, countsTowardCapacity: true } });
  const startAt = new Date(Date.now() + 3 * 86400000);
  const dep = await p.departure.create({ data: { tourId: tour.id, departureKey: tag, startAt, endAt: new Date(+startAt + 3600000), capacity: 20, status: 'on_sale' } });
  const made = await createChannelBooking(null, { idempotencyKey: key(), input: { departureId: dep.id, source: 'walk_up', paymentMethod: 'cash', tickets: [{ id: ticket.id, qty: 2 }], lead: { name: 'Waiver Lead', email: tag + '-w@test.example' }, participants: [{ ticketTypeId: ticket.id, fullName: 'Adult Guest', age: 34 }, { ticketTypeId: ticket.id, fullName: 'Kid Guest', age: 10 }] } }, c);
  const parts = await p.participant.findMany({ where: { booking: { bookingRef: made.bookingRef } }, orderBy: { fullName: 'asc' } });
  const [adult, kid] = parts; assert.equal(adult.waiverStatus, 'required'); assert.equal(kid.waiverStatus, 'required');
  // 1. The guide sees the published text and version; staff without canCheckIn cannot.
  const w = await participantWaiver(null, { participantId: adult.id }, c);
  assert.equal(w.version, 3); assert.match(w.text, /risks of kayaking/); assert.equal(w.status, 'required');
  await assert.rejects(() => participantWaiver(null, { participantId: adult.id }, cn), /Not authorized/);
  await assert.rejects(() => captureWaiverOnSite(null, { input: { participantId: adult.id, signerName: 'X' }, idempotencyKey: key() }, cn), /Not authorized/);
  // 2. A typed name is required; nothing is written on refusal.
  await assert.rejects(() => captureWaiverOnSite(null, { input: { participantId: adult.id, signerName: '   ' }, idempotencyKey: key() }, c), /must type their name/);
  assert.equal(await p.waiverSignature.count({ where: { participantId: adult.id } }), 0);
  // 3. Adult signs: the same WaiverSignature the emailed link writes (template, version, body hash), plus who attested; status signed; audited.
  const k = key();
  const r = await captureWaiverOnSite(null, { input: { participantId: adult.id, signerName: 'Adult Guest' }, idempotencyKey: k }, c);
  assert.deepEqual(r, { signed: true, alreadySigned: false });
  const sig = await p.waiverSignature.findMany({ where: { participantId: adult.id } });
  assert.equal(sig.length, 1); assert.equal(sig[0].templateId, tpl.id); assert.equal(sig[0].templateVersion, 3); assert.equal(sig[0].signerName, 'Adult Guest'); assert.equal(sig[0].isGuardian, false); assert.equal(sig[0].userAgent, 'staff-assisted:' + user.id); assert.match(sig[0].bodyHash, /^[0-9a-f]{64}$/);
  assert.equal((await p.participant.findUnique({ where: { id: adult.id } })).waiverStatus, 'signed');
  const ev = await p.auditEvent.findMany({ where: { action: 'waiver.captured_on_site', targetId: adult.id } });
  assert.equal(ev.length, 1); assert.equal(ev[0].actorId, user.id); assert.equal(ev[0].after.templateVersion, 3);
  // 4. Replay with the same key and a second capture with a new key add nothing.
  assert.deepEqual(await captureWaiverOnSite(null, { input: { participantId: adult.id, signerName: 'Adult Guest' }, idempotencyKey: k }, c), r);
  assert.equal((await captureWaiverOnSite(null, { input: { participantId: adult.id, signerName: 'Someone Else' }, idempotencyKey: key() }, c)).alreadySigned, true);
  assert.equal(await p.waiverSignature.count({ where: { participantId: adult.id } }), 1);
  // 5. Minor signed by a guardian: guardian flag and minor name recorded.
  await captureWaiverOnSite(null, { input: { participantId: kid.id, signerName: 'Waiver Lead', isGuardian: true }, idempotencyKey: key() }, c);
  const ks = await p.waiverSignature.findFirst({ where: { participantId: kid.id } }); assert.equal(ks.isGuardian, true); assert.equal(ks.minorName, 'Kid Guest'); assert.equal(ks.signerName, 'Waiver Lead');
  // 6. The manifest no longer reports a waiver gap.
  const m = await departureManifest(null, { departureId: dep.id }, c);
  assert.ok(m.bookings.flatMap((b: any) => b.participants).every((x: any) => x.waiverStatus === 'signed'));
  // 7. Refusals: unpublished template, tour without a waiver, cancelled booking, unknown participant.
  const b2 = await createChannelBooking(null, { idempotencyKey: key(), input: { departureId: dep.id, source: 'walk_up', paymentMethod: 'cash', tickets: [{ id: ticket.id, qty: 1 }], lead: { name: 'Second', email: tag + '-2@test.example' }, participants: [{ ticketTypeId: ticket.id, fullName: 'Second Guest', age: 40 }] } }, c);
  const p2 = await p.participant.findFirst({ where: { booking: { bookingRef: b2.bookingRef } } });
  await p.waiverTemplate.update({ where: { id: tpl.id }, data: { status: 'draft' } });
  await assert.rejects(() => captureWaiverOnSite(null, { input: { participantId: p2.id, signerName: 'Second Guest' }, idempotencyKey: key() }, c), /publish the waiver version first/);
  await p.waiverTemplate.update({ where: { id: tpl.id }, data: { status: 'published' } });
  await p.booking.update({ where: { bookingRef: b2.bookingRef }, data: { status: 'cancelled' } });
  await assert.rejects(() => captureWaiverOnSite(null, { input: { participantId: p2.id, signerName: 'Second Guest' }, idempotencyKey: key() }, c), /not confirmed/);
  await p.participant.update({ where: { id: p2.id }, data: { waiverStatus: 'not_required' } });
  await assert.rejects(() => captureWaiverOnSite(null, { input: { participantId: p2.id, signerName: 'Second Guest' }, idempotencyKey: key() }, c), /does not require a waiver/);
  await assert.rejects(() => captureWaiverOnSite(null, { input: { participantId: 'nope', signerName: 'X' }, idempotencyKey: key() }, c), /Participant not found/);
  console.log('PASS on-site waiver capture');
  await p.$disconnect();
}
main().catch(async e => { console.error(e); await p.$disconnect(); process.exit(1); });
