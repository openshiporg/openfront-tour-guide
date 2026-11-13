import { randomBytes } from 'node:crypto';
import { command, audit, authorize, hashToken, derivedToken, lockTransactionKey, occupancyNumbers, userFacingError } from '../lib/tour-command';
import { applyPricingRules } from '../lib/tour-pricing';
import { selfServiceWindow } from '../lib/tour-self-service';
import { planTicketLines, partyTotals, settleChange, seatsOf, type TicketLine, type Offer } from '../lib/tour-party-change';
import { legWhere } from '../lib/tour-tender';
import { createPayment, getPaymentStatus, cancelPayment } from '../utils/paymentProviderAdapter';
import { getPublicPaymentProviderConfig } from '../utils/paymentProviderConfig';
import { reserveRefund, settleRefund, issueRefund, refreshDepartureStatus } from './tour-checkout';
import { load, stage } from './tour-self-service';
import { promoteWaitlist } from './tour-waitlist';

// Change who is on a confirmed booking: remove people, add people, or move someone to another ticket type, with the price difference
// settled on the same booking. Kept people keep their price; added people pay today's price for this departure (tour-party-change lib).
//  - Costs more, guest: added seats are held, the difference is charged by card as a SECOND payment on the booking, and the change applies
//    only when that payment has succeeded (completePartyChange). If the seats are gone by then, the payment is refunded in full.
//  - Costs more, staff: the difference is recorded as a cash payment and the change applies at once.
//  - Costs less: the change applies and the difference is refunded across the booking's payments, newest first (allocateRefund).
//    A guest gets it back under the published policy; staff refund all of it (over the refund threshold it needs a manager's approval).
// Every write is under the departure lock with an idempotency key and an audit event; provider calls happen after the commit.
const HOLD_MINUTES = 15;
type Add = { ticketTypeId: string; fullName: string; age?: number | null };
type Input = { keep: string[]; add?: Add[] };

async function bookingFor(db: any, id: string) {
  const b = await db.booking.findUnique({ where: { id }, include: { departure: { include: { tour: true } }, lines: true, participants: true } });
  if (!b) throw new Error('Booking not found');
  return b;
}
async function ticketOffers(db: any, b: any) {
  const [tickets, rules] = await Promise.all([
    db.ticketType.findMany({ where: { tourId: b.departure.tourId, active: true }, orderBy: { priceCents: 'desc' } }),
    db.pricingRule.findMany({ where: { tourId: b.departure.tourId } }),
  ]);
  const tz = b.departure.tour.timezone || 'America/New_York';
  return tickets.map((t: any) => ({ id: t.id, name: t.name, minAge: t.minAge, maxAge: t.maxAge, seatsUsed: t.countsTowardCapacity ? t.seatsUsed : 0, unitPriceCents: applyPricingRules(t.priceCents, t.id, b.departure.startAt, tz, rules).unitPriceCents }));
}
const typeOf = (p: any) => p.ticketTypeSnapshot?.ticketTypeId || '';

