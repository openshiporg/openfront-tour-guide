import { timingSafeEqual } from 'node:crypto';
import { command, audit, authorize, manageToken, occupancyNumbers, userFacingError } from '../lib/tour-command';
import { applyPricingRules } from '../lib/tour-pricing';
import { refundPolicyAmount } from '../lib/tour-money';
import { manageLinkPath, describePolicy, samePrice, selfServiceWindow } from '../lib/tour-self-service';
import { issueRefund, refreshDepartureStatus } from './tour-checkout';
import { promoteWaitlist } from './tour-waitlist';

// Guest self-service behind a manage link. The proof is an HMAC of the booking id that only the server can compute
// (derivedToken('manage', id)); nothing is stored, and the token travels in the URL fragment and in request bodies only.
const OPEN_FOR_SALE = ['on_sale', 'confirmed', 'min_not_met'];
const norm = (s: string) => String(s || '').trim().toUpperCase();
export { manageToken };
function assertManageProof(booking: any, token: string) {
  const expected = Buffer.from(manageToken(booking.id, booking.manageTokenVersion || 0)), given = Buffer.from(String(token || ''));
  if (!booking || given.length !== expected.length || !timingSafeEqual(expected, given)) throw new Error('Booking not found');
}
export async function load(db: any, args: any) {
  const booking = await db.booking.findUnique({ where: { bookingRef: norm(args.bookingRef) }, include: { departure: { include: { tour: { include: { meetingPoint: true } } } }, lines: true, participants: { select: { id: true, fullName: true, waiverStatus: true, checkInStatus: true, ticketTypeSnapshot: true } } } });
  if (!booking) throw new Error('Booking not found');
  assertManageProof(booking, args.token);
  // A valid link stops working when the departure has ended (checked after the proof, so a wrong token learns nothing).
  if (booking.departure.endAt.getTime() <= Date.now()) throw new Error('This link has expired. The departure has ended.');
  return booking;
}
export const stage = (b: any, window: { open: boolean }) => !['confirmed'].includes(b.status) ? { can: false, why: b.status === 'cancelled' || b.status === 'refunded' ? 'This booking is cancelled.' : 'This booking can no longer be changed online. Contact the operator.' }
  : b.channelId ? { can: false, why: 'This booking was made through a reseller. Contact them or the operator to change it.' }
  : !window.open ? { can: false, why: 'Online changes closed before the start. Contact the operator.' } : { can: true, why: '' };

// What this booking's tickets and add-ons would cost on departure d (pricing rules apply to the departure's start). null = something no longer sold.
async function priceOn(db: any, b: any, d: any) {
  const rules = await db.pricingRule.findMany({ where: { tourId: d.tourId } });
  const tickets = await db.ticketType.findMany({ where: { id: { in: b.lines.filter((l: any) => l.kind === 'ticket').map((l: any) => l.catalogId) }, active: true } });
  const addOns = await db.addOn.findMany({ where: { id: { in: b.lines.filter((l: any) => l.kind === 'addon').map((l: any) => l.catalogId) } } });
  return priceWith(b, d, rules, tickets, addOns);
}
function priceWith(b: any, d: any, rules: any[], tickets: any[], addOns: any[]) {
  const tz = b.departure?.tour?.timezone || 'America/New_York';
  let subtotalCents = 0, addOnsCents = 0;
  for (const l of b.lines) {
    if (l.kind === 'ticket') { const t = tickets.find((x: any) => x.id === l.catalogId); if (!t) return null; subtotalCents += applyPricingRules(t.priceCents, t.id, d.startAt, tz, rules).unitPriceCents * l.qty; }
    else { const a = addOns.find((x: any) => x.id === l.catalogId); if (!a) return null; addOnsCents += a.priceCents * l.qty; }
  }
  return { subtotalCents, addOnsCents };
}

