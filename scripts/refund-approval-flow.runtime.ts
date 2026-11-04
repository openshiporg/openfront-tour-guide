import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { createChannelBooking, requestRefundApproval, approveRefund, refundBooking } from '../features/keystone/mutations/tour-checkout';
const p: any = new PrismaClient(), tag = 'depth-' + randomUUID();
const key = () => tag + randomUUID();
async function main() {
  const role = await p.role.create({ data: { name: tag, canManageBookings: true, canIssueRefunds: true, canManagePayments: true } });
  const a = await p.user.create({ data: { name: 'Requester ' + tag.slice(6, 12), email: tag + 'a@test.example', password: 'disabled-runtime-fixture', roleId: role.id } });
  const b = await p.user.create({ data: { name: 'Approver ' + tag.slice(6, 12), email: tag + 'b@test.example', password: 'disabled-runtime-fixture', roleId: role.id } });
  const ca: any = { prisma: p, session: { itemId: a.id, data: { role } } }, cb: any = { prisma: p, session: { itemId: b.id, data: { role } } };
  const tour = await p.tour.create({ data: { name: tag, slug: tag, status: 'active', maxParticipants: 100 } });
  const ticket = await p.ticketType.create({ data: { tourId: tour.id, name: 'Adult', priceCents: 20000, active: true, seatsUsed: 1, countsTowardCapacity: true } });
  const startAt = new Date(Date.now() + 7 * 86400000);
  const dep = await p.departure.create({ data: { tourId: tour.id, departureKey: tag, startAt, endAt: new Date(+startAt + 3600000), capacity: 50, status: 'on_sale' } });
  const made = await createChannelBooking(null, { idempotencyKey: key(), input: { departureId: dep.id, source: 'phone', paymentMethod: 'cash', tickets: [{ id: ticket.id, qty: 1 }], lead: { name: 'Approval Guest', email: 'guest@test.example' }, participants: [{ ticketTypeId: ticket.id, fullName: 'Approval Guest', age: 30 }] } }, ca);
  const booking = await p.booking.findUnique({ where: { bookingRef: made.bookingRef } });
  const input = { bookingId: booking.id, amountCents: 15000, reason: 'Guest ill' };
  // 1. Over the threshold with no approval: a plain-language refusal, no refund row.
  await assert.rejects(() => refundBooking(null, { input, idempotencyKey: key() }, ca), /over the approval threshold/);
  // 2. Request (twice: same open request, not a duplicate); amount beyond the balance refused.
  const r1 = await requestRefundApproval(null, { bookingId: booking.id, reason: input.reason, amount: 15000 }, ca);
  const r2 = await requestRefundApproval(null, { bookingId: booking.id, reason: input.reason, amount: 15000 }, ca);
  assert.equal(r1.id, r2.id);
  await assert.rejects(() => requestRefundApproval(null, { bookingId: booking.id, reason: 'x', amount: 99999999 }, ca), /unrefunded balance/);
  // 3. Still pending: refund refused. Requester cannot approve their own request.
  await assert.rejects(() => refundBooking(null, { input, idempotencyKey: key() }, ca), /over the approval threshold/);
  await assert.rejects(() => approveRefund(null, { approvalId: r1.id }, ca), /cannot approve their own/);
  // 4. Second manager approves; a different amount or reason still finds no approval.
  assert.equal((await approveRefund(null, { approvalId: r1.id }, cb)).status, 'approved');
  await assert.rejects(() => refundBooking(null, { input: { ...input, amountCents: 15001 }, idempotencyKey: key() }, ca), /over the approval threshold/);
  await assert.rejects(() => refundBooking(null, { input: { ...input, reason: 'Different' }, idempotencyKey: key() }, ca), /over the approval threshold/);
  // The approver cannot use the requester's approval.
  await assert.rejects(() => refundBooking(null, { input, idempotencyKey: key() }, cb), /over the approval threshold/);
  // 5. Requester refunds with no pasted id; replay with the same key refunds once; the approval is consumed.
  const k = key();
  const first = await refundBooking(null, { input, idempotencyKey: k }, ca);
  const again = await refundBooking(null, { input, idempotencyKey: k }, ca);
  assert.equal(first.refundId, again.refundId);
  assert.equal((await p.managerApproval.findUnique({ where: { id: r1.id } })).status, 'consumed');
  assert.equal((await p.booking.findUnique({ where: { id: booking.id } })).refundedCents, 15000);
  // 6. The consumed approval cannot authorise a second refund.
  await assert.rejects(() => refundBooking(null, { input: { ...input, amountCents: 15000 }, idempotencyKey: key() }, ca), /over the approval threshold|exceeds|cannot/);
  console.log('PASS refund approval flow');
  await p.$disconnect();
}
main().catch(async e => { console.error(e); await p.$disconnect(); process.exit(1); });