// The whole change, priced, without writing anything. Used by the preview and again inside the transaction that applies it.
// Prices and tax are catalog data, not booking state, so they are read once (outside the transaction) and passed in.
async function pricing(db: any, b: any) {
  const [offers, settings] = await Promise.all([ticketOffers(db, b), db.storeSettings.findFirst({ select: { taxBps: true, refundApprovalThresholdCents: true } })]);
  return { offers, settings };
}
function planChange(pr: { offers: any[]; settings: any }, b: any, input: Input, guest: boolean) {
  const keep = [...new Set((input.keep || []).map(String))];
  const add = (input.add || []).slice(0, 50).map((a: Add) => ({ ticketTypeId: String(a.ticketTypeId || ''), fullName: String(a.fullName || '').trim(), age: a.age ?? null }));
  if ((input.add || []).length > 50) throw new Error('Too many people');
  const current = b.participants;
  if (keep.some(id => !current.some((p: any) => p.id === id))) throw new Error('Someone on this change is not on the booking');
  const removed = current.filter((p: any) => !keep.includes(p.id));
  if (removed.some((p: any) => p.checkInStatus === 'checked_in')) throw new Error('A checked-in guest cannot be removed');
  if (!removed.length && !add.length) throw new Error('Nothing to change');
  const offers = pr.offers;
  for (const a of add) {
    const t = offers.find((o: any) => o.id === a.ticketTypeId);
    if (!t) throw new Error('That ticket is no longer sold for this tour');
    if (!a.fullName || a.fullName.length > 120) throw new Error('A name is needed for everyone added');
    if (a.age !== null && (!Number.isSafeInteger(a.age) || a.age < 0 || a.age > 120)) throw new Error('Age must be a whole number');
    if (a.age !== null && ((t.minAge != null && a.age < t.minAge) || (t.maxAge != null && a.age > t.maxAge))) throw new Error(`${a.fullName} does not meet the age range for ${t.name}`);
  }
  const counts: Record<string, number> = {};
  for (const p of current.filter((p: any) => keep.includes(p.id))) counts[typeOf(p)] = (counts[typeOf(p)] || 0) + 1;
  for (const a of add) counts[a.ticketTypeId] = (counts[a.ticketTypeId] || 0) + 1;
  const old: TicketLine[] = b.lines.filter((l: any) => l.kind === 'ticket').map((l: any) => ({ catalogId: l.catalogId, name: l.name, unitPriceCents: l.unitPriceCents, qty: l.qty, seatsUsed: l.seatsUsed ?? 1 }));
  const offerMap: Record<string, Offer> = Object.fromEntries(offers.map((o: any) => [o.id, { name: o.name, unitPriceCents: o.unitPriceCents, seatsUsed: o.seatsUsed }]));
  const lines = planTicketLines(old, counts, offerMap);
  const settings = pr.settings;
  const promo = b.tourSnapshot?.promo || null;
  const before = partyTotals(old, b.addOnsCents || 0, promo, settings?.taxBps || 0), after = partyTotals(lines, b.addOnsCents || 0, promo, settings?.taxBps || 0);
  const settle = settleChange({ oldTotalCents: b.totalCents, oldFeeCents: b.feeCents || 0, before, after, guest, rules: b.policySnapshot?.rules || [], hoursBefore: (b.departure.startAt.getTime() - Date.now()) / 3600000 });
  const seats = seatsOf(lines);
  return {
    keep, add, removed: removed.map((p: any) => ({ id: p.id, fullName: p.fullName })), lines, seats, seatsBefore: b.seats, addSeats: Math.max(0, seats - b.seats),
    totals: { subtotalCents: after.subtotalCents, discountCents: (b.discountCents || 0) + after.discountCents - before.discountCents, taxCents: (b.taxCents || 0) + after.taxCents - before.taxCents, feeCents: settle.feeCents, totalCents: settle.totalCents },
    ...settle, refundThresholdCents: settings?.refundApprovalThresholdCents ?? 10000,
    baseline: { totalCents: b.totalCents, seats: b.seats, departureId: b.departureId, participants: current.map((p: any) => p.id).sort() },
  };
}
const view = (P: any, currencyCode: string) => ({
  seatsBefore: P.seatsBefore, seats: P.seats, newTotalCents: P.totals.totalCents, differenceCents: P.differenceCents, collectCents: P.collectCents, refundCents: P.refundCents, keptCents: P.keptCents, currencyCode,
  removed: P.removed.map((r: any) => r.fullName), added: P.add.map((a: any) => a.fullName), lines: P.lines.map((l: any) => ({ name: l.name, qty: l.qty, unitPriceCents: l.unitPriceCents })),
});
async function roomFor(tx: any, b: any, seats: number, excludeHoldId?: string) {
  if (seats <= 0) return true;
  const o = await occupancyNumbers(tx, b.departureId, b.departure.startAt, excludeHoldId);
  return Math.max(0, o.capacity - o.booked - o.held - o.allocated) >= seats;
}
// Same booking, same people as when the change was priced: otherwise the plan is stale and must not apply.
const unchanged = (b: any, base: any) => b.status === 'confirmed' && b.totalCents === base.totalCents && b.seats === base.seats && b.departureId === base.departureId && JSON.stringify(b.participants.map((p: any) => p.id).sort()) === JSON.stringify(base.participants);

