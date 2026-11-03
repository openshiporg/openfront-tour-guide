// Runtime check against the scratch DB: node --import tsx scripts/refund-approval.runtime.ts (DATABASE_URL inline).
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { issueRefund } from '../features/keystone/mutations/tour-checkout';
import { canonicalIdempotencyParams, idempotencyFingerprint } from '../features/keystone/utils/idempotency';

const prisma: any = new PrismaClient();
const tag = Math.random().toString(36).slice(2, 8);
const THRESHOLD = 10000;

async function approval(requestedById: string, approvedById: string, bookingId: string, amount: number, reason: string) {
  const requestPayload = canonicalIdempotencyParams({ actionType: 'refund_booking', targetId: bookingId, reason, amount });
  return prisma.managerApproval.create({ data: { actionType: 'refund_booking', targetId: bookingId, reason, amount, requestPayload, requestFingerprint: idempotencyFingerprint(requestPayload), status: 'approved', requestedById, approvedById, approvedAt: new Date(), expiresAt: new Date(Date.now() + 900000) } });
}

async function main() {
  const requester = await prisma.user.create({ data: { name: 'Refund Requester', email: `req-${tag}@t.example`, password: 'x'.repeat(12) } });
  const approver = await prisma.user.create({ data: { name: 'Refund Approver', email: `app-${tag}@t.example`, password: 'x'.repeat(12) } });
  const tour = await prisma.tour.create({ data: { name: `Runtime ${tag}`, slug: `runtime-${tag}`, status: 'active' } });
  const dep = await prisma.departure.create({ data: { departureKey: `rt-${tag}`, tourId: tour.id, startAt: new Date(Date.now() + 5 * 86400000), endAt: new Date(Date.now() + 5 * 86400000 + 3600000), capacity: 10, status: 'on_sale' } });
  const booking = await prisma.booking.create({ data: { bookingRef: `RT-${tag}`, departureId: dep.id, guestName: 'Runtime', guestEmail: 'rt@t.example', status: 'confirmed', source: 'phone', totalCents: 20000, subtotalCents: 20000, seats: 2 } });
  await prisma.payment.create({ data: { idempotencyKey: `rt-pay-${tag}`, amount: 20000, status: 'succeeded', paymentMethod: 'cash', orderId: booking.id, processedAt: new Date() } });
  const base = { bookingId: booking.id, reason: 'Runtime check', actorId: requester.id, approvalThresholdCents: THRESHOLD };

  // (a) Over-amount with an approval: the request fails and the approval stays unconsumed.
  const over = await approval(requester.id, approver.id, booking.id, 25000, 'Runtime check');
  await assert.rejects(() => issueRefund(prisma, { ...base, amount: 25000, key: `rt-over-${tag}`, approvalId: over.id }), /exceeds captured amount/);
  assert.equal((await prisma.managerApproval.findUnique({ where: { id: over.id } })).status, 'approved');
  assert.equal(await prisma.refund.count({ where: { idempotencyKey: `rt-over-${tag}` } }), 0);

  // No approval above the threshold is refused and creates no refund.
  await assert.rejects(() => issueRefund(prisma, { ...base, amount: 15000, key: `rt-none-${tag}`, approvalId: null }), /approval is required/);
  assert.equal(await prisma.refund.count({ where: { idempotencyKey: `rt-none-${tag}` } }), 0);

  // (b) Valid approval: first call refunds and consumes; the same key replays to the same refund id.
  const ok = await approval(requester.id, approver.id, booking.id, 15000, 'Runtime check');
  const first = await issueRefund(prisma, { ...base, amount: 15000, key: `rt-ok-${tag}`, approvalId: ok.id });
  assert.equal(first.status, 'succeeded');
  assert.equal((await prisma.managerApproval.findUnique({ where: { id: ok.id } })).status, 'consumed');
  const replay = await issueRefund(prisma, { ...base, amount: 15000, key: `rt-ok-${tag}`, approvalId: ok.id });
  assert.equal(replay.id, first.id);
  assert.equal(await prisma.refund.count({ where: { idempotencyKey: `rt-ok-${tag}` } }), 1);
  assert.equal((await prisma.booking.findUnique({ where: { id: booking.id } })).refundedCents, 15000);
  console.log('refund approval runtime checks passed');
}
main().then(() => prisma.$disconnect(), async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
