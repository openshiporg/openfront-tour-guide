import { createHash } from 'node:crypto';
import { command, audit, authorize, hashToken, assertProof, humanCode, derivedToken, lockTransactionKey, departureOccupancy } from '../lib/tour-command';
import { placeHold } from './tour-catalog';
import { createPayment, getPaymentStatus, refundPayment } from '../utils/paymentProviderAdapter';
import { getPublicPaymentProviderConfig } from '../utils/paymentProviderConfig';
import { refundPolicyAmount, basisPoints, minimumDecision } from '../lib/tour-money';
import { consumeManagerApproval, requestManagerApproval, approveManagerApproval } from '../utils/managerApproval';

const LIVE = ['confirmed', 'checked_in', 'completed', 'no_show', 'partially_refunded', 'refunded'];
const norm = (s: string) => String(s || '').trim().toLowerCase();

async function provider(prisma: any) {
  const p = await prisma.paymentProvider.findFirst({ where: { code: 'pp_stripe', isInstalled: true } });
  if (!p) throw new Error('Payment provider is not configured');
  return p;
}
export async function refreshDepartureStatus(tx: any, departureId: string) {
  const o = await departureOccupancy(tx, departureId);
  const d = o.departure;
  if (!['scheduled', 'on_sale', 'min_not_met', 'confirmed', 'full'].includes(d.status)) return;
  const next = o.booked >= d.capacity ? 'full' : o.booked >= d.tour.minParticipants ? 'confirmed' : d.status === 'min_not_met' ? 'min_not_met' : 'on_sale';
  if (next !== d.status) await tx.departure.update({ where: { id: d.id }, data: { status: next } });
}
export function buildParticipants(quote: any, input: any[]) {
  const tickets = quote.lines.filter((l: any) => l.kind === 'ticket');
  const total = tickets.reduce((n: number, l: any) => n + l.qty, 0);
  if (!Array.isArray(input) || input.length !== total) throw new Error('Provide one participant per ticket');
  const remaining = new Map<string, number>(tickets.map((l: any) => [l.catalogId, l.qty]));
  return input.map(p => {
    const line = tickets.find((l: any) => l.catalogId === p.ticketTypeId);
    if (!line || !(remaining.get(line.catalogId)! > 0)) throw new Error('Participants do not match selected tickets');
    remaining.set(line.catalogId, remaining.get(line.catalogId)! - 1);
    const name = String(p.fullName || '').trim();
    if (!name || name.length > 120) throw new Error('Participant name required');
    if (p.age !== undefined && p.age !== null && (line.minAge != null && p.age < line.minAge || line.maxAge != null && p.age > line.maxAge)) throw new Error(`${name} does not meet the age range for ${line.name}`);
    return { fullName: name, age: p.age ?? null, email: String(p.email || '').trim(), dietary: String(p.dietary || ''), medicalNotes: String(p.medicalNotes || ''), snapshot: { ticketTypeId: line.catalogId, name: line.name, unitPriceCents: line.unitPriceCents } };
  });
}
export async function newBooking(tx: any, a: { quote: any; lead: any; participants: any[]; source: string; channel?: any; holdId: string; customerId?: string | null; status: string }) {
  const q = a.quote;
  const commission = a.channel ? basisPoints(q.totalCents, a.channel.commissionBps) : 0;
  let bookingRef = '';
  for (let i = 0; i < 5; i++) { bookingRef = `TG-${humanCode(8)}`; if (!await tx.booking.findUnique({ where: { bookingRef } })) break; }
  const booking = await tx.booking.create({ data: {
    bookingRef, departureId: q.departureId, customerId: a.customerId || undefined, guestName: String(a.lead.name || '').trim(), guestEmail: norm(a.lead.email), guestPhone: String(a.lead.phone || ''),
    status: a.status, channelId: a.channel?.id, source: a.source, subtotalCents: q.subtotalCents, addOnsCents: q.addOnsCents, discountCents: q.discountCents, taxCents: q.taxCents, totalCents: q.totalCents, channelCommissionCents: commission,
    currencyCode: q.currencyCode, seats: 0, policySnapshot: q.policy, tourSnapshot: { ...q.tour, promo: q.promo }, holdId: a.holdId, specialRequests: String(a.lead.specialRequests || ''), pickupLocation: String(a.lead.pickupLocation || ''),
    lines: { create: q.lines.map((l: any) => ({ name: l.name, unitPriceCents: l.unitPriceCents, qty: l.qty, seatsUsed: l.seatsUsed, kind: l.kind, totalCents: l.unitPriceCents * l.qty, currencyCode: q.currencyCode, catalogId: l.catalogId })) },
  } });
  if (!booking.guestName || !booking.guestEmail.includes('@')) throw new Error('Lead booker name and email required');
  for (const p of a.participants) {
    const row = await tx.participant.create({ data: { bookingId: booking.id, fullName: p.fullName, age: p.age, email: p.email, dietary: p.dietary, medicalNotes: p.medicalNotes, ticketTypeSnapshot: p.snapshot, waiverStatus: q.tour.waiverTemplateId ? 'required' : 'not_required' } });
    if (q.tour.waiverTemplateId) await tx.participant.update({ where: { id: row.id }, data: { waiverTokenHash: hashToken(derivedToken('waiver', row.id)) } });
  }
  return booking;
}
// Converts a held reservation into confirmed seats. Caller holds departure:<id> lock.
export async function confirmBooking(tx: any, bookingId: string, actorId: string | null, requestId: string) {
  const booking = await tx.booking.findUnique({ where: { id: bookingId }, include: { hold: true } });
  if (booking.status === 'confirmed') return booking;
  const hold = booking.hold;
  const o = await departureOccupancy(tx, booking.departureId, hold?.id, booking.channelId);
  const seats = hold.quantity;
  const lateHold = hold.status !== 'active' || hold.expiresAt <= new Date();
  if (hold.status === 'released' || (lateHold && seats > o.remaining)) return null;
  await tx.inventoryHold.update({ where: { id: hold.id }, data: { status: 'converted' } });
  await tx.booking.update({ where: { id: booking.id }, data: { status: 'confirmed', seats } });
  const redemptions = await tx.promoRedemption.findMany({ where: { holdId: hold.id, status: 'reserved' } });
  for (const r of redemptions) {
    await tx.promoRedemption.update({ where: { id: r.id }, data: { status: 'committed', bookingId: booking.id } });
    await tx.promoCode.update({ where: { id: r.promoCodeId }, data: { usedCount: { increment: 1 } } });
  }
  await refreshDepartureStatus(tx, booking.departureId);
  await audit(tx, actorId, 'booking.confirmed', 'Booking', booking.id, { status: booking.status }, { status: 'confirmed', seats }, '', requestId);
  return tx.booking.findUnique({ where: { id: booking.id } });
}
async function waiverLinks(prisma: any, bookingId: string) {
  const ps = await prisma.participant.findMany({ where: { bookingId, waiverStatus: 'required' }, select: { id: true, fullName: true } });
  return ps.map((p: any) => ({ participantId: p.id, fullName: p.fullName, token: derivedToken('waiver', p.id) }));
}