// Writes the plan onto the booking. Caller holds the departure lock and has checked the baseline and room.
async function applyPlan(tx: any, b: any, P: any, actorId: string | null, action: string, reason: string, requestId: string) {
  await tx.bookingLine.deleteMany({ where: { bookingId: b.id, kind: 'ticket' } });
  await tx.bookingLine.createMany({ data: P.lines.map((l: any) => ({ bookingId: b.id, name: l.name, unitPriceCents: l.unitPriceCents, qty: l.qty, seatsUsed: l.seatsUsed, kind: 'ticket', totalCents: l.unitPriceCents * l.qty, currencyCode: b.currencyCode, catalogId: l.catalogId })) });
  // Removed people leave the booking (their row and any signed waiver stay for the record).
  if (P.removed.length) await tx.participant.updateMany({ where: { id: { in: P.removed.map((r: any) => r.id) }, bookingId: b.id }, data: { bookingId: null } });
  const waiver = !!b.departure.tour.requiresWaiverId;
  const lineFor = (type: string) => P.lines.find((l: any) => l.catalogId === type);
  if (P.add.length) await tx.participant.createMany({ data: P.add.map((a: any) => {
    const l = lineFor(a.ticketTypeId), id = 'c' + randomBytes(12).toString('hex');
    return { id, bookingId: b.id, fullName: a.fullName, age: a.age, ticketTypeSnapshot: { ticketTypeId: a.ticketTypeId, name: l.name, unitPriceCents: l.unitPriceCents }, waiverStatus: waiver ? 'required' : 'not_required', waiverTokenHash: waiver ? hashToken(derivedToken('waiver', id)) : null };
  }) });
  await tx.booking.update({ where: { id: b.id }, data: { ...P.totals, seats: P.seats } });
  await refreshDepartureStatus(tx, b.departureId);
  if (P.seats < b.seats) await promoteWaitlist(tx, b.departureId, actorId);
  await audit(tx, actorId, action, 'Booking', b.id,
    { seats: b.seats, totalCents: b.totalCents, lines: b.lines.filter((l: any) => l.kind === 'ticket').map((l: any) => ({ name: l.name, qty: l.qty, unitPriceCents: l.unitPriceCents })) },
    { seats: P.seats, totalCents: P.totals.totalCents, lines: P.lines.map((l: any) => ({ name: l.name, qty: l.qty, unitPriceCents: l.unitPriceCents })), removed: P.removed.map((r: any) => r.fullName), added: P.add.map((a: any) => a.fullName), collectCents: P.collectCents, refundCents: P.refundCents, keptCents: P.keptCents },
    reason, requestId);
}
async function provider(db: any) {
  const p = await db.paymentProvider.findFirst({ where: { code: 'pp_stripe', isInstalled: true } });
  if (!p) throw new Error('Card payments are not set up. Contact the operator');
  return p;
}
async function settleByKey(db: any, bookingId: string, key: string, actorId: string | null, reason: string) {
  const legs = await db.refund.findMany({ where: { orderId: bookingId, ...legWhere(key) }, orderBy: { createdAt: 'asc' } });
  if (!legs.length) return null;
  return settleRefund(db, { bookingId, amount: 0, reason, key, actorId, tenderOnly: true }, { legs, replay: true });
}

// ---------- guest (manage link) ----------
function guestGuard(b: any) {
  const st = stage(b, selfServiceWindow(b.departure.startAt, b.departure.bookingCutoffMinutes));
  if (!st.can) throw new Error(st.why);
}
export async function partyChangeQuote(_r: any, args: any, context: any) {
  try {
    const db = context.prisma, b0 = await load(db, args); guestGuard(b0);
    const b = await bookingFor(db, b0.id), P = planChange(await pricing(db, b), b, args.input, true);
    return { ...view(P, b.currencyCode), roomForAdded: await roomFor(db, b, P.addSeats) };
  } catch (e) { throw userFacingError(e); }
}

