import { createHash } from 'node:crypto';
import { command, audit, authorize, hashToken, assertProof, humanCode, derivedToken, manageToken, lockTransactionKey, departureOccupancy, occupancyNumbers, userFacingError } from '../lib/tour-command';
import { fastOperatorBooking } from './tour-operator-booking';
import { placeHold } from './tour-catalog';
import { createPayment, getPaymentStatus, refundPayment } from '../utils/paymentProviderAdapter';
import { getPublicPaymentProviderConfig } from '../utils/paymentProviderConfig';
import { refundPolicyAmount, basisPoints, minimumDecision } from '../lib/tour-money';
import { promoteWaitlist, markWaitlistConverted, closeWaitlist } from './tour-waitlist';
import { allocateRefund, legKey, legWhere } from '../lib/tour-tender';
import { findCardByCode, debitCard, returnToCard } from './tour-gift-cards';
import { unusable, applyCard } from '../lib/tour-gift-card';
import { assertMove } from '../lib/stateMachines';
import { expireStaleHolds, releaseHoldPromos } from './tour-catalog';
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
  // The minimum is met again: the 'run or cancel' decision the sweep raised no longer needs anyone.
  if (next === 'confirmed' || next === 'full') await tx.operationalTask.updateMany({ where: { taskKey: `min:${d.id}`, status: 'open' }, data: { status: 'resolved' } });
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
  await markWaitlistConverted(tx, hold.id, booking.bookingRef);
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
  // A gift card is checked here and its share fixed on the payment session; it is debited only when the booking confirms
  // (finalizeBookingPayment), so an abandoned checkout never holds gift value.
  const gift = i.giftCardCode ? await findCardByCode(context.prisma, i.giftCardCode) : null;
  if (i.giftCardCode) { const why = unusable(gift, hold.quote?.currencyCode || 'USD'); if (why) throw userFacingError(new Error(why === 'This gift card is no longer valid' ? 'Gift card not found' : why)); }
  const b = await context.prisma.$transaction(async (tx: any) => {
    await lockTransactionKey(tx, `departure:${hold.departureId}`);
    const h = await tx.inventoryHold.findUnique({ where: { id: hold.id } });
    const existing = await tx.booking.findUnique({ where: { holdId: h.id }, include: { paymentCollection: { include: { paymentSessions: true } } } });
    if (existing) return existing;
    if (h.status !== 'active' || h.expiresAt <= new Date()) throw new Error('Hold expired; choose seats again');
    const quote = { ...h.quote, departureId: h.departureId };
    const participants = buildParticipants(quote, i.participants);
    const booking = await newBooking(tx, { quote, lead: i.lead, participants, source: 'online', holdId: h.id, customerId: context.session?.itemId, status: 'pending_payment' });
    await tx.inventoryHold.update({ where: { id: h.id }, data: { expiresAt: new Date(Math.max(h.expiresAt.getTime(), Date.now() + 15 * 60000)) } }); // a waitlist offer keeps its longer window
    const split = gift ? applyCard(gift.balanceCents, quote.totalCents) : { giftCents: 0, cardCents: quote.totalCents };
    const collection = await tx.paymentCollection.create({ data: { amount: quote.totalCents, description: 'default' } });
    await tx.booking.update({ where: { id: booking.id }, data: { paymentCollectionId: collection.id } });
    await tx.paymentSession.create({ data: { paymentCollectionId: collection.id, paymentProviderId: prov.id, amount: split.cardCents, isSelected: true, idempotencyKey: createHash('sha256').update(`tour-checkout:${h.id}`).digest('hex'), data: { state: 'initializing', ...(gift ? { giftCardId: gift.id, giftCents: split.giftCents, giftLast4: gift.last4 } : {}) } } });
    await audit(tx, context.session?.itemId || null, 'booking.checkout_started', 'Booking', booking.id, null, { totalCents: quote.totalCents }, '', args.idempotencyKey);
    return tx.booking.findUnique({ where: { id: booking.id }, include: { paymentCollection: { include: { paymentSessions: true } } } });
  }, { timeout: 20000 });
  const session = b.paymentCollection.paymentSessions[0];
  let data = session.data || {};
  const giftCents = data.giftCents || 0, cardCents = b.totalCents - giftCents;
  const shares = { totalCents: b.totalCents, giftCents, cardCents, giftLast4: data.giftLast4 || null, currencyCode: b.currencyCode };
  if (cardCents === 0) return { bookingRef: b.bookingRef, clientSecret: null, publishableKey: null, ...shares };
  if (!data.paymentIntentId) {
    const created = await createPayment({ provider: prov, order: { id: b.id, orderNumber: b.bookingRef }, amount: cardCents, currency: b.currencyCode, idempotencyKey: session.idempotencyKey });
    data = { ...data, state: 'ready', paymentIntentId: created.paymentIntentId, clientSecret: created.clientSecret };
    await context.prisma.paymentSession.update({ where: { id: session.id }, data: { isInitiated: true, data } });
  }
  return { bookingRef: b.bookingRef, clientSecret: data.clientSecret, publishableKey: getPublicPaymentProviderConfig(prov.code)?.publishableKey || null, ...shares };
}