// Same tour, still open for sale, room for the party, and the same ticket and add-on subtotals as today.
async function options(db: any, b: any) {
  const now = new Date();
  const deps = await db.departure.findMany({ where: { tourId: b.departure.tourId, id: { not: b.departureId }, status: { in: OPEN_FOR_SALE }, startAt: { gt: now, lt: new Date(+now + 120 * 86400000) } }, orderBy: { startAt: 'asc' }, take: 40 });
  const rules = await db.pricingRule.findMany({ where: { tourId: b.departure.tourId } });
  const tickets = await db.ticketType.findMany({ where: { id: { in: b.lines.filter((l: any) => l.kind === 'ticket').map((l: any) => l.catalogId) }, active: true } });
  const addOns = await db.addOn.findMany({ where: { id: { in: b.lines.filter((l: any) => l.kind === 'addon').map((l: any) => l.catalogId) } } });
  const out: any[] = [], priced: any[] = [];
  for (const d of deps) {
    if (!selfServiceWindow(d.startAt, d.bookingCutoffMinutes, now).open) continue;
    const price = priceWith(b, d, rules, tickets, addOns);
    if (!price || !samePrice(price, b)) continue;
    priced.push(d);
  }
  if (!priced.length) return out;
  const ids = priced.map((d: any) => d.id), LIVE = ['confirmed', 'checked_in', 'completed', 'no_show'];
  const [booked, held, channels, channelSold] = await Promise.all([
    db.booking.groupBy({ by: ['departureId'], where: { departureId: { in: ids }, status: { in: LIVE } }, _sum: { seats: true } }),
    db.inventoryHold.groupBy({ by: ['departureId'], where: { departureId: { in: ids }, status: 'active', expiresAt: { gt: now } }, _sum: { quantity: true } }),
    db.channel.findMany({ where: { active: true, allocation: { gt: 0 } } }),
    db.booking.groupBy({ by: ['departureId', 'channelId'], where: { departureId: { in: ids }, channelId: { not: null }, status: { in: LIVE } }, _sum: { seats: true } }),
  ]);
  const sum = (rows: any[], id: string, k: string) => rows.find((r) => r.departureId === id)?._sum[k] || 0;
  for (const d of priced) {
    const far = d.startAt.getTime() - now.getTime() > 86400000;
    const reserved = far ? channels.reduce((n: number, c: any) => n + Math.max(0, c.allocation - (channelSold.find((x: any) => x.departureId === d.id && x.channelId === c.id)?._sum.seats || 0)), 0) : 0;
    const remaining = Math.max(0, d.capacity - sum(booked, d.id, 'seats') - sum(held, d.id, 'quantity') - reserved);
    if (remaining >= (b.seats || 1)) out.push({ id: d.id, startAt: d.startAt, endAt: d.endAt, remaining });
  }
  return out;
}

export async function manageBooking(_r: any, args: any, context: any) {
  try {
    const db = context.prisma, b = await load(db, args);
    const window = selfServiceWindow(b.departure.startAt, b.departure.bookingCutoffMinutes);
    const st = stage(b, window);
    const rules = b.policySnapshot?.rules || [];
    const mp = b.departure.tour.meetingPoint;
    return {
      bookingRef: b.bookingRef, status: b.status, guestName: b.guestName, totalCents: b.totalCents, refundedCents: b.refundedCents, currencyCode: b.currencyCode, seats: b.seats,
      tourName: b.tourSnapshot?.name || b.departure.tour.name, startAt: b.departure.startAt, timezone: b.tourSnapshot?.timezone || b.departure.tour.timezone,
      meetingPoint: mp ? { name: mp.name, address: mp.address, instructions: mp.instructions } : null,
      lines: b.lines.map((l: any) => ({ name: l.name, qty: l.qty, kind: l.kind })), participants: b.participants.map((p: any) => ({ id: p.id, fullName: p.fullName, waiverStatus: p.waiverStatus, ticket: p.ticketTypeSnapshot?.name || '' })),
      tickets: st.can ? await partyTickets(db, b) : [],
      policy: describePolicy(rules), changesCloseAt: window.closesAt, canChange: st.can, reason: st.why,
      refundIfCancelledCents: st.can ? refundPolicyAmount(b.totalCents - b.refundedCents, rules, (b.departure.startAt.getTime() - Date.now()) / 3600000) : 0,
      options: st.can ? await options(db, b) : [],
    };
  } catch (e) { throw userFacingError(e); }
}

// Tickets a guest can add on this departure, at today's price for it.
async function partyTickets(db: any, b: any) {
  const [tickets, rules] = await Promise.all([db.ticketType.findMany({ where: { tourId: b.departure.tourId, active: true }, orderBy: { priceCents: 'desc' } }), db.pricingRule.findMany({ where: { tourId: b.departure.tourId } })]);
  return tickets.map((t: any) => ({ id: t.id, name: t.name, unitPriceCents: applyPricingRules(t.priceCents, t.id, b.departure.startAt, b.departure.tour.timezone || 'America/New_York', rules).unitPriceCents, minAge: t.minAge, maxAge: t.maxAge }));
}