export async function changeParty(_r: any, args: any, context: any) {
  try {
    const db = context.prisma, b0 = await load(db, args);
    const done = await db.partyChange.findUnique({ where: { requestKey: `changeParty:${args.idempotencyKey}` } });
    if (done && done.bookingId === b0.id) {
      if (done.status === 'pending_payment') return { changeId: done.id, status: done.status, collectCents: done.collectCents, currencyCode: done.currencyCode, ...(await paymentFor(db, done.id, b0)) };
      const r: any = done.refundCents > 0 ? await settleByKey(db, b0.id, `party-change:${done.id}`, null, done.reason) : null;
      return { changeId: done.id, status: done.status, refundCents: done.refundCents, keptCents: done.keptCents, currencyCode: done.currencyCode, replay: true, ...(r ? { refundStatus: r.status } : {}) };
    }
    guestGuard(b0);
    await dropUnpaid(db, b0.id, `changeParty:${args.idempotencyKey}`);
    const pr = await pricing(db, await bookingFor(db, b0.id));
    const result: any = await command(context, args.idempotencyKey, 'changeParty', { bookingId: b0.id, input: args.input }, [`departure:${b0.departureId}`], async (tx: any) => {
      const b = await bookingFor(tx, b0.id); guestGuard(b);
      const open = await tx.partyChange.findFirst({ where: { bookingId: b.id, status: 'pending_payment' } });
      if (open && open.expiresAt > new Date()) throw new Error('A change is waiting for payment. Finish it or let it lapse first');
      if (open) await expireChange(tx, open, null);
      const P = planChange(pr, b, args.input, true);
      if (!await roomFor(tx, b, P.addSeats)) throw new Error('Not enough seats on this departure for the people added');
      const reason = 'Guest changed the party via manage link';
      if (P.collectCents > 0) {
        const expiresAt = new Date(Math.min(Date.now() + HOLD_MINUTES * 60000, b.departure.startAt.getTime()));
        const hold = P.addSeats > 0 ? await tx.inventoryHold.create({ data: { departureId: b.departureId, quantity: P.addSeats, expiresAt, status: 'active', cartTokenHash: hashToken(derivedToken('party-hold', `${b.id}:${args.idempotencyKey}`)), quote: { partyChange: true, bookingId: b.id } } }) : null;
        const change = await tx.partyChange.create({ data: { bookingId: b.id, source: 'guest', status: 'pending_payment', plan: P, differenceCents: P.differenceCents, collectCents: P.collectCents, currencyCode: b.currencyCode, holdId: hold?.id || '', expiresAt, reason, requestKey: `changeParty:${args.idempotencyKey}` } });
        await audit(tx, null, 'party_change.requested', 'PartyChange', change.id, null, { collectCents: P.collectCents, addSeats: P.addSeats, holdId: hold?.id || null }, reason, args.idempotencyKey);
        return { changeId: change.id, status: 'pending_payment', collectCents: P.collectCents, currencyCode: b.currencyCode, expiresAt };
      }
      const change = await tx.partyChange.create({ data: { bookingId: b.id, source: 'guest', status: 'applied', plan: P, differenceCents: P.differenceCents, refundCents: P.refundCents, keptCents: P.keptCents, currencyCode: b.currencyCode, reason, requestKey: `changeParty:${args.idempotencyKey}` } });
      await applyPlan(tx, b, P, null, 'booking.party_changed', reason, args.idempotencyKey);
      if (P.refundCents > 0) await reserveRefund(tx, { bookingId: b.id, amount: P.refundCents, reason: `${reason}: difference refunded under the published policy`, key: `party-change:${change.id}`, actorId: null, tenderOnly: true });
      return { changeId: change.id, status: 'applied', refundCents: P.refundCents, keptCents: P.keptCents, currencyCode: b.currencyCode };
    });
    if (result.status === 'applied' && result.refundCents > 0) {
      const r: any = await settleByKey(db, b0.id, `party-change:${result.changeId}`, null, 'Guest changed the party via manage link');
      return { ...result, refundStatus: r?.status || 'succeeded' };
    }
    if (result.status === 'pending_payment') return { ...result, ...(await paymentFor(db, result.changeId, b0)) };
    return result;
  } catch (e) { throw userFacingError(e); }
}
// A guest who reloads mid-payment, or changes their mind, starts over: an earlier unpaid change is cancelled at the provider first (outside
// any lock; a cancelled intent can no longer be paid), then marked cancelled under the lock. A change already paid must be finished instead.
async function dropUnpaid(db: any, bookingId: string, requestKey: string) {
  const open = await db.partyChange.findFirst({ where: { bookingId, status: 'pending_payment', requestKey: { not: requestKey } } });
  if (!open) return;
  if (open.paymentIntentId) {
    const prov = await provider(db);
    const r: any = await cancelPayment({ provider: prov, paymentId: open.paymentIntentId, idempotencyKey: `party-change-cancel:${open.id}` });
    if (r?.status === 'succeeded') throw new Error('A change is waiting for payment. Finish it or let it lapse first');
  }
  await db.$transaction(async (tx: any) => {
    const b = await tx.booking.findUnique({ where: { id: bookingId }, select: { departureId: true } });
    await lockTransactionKey(tx, `departure:${b.departureId}`);
    const c = await tx.partyChange.findUnique({ where: { id: open.id } });
    if (c.status === 'pending_payment') await expireChange(tx, c, null, 'Replaced by a new change before payment');
  }, { timeout: 20000 });
}
// One PaymentIntent per change (idempotency key party-change:<id>), created after the change row commits.
async function paymentFor(db: any, changeId: string, b: any) {
  const change = await db.partyChange.findUnique({ where: { id: changeId } });
  const prov = await provider(db);
  if (!change.paymentIntentId) {
    const created = await createPayment({ provider: prov, order: { id: b.id, orderNumber: b.bookingRef }, amount: change.collectCents, currency: change.currencyCode, idempotencyKey: `party-change:${change.id}` });
    await db.partyChange.updateMany({ where: { id: change.id, paymentIntentId: '' }, data: { paymentIntentId: created.paymentIntentId, clientSecret: created.clientSecret } });
  }
  const fresh = await db.partyChange.findUnique({ where: { id: change.id } });
  return { clientSecret: fresh.clientSecret, publishableKey: getPublicPaymentProviderConfig(prov.code)?.publishableKey || null, expiresAt: fresh.expiresAt };
}
async function expireChange(tx: any, change: any, actorId: string | null, reason = 'Payment not completed in time') {
  await tx.partyChange.update({ where: { id: change.id }, data: { status: 'cancelled' } });
  if (change.holdId) await tx.inventoryHold.updateMany({ where: { id: change.holdId, status: 'active' }, data: { status: 'released' } });
  await audit(tx, actorId, 'party_change.cancelled', 'PartyChange', change.id, { status: change.status }, { status: 'cancelled' }, reason);
}