export async function finalizeBookingPayment(prisma: any, bookingId: string, actorId: string | null, requestId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { paymentCollection: { include: { paymentSessions: { include: { paymentProvider: true } } } } } });
  if (!booking) throw new Error('Booking not found');
  const session = booking.paymentCollection?.paymentSessions?.find((s: any) => s.isSelected);
  const giftCardId: string | null = session?.data?.giftCardId || null, giftCents: number = session?.data?.giftCents || 0;
  const cardCents = booking.totalCents - giftCents;
  // A card payment can land after the hold lapsed and the lapse cancelled the booking. The money is real, so the booking is revived and
  // decided like any late payment: confirmed if the seats are still free, otherwise cancelled with the payment refunded.
  let revive = false;
  if (booking.status !== 'pending_payment') {
    if (booking.status === 'cancelled' && cardCents > 0 && booking.holdId && session?.data?.paymentIntentId) {
      const lapsed = await prisma.inventoryHold.findUnique({ where: { id: booking.holdId }, select: { status: true } });
      revive = lapsed?.status === 'expired' && !await prisma.payment.findUnique({ where: { idempotencyKey: `tour-payment:${booking.id}` }, select: { id: true } });
    }
    if (!revive) return booking;
  }
  let observed: any = null;
  if (cardCents > 0) {
    if (!session?.data?.paymentIntentId) throw new Error('Payment has not started');
    try {
      observed = await getPaymentStatus({ provider: session.paymentProvider, paymentId: session.data.paymentIntentId });
      if (observed.status !== 'succeeded') throw new Error('Payment not completed');
    } catch (e) { if (revive) return booking; throw e; }
    if (observed.amount !== cardCents || String(observed.currencyCode).toUpperCase() !== booking.currencyCode) throw new Error('Payment amount does not match the booking; operator reconciliation required');
  }
  let failure = '';
  const confirmed = await prisma.$transaction(async (tx: any) => {
    await lockTransactionKey(tx, `departure:${booking.departureId}`);
    if (revive) {
      assertMove('booking', 'cancelled', 'pending_payment');
      const back = await tx.booking.updateMany({ where: { id: booking.id, status: 'cancelled' }, data: { status: 'pending_payment' } });
      if (back.count !== 1) return booking;
      await audit(tx, actorId, 'booking.revived_by_late_payment', 'Booking', booking.id, { status: 'cancelled' }, { status: 'pending_payment' }, 'Card payment arrived after the hold lapsed', requestId);
    }
    // Lock order: departure, then gift card. The card is checked before seats are confirmed, so a balance spent elsewhere in the
    // meantime cancels this booking (and refunds the bank card part) instead of confirming it short.
    if (giftCardId) {
      await lockTransactionKey(tx, `giftcard:${giftCardId}`);
      const card = await tx.giftCard.findUnique({ where: { id: giftCardId } });
      const why = unusable(card, booking.currencyCode) || (card.balanceCents < giftCents ? 'The gift card balance changed before payment finished' : null);
      if (why) failure = `${why}; ${cardCents > 0 ? 'card payment refunded' : 'nothing was charged'}`;
    }
    const result = failure ? null : await confirmBooking(tx, booking.id, actorId, requestId);
    if (!result) {
      failure ||= `Seats were no longer available; ${cardCents > 0 ? 'payment refunded' : 'nothing was charged'}`;
      await tx.booking.update({ where: { id: booking.id }, data: { status: 'cancelled' } });
      await tx.inventoryHold.updateMany({ where: { id: booking.holdId, status: 'active' }, data: { status: 'released' } });
    }
    // Refunds go newest payment first, so the gift card part is recorded a millisecond after the bank card part: a refund puts value
    // back on the gift card first and reaches the bank card only for what the gift card did not cover (no cash-out of gift value).
    const paidAt = new Date();
    if (cardCents > 0) {
      await tx.payment.create({ data: { createdAt: paidAt, idempotencyKey: `tour-payment:${booking.id}`, amount: cardCents, currencyCode: booking.currencyCode, status: 'succeeded', paymentMethod: 'credit_card', cardBrand: observed?.cardBrand || '', cardLast4: observed?.cardLast4 || '', paymentProviderId: session.paymentProviderId, providerPaymentId: session.data.paymentIntentId, orderId: booking.id, paymentCollectionId: booking.paymentCollectionId, processedAt: new Date(), isSplitPayment: giftCents > 0, data: { paymentIntentId: session.data.paymentIntentId } } });
      await tx.paymentCollection.update({ where: { id: booking.paymentCollectionId }, data: { authorizedAmount: result ? booking.totalCents : cardCents } });
      await tx.paymentSession.update({ where: { id: session.id }, data: { paymentAuthorizedAt: new Date(), data: { ...session.data, state: 'captured' } } });
    }
    if (result && giftCents > 0) {
      const pay = await tx.payment.create({ data: { createdAt: new Date(paidAt.getTime() + 1), idempotencyKey: `tour-gift:${booking.id}`, amount: giftCents, currencyCode: booking.currencyCode, status: 'succeeded', paymentMethod: 'gift_card', orderId: booking.id, paymentCollectionId: booking.paymentCollectionId, processedAt: new Date(), isSplitPayment: cardCents > 0, data: { giftCardId } } });
      await debitCard(tx, { cardId: giftCardId!, amount: giftCents, currencyCode: booking.currencyCode, key: `gift-redeem:${booking.id}`, booking, paymentId: pay.id, actorId });
    }
    return result;
  }, { timeout: 20000 });
  if (failure) {
    if (cardCents > 0) await issueRefund(prisma, { bookingId: booking.id, amount: cardCents, reason: failure, key: `late-pay:${booking.id}`, actorId: null, cancel: true });
    throw new Error(failure);
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
    bookingRef: full.bookingRef, manageToken: manageToken(full.id, full.manageTokenVersion), status: full.status, totalCents: full.totalCents, refundedCents: full.refundedCents, currencyCode: full.currencyCode, seats: full.seats,
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

// Money path shared by cancel, refund, departure cancellation and party changes. A refund is split across the booking's captured payments
// (newest first, see allocateRefund), one Refund row per leg. Reserving happens under the departure lock, in the caller's transaction when
// the refund is part of a bigger change (reserveRefund), and the provider calls happen after it commits (settleRefund).
type RefundArgs = { bookingId: string; amount: number; reason: string; key: string; actorId: string | null; cancel?: boolean; approvalId?: string | null; requestedById?: string | null; approvalThresholdCents?: number; tenderOnly?: boolean };
export async function issueRefund(prisma: any, a: RefundArgs) {
  const reservation = await prisma.$transaction(async (tx: any) => {
    const b = await tx.booking.findUnique({ where: { id: a.bookingId }, select: { departureId: true } });
    await lockTransactionKey(tx, `departure:${b.departureId}`);
    return reserveRefund(tx, a);
  }, { timeout: 20000 });
  return settleRefund(prisma, a, reservation);
}
// Caller holds the booking's departure lock. A replay (same key) returns the legs already reserved and reserves nothing new.
export async function reserveRefund(tx: any, a: RefundArgs) {
  const existing = await tx.refund.findMany({ where: { orderId: a.bookingId, ...legWhere(a.key) }, orderBy: { createdAt: 'asc' } });
  if (existing.length) return { legs: existing, replay: true };
  const live = await tx.booking.findUnique({ where: { id: a.bookingId } });
  const payments = await tx.payment.findMany({ where: { orderId: live.id, status: { in: ['succeeded', 'partially_refunded'] } } });
  if (!Number.isSafeInteger(a.amount) || a.amount < 0) throw new Error('Refund exceeds captured amount');
  if (!payments.length) { if (a.amount === 0 || live.totalCents === 0 || live.channelId) return { legs: [], replay: false }; throw new Error('No captured payment to refund'); }
  if (a.amount === 0) return { legs: [], replay: false };
  const plan = allocateRefund(payments, a.amount);
  // The approval is consumed only after the lock, the replay check and amount validation, in this same transaction,
  // so a failed or replayed request never burns it.
  let approvedById: string | null = null;
  if (a.approvalThresholdCents !== undefined && a.amount > a.approvalThresholdCents) {
    const approval = await consumeManagerApproval(tx, { actionType: 'refund_booking', targetId: live.id, reason: a.reason, amount: a.amount, approvalId: a.approvalId, actorId: a.actorId, entityType: 'Booking', entityId: live.id });
    approvedById = approval.approvedById;
  }
  const legs: any[] = [];
  for (const [i, leg] of plan.entries()) {
    const payment = payments.find((x: any) => x.id === leg.paymentId);
    legs.push(await tx.refund.create({ data: { idempotencyKey: legKey(a.key, i), amount: leg.amount, currencyCode: payment.currencyCode, status: 'processing', reason: a.reason || 'Refund', paymentId: payment.id, orderId: live.id, requestedById: a.requestedById || a.actorId, approvedById } }));
  }
  await audit(tx, a.actorId, 'refund.reserved', 'Refund', legs[0].id, null, { amount: a.amount, legs: legs.map((l: any) => ({ id: l.id, paymentId: l.paymentId, amount: l.amount })) }, a.reason, a.key);
  return { legs, replay: false };
}
// Provider call per unsettled leg (cash and other operator tenders are returned by hand), then one transaction records the outcomes.
// The booking's refunded total and status change only once every leg has succeeded; tenderOnly refunds (a party change already
// lowered the booking total) touch only the payments.
export async function settleRefund(prisma: any, a: RefundArgs, reservation: { legs: any[]; replay: boolean }) {
  const legs = reservation.legs;
  const total = legs.reduce((n: number, l: any) => n + l.amount, 0);
  const summary = (rows: any[]) => rows.length ? { ...rows[0], amount: rows.reduce((n: number, l: any) => n + l.amount, 0), status: rows.every((l: any) => l.status === 'succeeded') ? 'succeeded' : rows.some((l: any) => l.status === 'failed') ? 'failed' : 'unknown', legs: rows.length } : { status: 'succeeded', amount: 0, legs: 0 };
  if (reservation.replay && legs.every((l: any) => l.status === 'succeeded')) return summary(legs);
  const outcomes = new Map<string, any>();
  for (const leg of legs) {
    if (leg.status === 'succeeded') continue;
    const payment = await prisma.payment.findUnique({ where: { id: leg.paymentId }, include: { paymentProvider: true } });
    if (payment.paymentMethod === 'gift_card') { outcomes.set(leg.id, { status: 'succeeded', id: `giftcard:${leg.id}`, giftCardId: payment.data?.giftCardId }); continue; }
    if (payment.paymentMethod === 'cash' || !payment.providerPaymentId) { outcomes.set(leg.id, { status: 'succeeded', id: `manual:${leg.id}` }); continue; }
    try {
      const prov = payment.paymentProvider || await provider(prisma);
      const result = await refundPayment({ provider: prov, paymentId: payment.providerPaymentId, amount: leg.amount, currency: leg.currencyCode, idempotencyKey: leg.idempotencyKey });
      outcomes.set(leg.id, { status: result.status === 'succeeded' ? 'succeeded' : result.status === 'failed' ? 'failed' : 'unknown', id: result.id || result.refundId });
    } catch { outcomes.set(leg.id, { status: 'unknown', id: '' }); }
  }
  return prisma.$transaction(async (tx: any) => {
    const b = await tx.booking.findUnique({ where: { id: a.bookingId } });
    await lockTransactionKey(tx, `departure:${b.departureId}`);
    let settled = true, newlySettled = false;
    for (const leg of legs) {
      const current = await tx.refund.findUnique({ where: { id: leg.id } });
      if (current.status === 'succeeded') continue;
      const outcome = outcomes.get(leg.id) || { status: 'unknown', id: '' };
      await tx.refund.update({ where: { id: leg.id }, data: { status: outcome.status, providerRefundId: outcome.id || '', processedAt: outcome.status === 'succeeded' ? new Date() : null } });
      if (outcome.status !== 'succeeded') { settled = false; continue; }
      newlySettled = true;
      if (outcome.giftCardId) await returnToCard(tx, { cardId: outcome.giftCardId, amount: leg.amount, key: `gift-return:${leg.id}`, booking: b, paymentId: leg.paymentId, reason: a.reason, actorId: a.actorId });
      const p = await tx.payment.findUnique({ where: { id: leg.paymentId } });
      const refunded = (p.refundedAmount || 0) + leg.amount;
      await tx.payment.update({ where: { id: p.id }, data: { refundedAmount: refunded, status: refunded >= p.amount ? 'refunded' : 'partially_refunded' } });
      if (p.paymentCollectionId) await tx.paymentCollection.update({ where: { id: p.paymentCollectionId }, data: { refundedAmount: { increment: leg.amount } } });
    }
    if (settled && newlySettled && legs.length && !a.tenderOnly) await audit(tx, a.actorId, 'refund.succeeded', 'Refund', legs[0].id, null, { amount: total, legs: legs.map((l: any) => ({ id: l.id, status: outcomes.get(l.id)?.status || l.status })) }, a.reason, a.key);
    if (!settled) await audit(tx, a.actorId, 'refund.unresolved', 'Refund', legs[0].id, null, { legs: legs.map((l: any) => ({ id: l.id, status: outcomes.get(l.id)?.status || l.status })) }, 'Reconcile with the provider before retrying', a.key);
    else if (a.tenderOnly) { if (newlySettled) await audit(tx, a.actorId, 'refund.settled', 'Booking', b.id, null, { amount: total, legs: legs.length }, a.reason, a.key); }
    else if (!legs.length || newlySettled) {
      const refunded = (b.refundedCents || 0) + total;
      const data: any = { refundedCents: refunded };
      if (a.cancel) { data.status = refunded >= b.totalCents && b.totalCents > 0 ? 'refunded' : 'cancelled'; data.seats = 0; if (b.totalCents === 0) data.status = 'cancelled'; }
      // A partial refund is money only (refundedCents): the booking keeps its operational status, so its seats stay counted and the guest can still check in or cancel.
      else if (refunded > 0 && refunded >= b.totalCents) data.status = 'refunded';
      if (data.status && data.status !== b.status) assertMove('booking', b.status, data.status);
      await tx.booking.update({ where: { id: b.id }, data });
      // The guest is out (cancelled or fully refunded): the promo use is given back, and the seats go back on sale and to the waitlist.
      if (data.status === 'cancelled' || data.status === 'refunded') {
        const used = await tx.promoRedemption.findMany({ where: { bookingId: b.id, status: 'committed' }, select: { id: true, promoCodeId: true } });
        for (const r of used) { await tx.promoRedemption.update({ where: { id: r.id }, data: { status: 'released' } }); await tx.promoCode.updateMany({ where: { id: r.promoCodeId, usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } }); }
        await refreshDepartureStatus(tx, b.departureId); await promoteWaitlist(tx, b.departureId, a.actorId);
      }
      await audit(tx, a.actorId, a.cancel ? 'booking.cancelled' : 'booking.refunded', 'Booking', b.id, { status: b.status, refundedCents: b.refundedCents }, data, a.reason, a.key);
    }
    return summary(legs.length ? await tx.refund.findMany({ where: { id: { in: legs.map((l: any) => l.id) } }, orderBy: { createdAt: 'asc' } }) : []);
  }, { timeout: 20000 });
}
export async function cancelMyBooking(_r: any, args: any, context: any) {
  const booking = await context.prisma.booking.findUnique({ where: { bookingRef: String(args.bookingRef || '').trim().toUpperCase() }, include: { departure: true } });
  if (!booking || norm(booking.guestEmail) !== norm(args.email)) throw userFacingError(new Error('Booking not found'));
  if (booking.status === 'pending_payment') {
    // An unpaid checkout the guest walked away from: nothing was charged, so cancel it and free its seats and promo.
    await context.prisma.$transaction(async (tx: any) => {
      await lockTransactionKey(tx, `departure:${booking.departureId}`);
      const gone = await tx.booking.updateMany({ where: { id: booking.id, status: 'pending_payment' }, data: { status: 'cancelled' } });
      if (!gone.count) return;
      await audit(tx, null, 'booking.cancelled', 'Booking', booking.id, { status: 'pending_payment' }, { status: 'cancelled' }, 'Guest cancelled an unpaid checkout', `cancel-unpaid:${booking.id}`);
      if (!booking.holdId) return;
      await tx.inventoryHold.updateMany({ where: { id: booking.holdId, status: 'active' }, data: { status: 'released' } });
      await releaseHoldPromos(tx, [booking.holdId]);
    }, { timeout: 20000 });
    return bookingView(context.prisma, await context.prisma.booking.findUnique({ where: { id: booking.id } }));
  }
  if (booking.status !== 'confirmed') throw userFacingError(new Error('Only confirmed bookings can be cancelled'));
  if (booking.departure.startAt <= new Date()) throw userFacingError(new Error('Departure has started'));
  if (booking.departure.startAt.getTime() - (booking.departure.bookingCutoffMinutes ?? 0) * 60000 <= Date.now()) throw userFacingError(new Error('Online cancellation closed before the start. Contact the operator.'));
  const refundable = booking.totalCents - booking.refundedCents;
  const amount = refundPolicyAmount(refundable, booking.policySnapshot?.rules || [], (booking.departure.startAt.getTime() - Date.now()) / 3600000);
  await issueRefund(context.prisma, { bookingId: booking.id, amount, reason: 'Guest cancellation per policy', key: `cancel:${booking.id}:${args.idempotencyKey}`, actorId: null, cancel: true });
  return bookingView(context.prisma, booking);
}
// Whether a booking reference exists at all (no guest details), so an unknown /bookings/<ref> can be a real 404.
export async function bookingRefExists(_r: any, args: any, context: any) {
  return !!await context.prisma.booking.findUnique({ where: { bookingRef: String(args.bookingRef || '').trim().toUpperCase() }, select: { id: true } });
}
export async function requestRefundApproval(root: any, args: any, context: any) { await authorize(context, 'canIssueRefunds'); const booking = await context.prisma.booking.findUnique({ where: { id: args.bookingId } }); if (!booking || !LIVE.includes(booking.status)) throw userFacingError(new Error('Booking cannot be refunded')); if (!Number.isSafeInteger(args.amount) || args.amount < 1 || args.amount > booking.totalCents - booking.refundedCents) throw userFacingError(new Error('Amount must be between 1 cent and the unrefunded balance')); const reason = String(args.reason || '').trim(); const open = await context.prisma.managerApproval.findFirst({ where: { actionType: 'refund_booking', targetId: booking.id, amount: args.amount, reason, requestedById: context.session.itemId, status: { in: ['pending', 'approved'] }, expiresAt: { gt: new Date() } } }); if (open) return open; return requestManagerApproval(root, { actionType: 'refund_booking', targetId: args.bookingId, reason: args.reason, amount: args.amount }, context); }
export async function approveRefund(root: any, args: any, context: any) { await authorize(context, 'canIssueRefunds'); try { return await approveManagerApproval(root, { approvalId: args.approvalId }, context); } catch (e) { throw userFacingError(e); } }
export async function refundBooking(_r: any, args: any, context: any) {
  try { return await refundBookingInner(_r, args, context); } catch (e) { throw userFacingError(e); }
}
async function refundBookingInner(_r: any, args: any, context: any) {
  const user = await authorize(context, 'canIssueRefunds'); const i = args.input;
  const booking = await context.prisma.booking.findUnique({ where: { id: i.bookingId } });
  if (!booking || !LIVE.includes(booking.status)) throw new Error('Booking cannot be refunded');
  const settings = await context.prisma.storeSettings.findFirst();
  if (!i.reason?.trim()) throw new Error('Reason required');
  // Above the threshold the refund needs a second manager's approval. The requester does not paste an id: the newest approved,
  // unexpired request for this exact booking, amount and reason that THEY filed is used (consumeManagerApproval re-checks it all).
  let approvalId = i.approvalId;
  const replayed = !approvalId && await context.prisma.refund.findUnique({ where: { idempotencyKey: `refund:${args.idempotencyKey}` }, select: { id: true } }); // a retry of a committed refund: its approval is already consumed
  if (!approvalId && !replayed && i.amountCents > (settings?.refundApprovalThresholdCents ?? 10000)) {
    const match = await context.prisma.managerApproval.findFirst({ where: { actionType: 'refund_booking', targetId: booking.id, amount: i.amountCents, reason: String(i.reason).trim(), requestedById: user.id, status: 'approved', expiresAt: { gt: new Date() } }, orderBy: { approvedAt: 'desc' }, select: { id: true } });
    approvalId = match?.id;
    if (!approvalId) throw new Error('This refund is over the approval threshold. Request approval first: another manager must approve this exact amount and reason.');
  }
  await issueRefund(context.prisma, { bookingId: booking.id, amount: i.amountCents, reason: i.reason, key: `refund:${args.idempotencyKey}`, actorId: user.id, cancel: !!i.cancelBooking, approvalId, approvalThresholdCents: settings?.refundApprovalThresholdCents ?? 10000 });
  const refund = await context.prisma.refund.findUnique({ where: { idempotencyKey: `refund:${args.idempotencyKey}` } });
  return { bookingRef: booking.bookingRef, refundId: refund?.id || null };
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
      assertMove('departure', d.status, status);
      await tx.departure.update({ where: { id: d.id }, data: { status } });
      await tx.operationalTask.updateMany({ where: { taskKey: `min:${d.id}`, status: 'open' }, data: { status: 'resolved' } });
      await tx.inventoryHold.updateMany({ where: { departureId: d.id, status: 'active' }, data: { status: 'released' } });
      const holds = await tx.inventoryHold.findMany({ where: { departureId: d.id, status: 'released' }, select: { id: true } });
      await tx.promoRedemption.updateMany({ where: { holdId: { in: holds.map((h: any) => h.id) }, status: 'reserved' }, data: { status: 'released' } });
      await tx.booking.updateMany({ where: { departureId: d.id, status: 'pending_payment' }, data: { status: 'cancelled' } });
      await tx.guideAssignment.updateMany({ where: { departureId: d.id, status: { in: ['offered', 'accepted'] } }, data: { status: 'cancelled' } });
      await closeWaitlist(tx, d.id, 'Departure cancelled');
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
  if (i.paymentMethod !== 'cash') throw new Error('Only recorded cash payments are supported; use online checkout for cards');
  if (!String(i.lead?.name || '').trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(i.lead?.email || '')) throw new Error('Lead name and valid email required');
  return fastOperatorBooking(context, args, user);
}
// Recovery lookup for a booking form whose request timed out or errored: did THIS idempotency key commit?
export async function operatorBookingByKey(_r: any, args: any, context: any) {
  await authorize(context, 'canManageBookings');
  const key = String(args.idempotencyKey || ''); if (!key || key.length > 200) throw new Error('Idempotency key required');
  const row = await context.prisma.idempotencyKey.findUnique({ where: { idempotencyKey: `createChannelBooking:${key}` } });
  if (!row || row.recoveryPoint !== 'completed' || !row.responseBody?.bookingRef) return { found: false };
  const booking = await context.prisma.booking.findUnique({ where: { bookingRef: row.responseBody.bookingRef }, select: { bookingRef: true, guestName: true, status: true, totalCents: true, seats: true } });
  return booking ? { found: true, ...booking } : { found: false };
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
    // Holds lapse by themselves: without this a quiet departure keeps its abandoned checkouts as pending_payment forever.
    let lapsed = 0;
    const stale = await tx.inventoryHold.findMany({ where: { status: 'active', expiresAt: { lte: new Date() } }, select: { departureId: true }, distinct: ['departureId'], take: 500 });
    for (const id of stale.map((h: any) => h.departureId).sort()) { await lockTransactionKey(tx, `departure:${id}`); lapsed += await expireStaleHolds(tx, id); }
    const rows = await tx.departure.findMany({ where: { status: { in: ['on_sale', 'min_not_met', 'confirmed', 'full'] }, startAt: { gt: new Date(), lt: new Date(Date.now() + 86400000 + 3600000) } }, include: { tour: true }, take: 500 });
    let tasks = 0, closed = 0;
    for (const d of rows) {
      await lockTransactionKey(tx, `departure:${d.id}`);
      const o = await departureOccupancy(tx, d.id);
      const decision = minimumDecision(o.booked, d.tour.minParticipants, d.startAt);
      if (decision.needsDecision) {
        await tx.departure.update({ where: { id: d.id }, data: { status: 'min_not_met' } });
        const key = `min:${d.id}`;
        const had = await tx.operationalTask.findUnique({ where: { taskKey: key } });
        if (had?.status === 'resolved') { await tx.operationalTask.updateMany({ where: { id: had.id, status: 'resolved' }, data: { status: 'open' } }); tasks++; }
        if (!had) { await tx.operationalTask.create({ data: { name: 'Run or cancel: minimum not met', departureId: d.id, taskKey: key, status: 'open' } }); tasks++; }
      }
      if (d.startAt.getTime() - d.bookingCutoffMinutes * 60000 <= Date.now()) { await tx.departure.update({ where: { id: d.id }, data: { status: 'closed' } }); closed++; }
    }
    // Seats freed by lapsed holds or offers go to the waitlist.
    let waitlistOffers = 0;
    const waitingOn = await tx.waitlistEntry.findMany({ where: { status: { in: ['waiting', 'offered'] }, departure: { startAt: { gt: new Date() } } }, select: { departureId: true }, distinct: ['departureId'], take: 200 });
    for (const { departureId } of waitingOn) { await lockTransactionKey(tx, `departure:${departureId}`); waitlistOffers += (await promoteWaitlist(tx, departureId, user.id)).offered; }
    await audit(tx, user.id, 'departures.swept', 'Departure', 'sweep', null, { tasks, closed, waitlistOffers, lapsedHolds: lapsed });
    return { tasks, closed, waitlistOffers, lapsedHolds: lapsed };
  });
}

// Public: the held quote for the guest who holds the proof, for the checkout page.
export async function checkoutHold(_r: any, args: any, context: any) {
  const hold = await context.prisma.inventoryHold.findUnique({ where: { id: args.holdId }, include: { booking: true } });
  if (!hold) throw new Error('Booking not found');
  assertProof(String(args.token || ''), hold.cartTokenHash);
  return { id: hold.id, status: hold.status, expiresAt: hold.expiresAt, quote: hold.quote, bookingRef: hold.booking?.bookingRef || null };
}