export async function startBookingCheckout(_r: any, args: any, context: any) {
  const i = args.input; if (!i.token) throw new Error('Booking not found');
  const hold = await context.prisma.inventoryHold.findUnique({ where: { id: i.holdId } });
  if (!hold) throw new Error('Booking not found');
  assertProof(i.token, hold.cartTokenHash);
  const prov = await provider(context.prisma);
  const b = await context.prisma.$transaction(async (tx: any) => {
    await lockTransactionKey(tx, `departure:${hold.departureId}`);
    const h = await tx.inventoryHold.findUnique({ where: { id: hold.id } });
    const existing = await tx.booking.findUnique({ where: { holdId: h.id }, include: { paymentCollection: { include: { paymentSessions: true } } } });
    if (existing) return existing;
    if (h.status !== 'active' || h.expiresAt <= new Date()) throw new Error('Hold expired; choose seats again');
    const quote = { ...h.quote, departureId: h.departureId };
    const participants = buildParticipants(quote, i.participants);
    const booking = await newBooking(tx, { quote, lead: i.lead, participants, source: 'online', holdId: h.id, customerId: context.session?.itemId, status: 'pending_payment' });
    await tx.inventoryHold.update({ where: { id: h.id }, data: { expiresAt: new Date(Date.now() + 15 * 60000) } });
    const collection = await tx.paymentCollection.create({ data: { amount: quote.totalCents, description: 'default' } });
    await tx.booking.update({ where: { id: booking.id }, data: { paymentCollectionId: collection.id } });
    await tx.paymentSession.create({ data: { paymentCollectionId: collection.id, paymentProviderId: prov.id, amount: quote.totalCents, isSelected: true, idempotencyKey: createHash('sha256').update(`tour-checkout:${h.id}`).digest('hex'), data: { state: 'initializing' } } });
    await audit(tx, context.session?.itemId || null, 'booking.checkout_started', 'Booking', booking.id, null, { totalCents: quote.totalCents }, '', args.idempotencyKey);
    return tx.booking.findUnique({ where: { id: booking.id }, include: { paymentCollection: { include: { paymentSessions: true } } } });
  }, { timeout: 20000 });
  const session = b.paymentCollection.paymentSessions[0];
  if (b.totalCents === 0) return { bookingRef: b.bookingRef, clientSecret: null, publishableKey: null, totalCents: 0, currencyCode: b.currencyCode };
  let data = session.data || {};
  if (!data.paymentIntentId) {
    const created = await createPayment({ provider: prov, order: { id: b.id, orderNumber: b.bookingRef }, amount: b.totalCents, currency: b.currencyCode, idempotencyKey: session.idempotencyKey });
    data = { state: 'ready', paymentIntentId: created.paymentIntentId, clientSecret: created.clientSecret };
    await context.prisma.paymentSession.update({ where: { id: session.id }, data: { isInitiated: true, data } });
  }
  return { bookingRef: b.bookingRef, clientSecret: data.clientSecret, publishableKey: getPublicPaymentProviderConfig(prov.code)?.publishableKey || null, totalCents: b.totalCents, currencyCode: b.currencyCode };
}