// Cancel under the booking's published policy. The refund amount comes from the policy snapshot taken at booking time, never from the caller.
// One self-service refund key per booking, so a retry, a double click or two tabs cannot refund twice.
export async function cancelManagedBooking(_r: any, args: any, context: any) {
  try {
    const db = context.prisma, b = await load(db, args);
    const key = `selfcancel:${b.id}`;
    const done = await db.auditEvent.findFirst({ where: { action: 'booking.cancelled', targetId: b.id, requestId: key }, select: { id: true } });
    if (done) return { bookingRef: b.bookingRef, status: (await db.booking.findUnique({ where: { id: b.id } })).status, refundCents: (await db.refund.findUnique({ where: { idempotencyKey: key } }))?.amount || 0, replay: true };
    const st = stage(b, selfServiceWindow(b.departure.startAt, b.departure.bookingCutoffMinutes));
    if (!st.can) throw new Error(st.why);
    const amount = refundPolicyAmount(b.totalCents - b.refundedCents, b.policySnapshot?.rules || [], (b.departure.startAt.getTime() - Date.now()) / 3600000);
    const share = b.totalCents ? Math.round(amount * 100 / (b.totalCents - b.refundedCents || 1)) : 0;
    await issueRefund(db, { bookingId: b.id, amount, reason: `Guest cancelled via manage link under the published policy (${share}% refunded)`, key, actorId: null, cancel: true });
    const after = await db.booking.findUnique({ where: { id: b.id } });
    return { bookingRef: b.bookingRef, status: after.status, refundCents: amount, replay: false };
  } catch (e) { throw userFacingError(e); }
}

// Move to another departure of the same tour, in place: the same booking, payment, participants, waivers and manage link follow the guest,
// so no second booking, hold or payment is created and a later refund still draws on the original capture. Both departures are locked,
// the target is re-checked for status, cutoff, room and the same ticket/add-on subtotals, and the move is audited with both times.
export async function rescheduleManagedBooking(_r: any, args: any, context: any) {
  try {
    const db = context.prisma, b0 = await load(db, args);
    const targetId = String(args.departureId || '');
    if (!targetId) throw new Error('Choose a departure');
    return await command(context, args.idempotencyKey, 'rescheduleManagedBooking', { bookingId: b0.id, departureId: targetId }, [`departure:${b0.departureId}`, `departure:${targetId}`], (tx: any) =>
      moveInTx(tx, b0, targetId, { actorId: null, action: 'booking.self_rescheduled', reason: 'Guest rescheduled via manage link at the same price', requestId: args.idempotencyKey, guest: true }));
  } catch (e) { throw userFacingError(e); }
}

// The move itself, shared by the guest link and the operator. Caller holds both departure locks. Guests are held to the CURRENT departure's
// cutoff (self-service window); staff may move a booking until its departure starts. Both are held to the TARGET's booking cutoff and the same price.
async function moveInTx(tx: any, b0: any, targetId: string, o: { actorId: string | null; action: string; reason: string; requestId: string; guest: boolean }) {
  const old = await tx.booking.findUnique({ where: { id: b0.id }, select: { id: true, status: true, departureId: true, seats: true, channelId: true, holdId: true, tourSnapshot: true, manageTokenVersion: true } });
  // Replay of a committed move with a new key lands here as "already there": harmless, and a different target is judged on its own merits.
  if (old.departureId === targetId) throw new Error('Choose a different departure');
  if (o.guest) { const st = stage({ status: old.status, channelId: old.channelId }, selfServiceWindow(b0.departure.startAt, b0.departure.bookingCutoffMinutes)); if (!st.can) throw new Error(st.why); }
  else {
    if (old.status !== 'confirmed') throw new Error('Only a confirmed booking can be moved');
    if (old.channelId) throw new Error('Reseller bookings are changed through the reseller');
    if (b0.departure.startAt.getTime() <= Date.now()) throw new Error('This departure has started. It can no longer be moved');
  }
  if (old.departureId !== b0.departureId) throw new Error('This booking has already been changed');
  const target = await tx.departure.findUnique({ where: { id: targetId }, include: { tour: true } });
  if (!target || target.tourId !== b0.departure.tourId) throw new Error('Choose a departure of the same tour');
  if (target.tour.status !== 'active' || !OPEN_FOR_SALE.includes(target.status) || !selfServiceWindow(target.startAt, target.bookingCutoffMinutes).open) throw new Error('That departure is not open for booking');
  const price = await priceOn(tx, b0, target);
  if (!price || !samePrice(price, b0)) throw new Error(o.guest ? 'That departure is priced differently. Choose one at the same price, or cancel under the policy' : 'That departure is priced differently. Choose one at the same price, or refund and book again');
  const occ = await occupancyNumbers(tx, target.id, target.startAt);
  if (Math.max(0, target.capacity - occ.booked - occ.held - occ.allocated) < (old.seats || 1)) throw new Error('Not enough seats on that departure');
  const snapshot = { ...(old.tourSnapshot || {}), startAt: target.startAt, endAt: target.endAt };
  const moved = await tx.booking.updateMany({ where: { id: old.id, status: 'confirmed', departureId: old.departureId }, data: { departureId: target.id, tourSnapshot: snapshot } });
  if (moved.count !== 1) throw new Error('This booking has already been changed');
  if (old.holdId) await tx.inventoryHold.update({ where: { id: old.holdId }, data: { departureId: target.id } });
  await refreshDepartureStatus(tx, old.departureId); await refreshDepartureStatus(tx, target.id);
  await promoteWaitlist(tx, old.departureId, o.actorId);
  await audit(tx, o.actorId, o.action, 'Booking', old.id, { departureId: old.departureId, startAt: b0.departure.startAt }, { departureId: target.id, startAt: target.startAt, totalCents: b0.totalCents }, o.reason, o.requestId);
  return { bookingRef: b0.bookingRef, previousStartAt: b0.departure.startAt, startAt: target.startAt, manageToken: manageToken(old.id, old.manageTokenVersion || 0) };
}