// After the card is confirmed in the browser. Reads the provider first (outside any lock), then applies under the departure lock.
// Safe to call again: an applied change returns as applied; a failed one stays failed with its refund.
export async function completePartyChange(_r: any, args: any, context: any) {
  try {
    const db = context.prisma, b0 = await load(db, args);
    const change = await db.partyChange.findUnique({ where: { id: String(args.changeId || '') } });
    if (!change || change.bookingId !== b0.id) throw new Error('Change not found');
    if (change.status === 'applied') return { changeId: change.id, status: 'applied', bookingRef: b0.bookingRef };
    if (change.status !== 'pending_payment') throw new Error(change.status === 'failed' ? 'This change could not be made and its payment was refunded' : 'This change was cancelled');
    if (!change.paymentIntentId) throw new Error('Payment has not started');
    const prov = await provider(db);
    const observed = await getPaymentStatus({ provider: prov, paymentId: change.paymentIntentId });
    if (observed.status !== 'succeeded') {
      if (change.expiresAt <= new Date()) {
        await db.$transaction(async (tx: any) => { await lockTransactionKey(tx, `departure:${b0.departureId}`); const c = await tx.partyChange.findUnique({ where: { id: change.id } }); if (c.status === 'pending_payment') await expireChange(tx, c, null); }, { timeout: 20000 });
        try { await cancelPayment({ provider: prov, paymentId: change.paymentIntentId, idempotencyKey: `party-change-cancel:${change.id}` }); } catch { /* the intent lapses on its own */ }
        throw new Error('The time to pay for this change ran out. Nothing was charged and nothing changed');
      }
      throw new Error('Payment not completed');
    }
    if (observed.amount !== change.collectCents || String(observed.currencyCode).toUpperCase() !== change.currencyCode) throw new Error('Payment amount does not match the change; contact the operator');
    let failed = false;
    await db.$transaction(async (tx: any) => {
      const b = await bookingFor(tx, b0.id);
      await lockTransactionKey(tx, `departure:${b.departureId}`);
      const c = await tx.partyChange.findUnique({ where: { id: change.id } });
      if (c.status !== 'pending_payment' && c.status !== 'cancelled') return; // applied or failed by a concurrent call
      // The money is captured either way, so it is recorded as the booking's second payment before deciding.
      await tx.payment.upsert({ where: { idempotencyKey: `party-change:${c.id}` }, update: {}, create: { idempotencyKey: `party-change:${c.id}`, amount: c.collectCents, currencyCode: c.currencyCode, status: 'succeeded', paymentMethod: 'credit_card', cardBrand: observed?.cardBrand || '', cardLast4: observed?.cardLast4 || '', paymentProviderId: prov.id, providerPaymentId: c.paymentIntentId, orderId: b.id, processedAt: new Date(), isSplitPayment: true, notes: 'Party change difference', data: { paymentIntentId: c.paymentIntentId, partyChangeId: c.id } } });
      const P = c.plan;
      const hold = c.holdId ? await tx.inventoryHold.findUnique({ where: { id: c.holdId } }) : null;
      const held = !!hold && hold.status === 'active' && hold.expiresAt > new Date();
      if (!unchanged(b, P.baseline) || (!held && !await roomFor(tx, b, P.addSeats, hold?.id))) {
        failed = true;
        await tx.partyChange.update({ where: { id: c.id }, data: { status: 'failed' } });
        if (hold?.status === 'active') await tx.inventoryHold.update({ where: { id: hold.id }, data: { status: 'released' } });
        await audit(tx, null, 'party_change.failed', 'PartyChange', c.id, { status: c.status }, { status: 'failed' }, 'Seats or booking changed before payment completed; payment refunded', args.idempotencyKey || c.id);
        return;
      }
      if (hold) await tx.inventoryHold.update({ where: { id: hold.id }, data: { status: 'converted' } });
      await tx.partyChange.update({ where: { id: c.id }, data: { status: 'applied' } });
      await applyPlan(tx, b, P, null, 'booking.party_changed', `${c.reason}: difference paid by card`, args.idempotencyKey || c.id);
    }, { timeout: 20000 });
    if (failed) {
      await issueRefund(db, { bookingId: b0.id, amount: change.collectCents, reason: 'Party change could not be made after payment', key: `party-change-failed:${change.id}`, actorId: null, tenderOnly: true });
      throw new Error('The seats were taken before your payment went through. Your payment for the change was refunded and your booking is as it was');
    }
    return { changeId: change.id, status: 'applied', bookingRef: b0.bookingRef };
  } catch (e) { throw userFacingError(e); }
}