export async function finalizeBookingPayment(prisma: any, bookingId: string, actorId: string | null, requestId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { paymentCollection: { include: { paymentSessions: { include: { paymentProvider: true } } } } } });
  if (!booking) throw new Error('Booking not found');
  if (booking.status !== 'pending_payment') return booking;
  const session = booking.paymentCollection?.paymentSessions?.find((s: any) => s.isSelected);
  let observed: any = null;
  if (booking.totalCents > 0) {
    if (!session?.data?.paymentIntentId) throw new Error('Payment has not started');
    observed = await getPaymentStatus({ provider: session.paymentProvider, paymentId: session.data.paymentIntentId });
    if (observed.status !== 'succeeded') throw new Error('Payment not completed');
    if (observed.amount !== booking.totalCents || String(observed.currencyCode).toUpperCase() !== booking.currencyCode) throw new Error('Payment amount does not match the booking; operator reconciliation required');
  }
  let needRefund = false;
  const confirmed = await prisma.$transaction(async (tx: any) => {
    await lockTransactionKey(tx, `departure:${booking.departureId}`);
    const result = await confirmBooking(tx, booking.id, actorId, requestId);
    if (!result) { needRefund = true; await tx.booking.update({ where: { id: booking.id }, data: { status: 'cancelled' } }); }
    if (booking.totalCents > 0) {
      await tx.payment.create({ data: { idempotencyKey: `tour-payment:${booking.id}`, amount: booking.totalCents, currencyCode: booking.currencyCode, status: 'succeeded', paymentMethod: 'credit_card', paymentProviderId: session.paymentProviderId, providerPaymentId: session.data.paymentIntentId, orderId: booking.id, paymentCollectionId: booking.paymentCollectionId, processedAt: new Date(), data: { paymentIntentId: session.data.paymentIntentId } } });
      await tx.paymentCollection.update({ where: { id: booking.paymentCollectionId }, data: { authorizedAmount: booking.totalCents } });
      await tx.paymentSession.update({ where: { id: session.id }, data: { paymentAuthorizedAt: new Date(), data: { ...session.data, state: 'captured' } } });
    }
    return result;
  }, { timeout: 20000 });
  if (needRefund) {
    await issueRefund(prisma, { bookingId: booking.id, amount: booking.totalCents, reason: 'Seats no longer available after payment', key: `late-pay:${booking.id}`, actorId: null, cancel: true });
    throw new Error('Seats were no longer available; payment refunded');
  }
  return confirmed;
}
export async function completeBookingCheckout(_r: any, args: any, context: any) {
  const i = args.input;
  const booking = await context.prisma.booking.findUnique({ where: { bookingRef: String(i.bookingRef) }, include: { hold: true } });
  if (!booking?.hold) throw new Error('Booking not found');
  assertProof(i.token, booking.hold.cartTokenHash);
  const done = await finalizeBookingPayment(context.prisma, booking.id, context.session?.itemId || null, args.idempotencyKey);
  return { bookingRef: done.bookingRef, status: done.status, waivers: await waiverLinks(context.prisma, done.id) };
}