async function loadForStaff(db: any, bookingId: string) {
  const b = await db.booking.findUnique({ where: { id: String(bookingId || '') }, include: { departure: { include: { tour: { include: { meetingPoint: true } } } }, lines: true, participants: { select: { id: true, fullName: true, waiverStatus: true } } } });
  if (!b) throw new Error('Booking not found');
  return b;
}

// Operator read for the Move popover: departures this booking can move to (same tour, same price, room for the party, target still open).
export async function bookingMoveOptions(_r: any, args: any, context: any) {
  try {
    await authorize(context, 'canManageBookings');
    const db = context.prisma, b = await loadForStaff(db, args.bookingId);
    if (b.status !== 'confirmed' || b.channelId || b.departure.startAt.getTime() <= Date.now()) return { bookingRef: b.bookingRef, canMove: false, options: [] };
    return { bookingRef: b.bookingRef, canMove: true, options: await options(db, b) };
  } catch (e) { throw userFacingError(e); }
}

// Operator "Move": a guest calls to change the date. The same in-place move as the guest link (same booking, payment, participants, waivers
// and link), allowed until the current departure starts, audited with the staff member and a required reason, replay-safe by key.
export async function moveBooking(_r: any, args: any, context: any) {
  try {
    const user = await authorize(context, 'canManageBookings'); const i = args.input || {};
    const reason = String(i.reason || '').trim(), targetId = String(i.departureId || '');
    if (!reason) throw new Error('A reason is required');
    if (!targetId) throw new Error('Choose a departure');
    const b0 = await loadForStaff(context.prisma, i.bookingId);
    return await command(context, args.idempotencyKey, 'moveBooking', { bookingId: b0.id, departureId: targetId, reason }, [`departure:${b0.departureId}`, `departure:${targetId}`], (tx: any) =>
      moveInTx(tx, b0, targetId, { actorId: user.id, action: 'booking.moved', reason, requestId: args.idempotencyKey, guest: false }));
  } catch (e) { throw userFacingError(e); }
}

// Operator "Reset guest link": bumps the booking's token version so the old link (and any copy of it) stops working at once, and returns the
// new path for the operator to give to the guest. One booking only. Audited with who did it and why; a retry with the same key returns the same link.
export async function resetGuestLink(_r: any, args: any, context: any) {
  try {
    const user = await authorize(context, 'canManageBookings'); const i = args.input || {};
    const reason = String(i.reason || '').trim();
    if (!reason) throw new Error('A reason is required');
    const booking = await context.prisma.booking.findUnique({ where: { id: String(i.bookingId || '') }, select: { id: true, bookingRef: true, departureId: true } });
    if (!booking) throw new Error('Booking not found');
    return await command(context, args.idempotencyKey, 'resetGuestLink', { bookingId: booking.id, reason }, [`departure:${booking.departureId}`], async tx => {
      const cur = await tx.booking.findUnique({ where: { id: booking.id }, select: { status: true, channelId: true, manageTokenVersion: true } });
      if (cur.status !== 'confirmed') throw new Error('Only a confirmed booking has a guest link to reset');
      if (cur.channelId) throw new Error('Reseller bookings are changed through the reseller');
      const from = cur.manageTokenVersion || 0;
      // Compare-and-set on the version read under the departure lock.
      const bumped = await tx.booking.updateMany({ where: { id: booking.id, OR: [{ manageTokenVersion: from }, ...(from === 0 ? [{ manageTokenVersion: null }] : [])] }, data: { manageTokenVersion: from + 1 } });
      if (bumped.count !== 1) throw new Error('The link was reset by someone else. Reload and try again');
      await audit(tx, user.id, 'booking.guest_link_reset', 'Booking', booking.id, { version: from }, { version: from + 1 }, reason, args.idempotencyKey);
      return { bookingRef: booking.bookingRef, version: from + 1, link: manageLinkPath(booking.bookingRef, manageToken(booking.id, from + 1)) };
    });
  } catch (e) { throw userFacingError(e); }
}