// ---------- staff (dashboard) ----------
function staffGuard(b: any) {
  if (b.status !== 'confirmed') throw new Error('Only a confirmed booking can be changed');
  if (b.channelId) throw new Error('Reseller bookings are changed through the reseller');
  if (b.departure.startAt.getTime() <= Date.now()) throw new Error('This departure has started');
}
export async function bookingParty(_r: any, args: any, context: any) {
  try {
    await authorize(context, 'canManageBookings');
    const db = context.prisma, b = await bookingFor(db, String(args.bookingId || ''));
    let canChange = true, why = '';
    try { staffGuard(b); } catch (e: any) { canChange = false; why = e.message; }
    const pending = await db.partyChange.findFirst({ where: { bookingId: b.id, status: 'pending_payment', expiresAt: { gt: new Date() } }, select: { id: true, collectCents: true } });
    return { bookingRef: b.bookingRef, canChange: canChange && !pending, reason: pending ? 'The guest is paying for a change right now' : why, currencyCode: b.currencyCode, totalCents: b.totalCents,
      participants: b.participants.map((p: any) => ({ id: p.id, fullName: p.fullName, ticket: p.ticketTypeSnapshot?.name || '', checkedIn: p.checkInStatus === 'checked_in' })),
      tickets: canChange ? (await ticketOffers(db, b)).map((t: any) => ({ id: t.id, name: t.name, unitPriceCents: t.unitPriceCents })) : [] };
  } catch (e) { throw userFacingError(e); }
}
export async function bookingPartyQuote(_r: any, args: any, context: any) {
  try {
    await authorize(context, 'canManageBookings');
    const db = context.prisma, b = await bookingFor(db, String(args.bookingId || '')); staffGuard(b);
    const P = planChange(await pricing(db, b), b, args.input, false);
    return { ...view(P, b.currencyCode), roomForAdded: await roomFor(db, b, P.addSeats), needsApproval: P.refundCents > P.refundThresholdCents };
  } catch (e) { throw userFacingError(e); }
}
export async function changeBookingParty(_r: any, args: any, context: any) {
  try {
    const user = await authorize(context, 'canManageBookings');
    const i = args.input || {}, reason = String(i.reason || '').trim();
    if (!reason) throw new Error('A reason is required');
    const b0 = await bookingFor(context.prisma, String(i.bookingId || ''));
    // A retry of a committed change (same key) answers from the change row before anything is re-planned against the changed booking.
    const done = await context.prisma.partyChange.findUnique({ where: { requestKey: `changeBookingParty:${args.idempotencyKey}` } });
    if (done && done.bookingId === b0.id) {
      const r: any = done.refundCents > 0 ? await settleByKey(context.prisma, b0.id, `party-change:${done.id}`, user.id, done.reason) : null;
      return { changeId: done.id, bookingRef: b0.bookingRef, status: done.status, seats: done.plan?.seats, totalCents: done.plan?.totals?.totalCents, collectCents: done.collectCents, refundCents: done.refundCents, currencyCode: done.currencyCode, replay: true, ...(r ? { refundStatus: r.status } : {}) };
    }
    const pr = await pricing(context.prisma, b0);
    const preview = planChange(pr, b0, i, false);
    let approvalId: string | undefined;
    if (preview.refundCents > 0) {
      await authorize(context, 'canIssueRefunds');
      // Same rule as Refund: over the threshold the requester's own approved request for this exact amount and reason is used.
      if (preview.refundCents > preview.refundThresholdCents) {
        const match = await context.prisma.managerApproval.findFirst({ where: { actionType: 'refund_booking', targetId: b0.id, amount: preview.refundCents, reason, requestedById: user.id, status: 'approved', expiresAt: { gt: new Date() } }, orderBy: { approvedAt: 'desc' }, select: { id: true } });
        approvalId = match?.id;
      }
    }
    const result: any = await command(context, args.idempotencyKey, 'changeBookingParty', { bookingId: b0.id, keep: i.keep, add: i.add, reason }, [`departure:${b0.departureId}`], async (tx: any) => {
      const b = await bookingFor(tx, b0.id); staffGuard(b);
      if (await tx.partyChange.findFirst({ where: { bookingId: b.id, status: 'pending_payment', expiresAt: { gt: new Date() } } })) throw new Error('The guest is paying for a change right now. Try again in a few minutes');
      const P = planChange(pr, b, i, false);
      if (P.refundCents !== preview.refundCents || P.collectCents !== preview.collectCents) throw new Error('Prices changed while you were editing. Check the new amount and try again');
      if (!await roomFor(tx, b, P.addSeats)) throw new Error('Not enough seats on this departure for the people added');
      const change = await tx.partyChange.create({ data: { bookingId: b.id, source: 'staff', status: 'applied', plan: P, differenceCents: P.differenceCents, collectCents: P.collectCents, refundCents: P.refundCents, currencyCode: b.currencyCode, reason, requestKey: `changeBookingParty:${args.idempotencyKey}` } });
      if (P.collectCents > 0) await tx.payment.create({ data: { idempotencyKey: `party-change:${change.id}`, amount: P.collectCents, currencyCode: b.currencyCode, status: 'succeeded', paymentMethod: 'cash', orderId: b.id, processedAt: new Date(), processedById: user.id, isSplitPayment: true, notes: 'Party change difference, collected by operator', data: { partyChangeId: change.id } } });
      await applyPlan(tx, b, P, user.id, 'booking.party_changed', reason, args.idempotencyKey);
      // The approval (if any) is consumed here, in the same transaction as the change.
      if (P.refundCents > 0) await reserveRefund(tx, { bookingId: b.id, amount: P.refundCents, reason, key: `party-change:${change.id}`, actorId: user.id, approvalId, approvalThresholdCents: P.refundThresholdCents, tenderOnly: true });
      return { changeId: change.id, bookingRef: b.bookingRef, status: 'applied', seats: P.seats, totalCents: P.totals.totalCents, collectCents: P.collectCents, refundCents: P.refundCents, currencyCode: b.currencyCode };
    });
    if (result.refundCents > 0) {
      const r: any = await settleByKey(context.prisma, b0.id, `party-change:${result.changeId}`, user.id, reason);
      return { ...result, refundStatus: r?.status || 'succeeded' };
    }
    return result;
  } catch (e) {
    const err: any = userFacingError(e);
    if (/approval is required|approval request not found/i.test(err?.message || '')) throw userFacingError(new Error('The refund for this change is over the approval threshold. Request approval for this exact amount and reason first'));
    throw err;
  }
}