async function bookingView(prisma: any, booking: any) {
  const full = await prisma.booking.findUnique({ where: { id: booking.id }, include: { departure: { include: { tour: { include: { meetingPoint: true } } } }, lines: true, participants: { select: { id: true, fullName: true, waiverStatus: true, checkInStatus: true } } } });
  const meeting = full.departure?.tour?.meetingPoint;
  return {
    bookingRef: full.bookingRef, status: full.status, totalCents: full.totalCents, refundedCents: full.refundedCents, currencyCode: full.currencyCode, seats: full.seats,
    tourName: full.tourSnapshot?.name || full.departure?.tour?.name, startAt: full.departure?.startAt, endAt: full.departure?.endAt, timezone: full.tourSnapshot?.timezone,
    meetingPoint: meeting ? { name: meeting.name, address: meeting.address, instructions: meeting.instructions, mapLink: meeting.mapLink } : full.tourSnapshot?.meetingPoint || null,
    lines: full.lines.map((l: any) => ({ name: l.name, qty: l.qty, unitPriceCents: l.unitPriceCents, kind: l.kind })),
    participants: full.participants.map((p: any) => ({ participantId: p.id, fullName: p.fullName, waiverStatus: p.waiverStatus, checkInStatus: p.checkInStatus })),
    refundIfCancelledCents: ['confirmed'].includes(full.status) ? refundPolicyAmount(full.totalCents - full.refundedCents, full.policySnapshot?.rules || [], (full.departure.startAt.getTime() - Date.now()) / 3600000) : 0,
    waivers: ['confirmed', 'checked_in'].includes(full.status) ? await waiverLinks(prisma, full.id) : [],
  };
}
export async function lookupBooking(_r: any, args: any, context: any) {
  const booking = await context.prisma.booking.findUnique({ where: { bookingRef: String(args.bookingRef || '').trim().toUpperCase() } });
  if (!booking || norm(booking.guestEmail) !== norm(args.email)) throw new Error('Booking not found');
  return bookingView(context.prisma, booking);
}

// Money path shared by cancel, refund, and departure cancellation. The provider call sits outside DB locks.
export async function issueRefund(prisma: any, a: { bookingId: string; amount: number; reason: string; key: string; actorId: string | null; cancel?: boolean; approvalId?: string | null; requestedById?: string | null }) {
  const reservation = await prisma.$transaction(async (tx: any) => {
    const b = await tx.booking.findUnique({ where: { id: a.bookingId } });
    await lockTransactionKey(tx, `departure:${b.departureId}`);
    const existing = await tx.refund.findUnique({ where: { idempotencyKey: a.key } });
    if (existing) return { refund: existing, replay: true };
    const payment = await tx.payment.findFirst({ where: { orderId: b.id, status: { in: ['succeeded', 'partially_refunded'] } }, include: { paymentProvider: true } });
    const live = await tx.booking.findUnique({ where: { id: b.id } });
    if (!payment) { if (a.amount === 0 || live.totalCents === 0 || live.channelId) return { refund: null, payment: null, booking: live }; throw new Error('No captured payment to refund'); }
    if (!Number.isSafeInteger(a.amount) || a.amount < 0 || a.amount > payment.amount - (payment.refundedAmount || 0)) throw new Error('Refund exceeds captured amount');
    if (a.amount === 0) return { refund: null, payment, booking: live };
    const refund = await tx.refund.create({ data: { idempotencyKey: a.key, amount: a.amount, currencyCode: payment.currencyCode, status: 'processing', reason: a.reason || 'Refund', paymentId: payment.id, orderId: b.id, requestedById: a.requestedById || a.actorId, approvedById: a.approvalId ? (await tx.managerApproval.findUnique({ where: { id: a.approvalId } }))?.approvedById : null } });
    await audit(tx, a.actorId, 'refund.reserved', 'Refund', refund.id, null, { amount: a.amount }, a.reason, a.key);
    return { refund, payment, booking: live };
  }, { timeout: 20000 });
  if (reservation.replay && reservation.refund.status === 'succeeded') return reservation.refund;
  const { refund, payment } = reservation as any;
  let outcome: any = { status: 'succeeded', id: '' };
  const operatorTender = !!payment && (payment.paymentMethod === 'cash' || !payment.providerPaymentId);
  if (refund && operatorTender) outcome = { status: 'succeeded', id: `manual:${refund.id}` };
  else if (refund) {
    try {
      const prov = payment.paymentProvider || await provider(prisma);
      const result = await refundPayment({ provider: prov, paymentId: payment.providerPaymentId, amount: refund.amount, currency: refund.currencyCode, idempotencyKey: refund.idempotencyKey });
      outcome = { status: result.status === 'succeeded' ? 'succeeded' : result.status === 'failed' ? 'failed' : 'unknown', id: result.id || result.refundId, data: result.data };
    } catch { outcome = { status: 'unknown', id: '' }; }
  }
  return prisma.$transaction(async (tx: any) => {
    const b = await tx.booking.findUnique({ where: { id: a.bookingId } });
    await lockTransactionKey(tx, `departure:${b.departureId}`);
    if (refund) {
      const current = await tx.refund.findUnique({ where: { id: refund.id } });
      if (current.status === 'succeeded') return current;
      await tx.refund.update({ where: { id: refund.id }, data: { status: outcome.status, providerRefundId: outcome.id || '', processedAt: outcome.status === 'succeeded' ? new Date() : null } });
      if (outcome.status === 'succeeded') {
        const p = await tx.payment.findUnique({ where: { id: payment.id } });
        const total = (p.refundedAmount || 0) + refund.amount;
        await tx.payment.update({ where: { id: p.id }, data: { refundedAmount: total, status: total >= p.amount ? 'refunded' : 'partially_refunded' } });
        if (b.paymentCollectionId) await tx.paymentCollection.update({ where: { id: b.paymentCollectionId }, data: { refundedAmount: { increment: refund.amount } } });
      }
    }
    if (!refund || outcome.status === 'succeeded') {
      const refunded = (b.refundedCents || 0) + (refund ? refund.amount : 0);
      const data: any = { refundedCents: refunded };
      if (a.cancel) { data.status = refunded >= b.totalCents && b.totalCents > 0 ? 'refunded' : 'cancelled'; data.seats = 0; if (b.totalCents === 0) data.status = 'cancelled'; }
      else if (refunded > 0) data.status = refunded >= b.totalCents ? 'refunded' : 'partially_refunded';
      if (data.status === 'refunded' && !a.cancel) data.seats = b.seats;
      await tx.booking.update({ where: { id: b.id }, data });
      if (a.cancel) { await tx.promoRedemption.updateMany({ where: { bookingId: b.id, status: 'committed' }, data: { status: 'released' } }); await refreshDepartureStatus(tx, b.departureId); }
      await audit(tx, a.actorId, a.cancel ? 'booking.cancelled' : 'booking.refunded', 'Booking', b.id, { status: b.status, refundedCents: b.refundedCents }, data, a.reason, a.key);
    } else await audit(tx, a.actorId, 'refund.unresolved', 'Refund', refund.id, null, { status: outcome.status }, 'Reconcile with the provider before retrying', a.key);
    return refund ? tx.refund.findUnique({ where: { id: refund.id } }) : { status: 'succeeded', amount: 0 };
  }, { timeout: 20000 });
}
export async function cancelMyBooking(_r: any, args: any, context: any) {
  const booking = await context.prisma.booking.findUnique({ where: { bookingRef: String(args.bookingRef || '').trim().toUpperCase() }, include: { departure: true } });
  if (!booking || norm(booking.guestEmail) !== norm(args.email)) throw new Error('Booking not found');
  if (booking.status !== 'confirmed') throw new Error('Only confirmed bookings can be cancelled');
  if (booking.departure.startAt <= new Date()) throw new Error('Departure has started');
  const refundable = booking.totalCents - booking.refundedCents;
  const amount = refundPolicyAmount(refundable, booking.policySnapshot?.rules || [], (booking.departure.startAt.getTime() - Date.now()) / 3600000);
  await issueRefund(context.prisma, { bookingId: booking.id, amount, reason: 'Guest cancellation per policy', key: `cancel:${booking.id}:${args.idempotencyKey}`, actorId: null, cancel: true });
  return bookingView(context.prisma, booking);
}
export async function requestRefundApproval(root: any, args: any, context: any) { await authorize(context, 'canIssueRefunds'); return requestManagerApproval(root, { actionType: 'refund_booking', targetId: args.bookingId, reason: args.reason, amount: args.amount }, context); }
export async function approveRefund(root: any, args: any, context: any) { await authorize(context, 'canIssueRefunds'); return approveManagerApproval(root, { approvalId: args.approvalId }, context); }
export async function refundBooking(_r: any, args: any, context: any) {
  const user = await authorize(context, 'canIssueRefunds'); const i = args.input;
  const booking = await context.prisma.booking.findUnique({ where: { id: i.bookingId } });
  if (!booking || !LIVE.includes(booking.status)) throw new Error('Booking cannot be refunded');
  const settings = await context.prisma.storeSettings.findFirst();
  const needsApproval = i.amountCents > (settings?.refundApprovalThresholdCents ?? 10000);
  if (!i.reason?.trim()) throw new Error('Reason required');
  if (needsApproval) {
    await context.prisma.$transaction(async (tx: any) => consumeManagerApproval(tx, { actionType: 'refund_booking', targetId: booking.id, reason: i.reason, amount: i.amountCents, approvalId: i.approvalId, actorId: user.id, entityType: 'Booking', entityId: booking.id }), { isolationLevel: 'Serializable' });
  }
  await issueRefund(context.prisma, { bookingId: booking.id, amount: i.amountCents, reason: i.reason, key: `refund:${args.idempotencyKey}`, actorId: user.id, cancel: !!i.cancelBooking, approvalId: i.approvalId });
  return { bookingRef: booking.bookingRef };
}

export async function cancelDeparture(_r: any, args: any, context: any) {
  const user = await authorize(context, 'canManageDepartures');
  return cancelDepartureCore(context.prisma, user.id, args.input, args.idempotencyKey);
}
export async function cancelDepartureCore(prisma: any, actorId: string, i: any, requestKey: string) {
  if (!['weather', 'operator', 'min_not_met'].includes(i.reason)) throw new Error('Reason must be weather, operator or min_not_met');
  const status = i.reason === 'weather' ? 'weather_cancelled' : 'cancelled';
  const ids = await prisma.$transaction(async (tx: any) => {
    await lockTransactionKey(tx, `departure:${i.departureId}`);
    const d = await tx.departure.findUnique({ where: { id: i.departureId } });
    if (!d) throw new Error('Departure not found');
    if (['completed', 'in_progress'].includes(d.status)) throw new Error('Departure already ran');
    if (d.status !== status) {
      await tx.departure.update({ where: { id: d.id }, data: { status } });
      await tx.inventoryHold.updateMany({ where: { departureId: d.id, status: 'active' }, data: { status: 'released' } });
      const holds = await tx.inventoryHold.findMany({ where: { departureId: d.id, status: 'released' }, select: { id: true } });
      await tx.promoRedemption.updateMany({ where: { holdId: { in: holds.map((h: any) => h.id) }, status: 'reserved' }, data: { status: 'released' } });
      await tx.booking.updateMany({ where: { departureId: d.id, status: 'pending_payment' }, data: { status: 'cancelled' } });
      await tx.guideAssignment.updateMany({ where: { departureId: d.id, status: { in: ['offered', 'accepted'] } }, data: { status: 'cancelled' } });
      await audit(tx, actorId, 'departure.cancelled', 'Departure', d.id, { status: d.status }, { status }, i.reason, requestKey);
    }
    return (await tx.booking.findMany({ where: { departureId: d.id, status: { in: ['confirmed', 'checked_in', 'partially_refunded'] } }, select: { id: true } })).map((b: any) => b.id);
  }, { timeout: 20000 });
  const credits: { bookingRef: string; token: string }[] = [];
  for (const id of ids) {
    const b = await prisma.booking.findUnique({ where: { id } });
    if (i.offerCredit && b.channelId == null) {
      const token = derivedToken('rebook', b.id);
      await prisma.booking.update({ where: { id }, data: { status: 'cancelled', seats: 0, rebookCreditHash: hashToken(token) } });
      await prisma.$transaction(async (tx: any) => { await audit(tx, actorId, 'booking.credit_offered', 'Booking', id, null, { creditCents: b.totalCents - b.refundedCents }, i.reason); });
      credits.push({ bookingRef: b.bookingRef, token });
    } else {
      await issueRefund(prisma, { bookingId: id, amount: b.totalCents - b.refundedCents, reason: `Departure ${i.reason} cancellation`, key: `depcancel:${i.departureId}:${id}`, actorId: actorId, cancel: true });
    }
  }
  return { cancelledBookings: ids.length, credits };
}
export async function rebookWithCredit(_r: any, args: any, context: any) {
  const i = args.input;
  const old = await context.prisma.booking.findFirst({ where: { rebookCreditHash: hashToken(String(i.token || '')) }, include: { lines: true, participants: true } });
  if (!old || old.creditUsedAt) throw new Error('Credit not valid');
  const target = await context.prisma.departure.findUnique({ where: { id: i.departureId }, include: { tour: true } });
  if (!target || target.tourId !== (await context.prisma.departure.findUnique({ where: { id: old.departureId } })).tourId) throw new Error('Choose a departure of the same tour');
  return command(context, args.idempotencyKey, 'rebookWithCredit', { departureId: i.departureId, bookingId: old.id }, [`departure:${i.departureId}`], async tx => {
    const live = await tx.booking.updateMany({ where: { id: old.id, creditUsedAt: null }, data: { creditUsedAt: new Date() } });
    if (live.count !== 1) throw new Error('Credit already used');
    const tickets = old.lines.filter((l: any) => l.kind === 'ticket').map((l: any) => ({ id: l.catalogId, qty: l.qty }));
    const hold = await placeHold(tx, { departureId: target.id, tickets, addOns: [], token: derivedToken('rebook-hold', old.id) }, null, `rebook:${old.id}`);
    const quote = { ...hold.quote, departureId: target.id };
    const credit = old.totalCents - old.refundedCents;
    if (quote.totalCents > credit) throw new Error('Credit does not cover this departure');
    const row = await tx.inventoryHold.findUnique({ where: { id: hold.holdId } });
    const participants = old.participants.map((p: any) => ({ fullName: p.fullName, age: p.age, email: p.email, dietary: p.dietary, medicalNotes: p.medicalNotes, snapshot: p.ticketTypeSnapshot }));
    const booking = await newBooking(tx, { quote: { ...quote, totalCents: 0, subtotalCents: quote.subtotalCents, discountCents: quote.subtotalCents + quote.addOnsCents + quote.taxCents }, lead: { name: old.guestName, email: old.guestEmail, phone: old.guestPhone }, participants, source: 'online', holdId: row.id, status: 'pending_payment' });
    const confirmed = await confirmBooking(tx, booking.id, null, `rebook:${old.id}`);
    await audit(tx, null, 'booking.rebooked_with_credit', 'Booking', old.id, null, { newBookingId: booking.id, creditCents: credit });
    return { bookingRef: confirmed.bookingRef };
  });
}

export async function createChannelBooking(_r: any, args: any, context: any) {
  const user = await authorize(context, 'canManageBookings'); const i = args.input;
  if (!['phone', 'walk_up', 'reseller'].includes(i.source)) throw new Error('Invalid booking source');
  return command(context, args.idempotencyKey, 'createChannelBooking', i, [`departure:${i.departureId}`], async tx => {
    let channel: any = null;
    if (i.source === 'reseller') { channel = await tx.channel.findUnique({ where: { id: i.channelId } }); if (!channel?.active) throw new Error('Channel unavailable'); }
    const hold = await placeHold(tx, { ...i, token: derivedToken('operator-hold', args.idempotencyKey + ':' + i.departureId) }, user.id, args.idempotencyKey, channel?.id, 60000);
    const quote = { ...hold.quote, departureId: i.departureId };
    const participants = buildParticipants(quote, i.participants);
    const booking = await newBooking(tx, { quote, lead: i.lead, participants, source: i.source, channel, holdId: hold.holdId, status: 'pending_payment' });
    const confirmed = await confirmBooking(tx, booking.id, user.id, args.idempotencyKey);
    if (quote.totalCents > 0 && !(channel && channel.paymentModel === 'channel_collects')) {
      await tx.payment.create({ data: { idempotencyKey: `tour-payment:${booking.id}`, amount: quote.totalCents, currencyCode: quote.currencyCode, status: 'succeeded', paymentMethod: i.paymentMethod === 'cash' ? 'cash' : 'credit_card', orderId: booking.id, processedAt: new Date(), processedById: user.id, notes: 'Collected by operator' } });
    }
    return { bookingRef: confirmed.bookingRef, waivers: [] };
  });
}

export async function signWaiver(_r: any, args: any, context: any) {
  const i = args.input;
  const participant = await context.prisma.participant.findFirst({ where: { waiverTokenHash: hashToken(String(i.token || '')) }, include: { booking: true } });
  if (!participant) throw new Error('Waiver link not valid');
  const templateId = participant.booking.tourSnapshot?.waiverTemplateId;
  const template = templateId && await context.prisma.waiverTemplate.findUnique({ where: { id: templateId } });
  if (!template || template.status !== 'published') throw new Error('Waiver unavailable');
  if (!String(i.signerName || '').trim()) throw new Error('Signer name required');
  if (i.isGuardian && !String(i.minorName || '').trim()) throw new Error('Minor name required');
  const bodyHash = createHash('sha256').update(JSON.stringify(template.body)).digest('hex');
  const ip = String(context.req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return command(context, args.idempotencyKey, 'signWaiver', { participantId: participant.id, name: i.signerName }, [`participant:${participant.id}`], async tx => {
    if (participant.waiverStatus === 'signed') return { signed: true };
    await tx.waiverSignature.create({ data: { participantId: participant.id, templateId: template.id, templateVersion: template.version, signerName: i.signerName.trim(), isGuardian: !!i.isGuardian, minorName: i.minorName || '', signedAt: new Date(), ip, userAgent: String(context.req?.headers?.['user-agent'] || '').slice(0, 300), bodyHash } });
    await tx.participant.update({ where: { id: participant.id }, data: { waiverStatus: 'signed' } });
    return { signed: true };
  });
}

// T-24h sweep and cutoff closing. Creates an operator task; it never cancels.
export async function sweepDepartures(_r: any, args: any, context: any) {
  const user = await authorize(context, 'canManageDepartures');
  return command(context, args.idempotencyKey, 'sweepDepartures', {}, ['departure-sweep'], async tx => {
    const rows = await tx.departure.findMany({ where: { status: { in: ['on_sale', 'min_not_met', 'confirmed', 'full'] }, startAt: { gt: new Date(), lt: new Date(Date.now() + 86400000 + 3600000) } }, include: { tour: true }, take: 500 });
    let tasks = 0, closed = 0;
    for (const d of rows) {
      await lockTransactionKey(tx, `departure:${d.id}`);
      const o = await departureOccupancy(tx, d.id);
      const decision = minimumDecision(o.booked, d.tour.minParticipants, d.startAt);
      if (decision.needsDecision) {
        await tx.departure.update({ where: { id: d.id }, data: { status: 'min_not_met' } });
        const key = `min:${d.id}`;
        if (!await tx.operationalTask.findUnique({ where: { taskKey: key } })) { await tx.operationalTask.create({ data: { name: 'Run or cancel: minimum not met', departureId: d.id, taskKey: key, status: 'open' } }); tasks++; }
      }
      if (d.startAt.getTime() - d.bookingCutoffMinutes * 60000 <= Date.now()) { await tx.departure.update({ where: { id: d.id }, data: { status: 'closed' } }); closed++; }
    }
    await audit(tx, user.id, 'departures.swept', 'Departure', 'sweep', null, { tasks, closed });
    return { tasks, closed };
  });
}
