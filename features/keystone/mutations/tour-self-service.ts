import { timingSafeEqual } from 'node:crypto';
import { command, audit, derivedToken, occupancyNumbers, userFacingError } from '../lib/tour-command';
import { applyPricingRules } from '../lib/tour-pricing';
import { refundPolicyAmount } from '../lib/tour-money';
import { describePolicy, samePrice, selfServiceWindow } from '../lib/tour-self-service';
import { issueRefund, refreshDepartureStatus } from './tour-checkout';

// Guest self-service behind a manage link. The proof is an HMAC of the booking id that only the server can compute
// (derivedToken('manage', id)); nothing is stored, and the token travels in the URL fragment and in request bodies only.
const OPEN_FOR_SALE = ['on_sale', 'confirmed', 'min_not_met'];
const norm = (s: string) => String(s || '').trim().toUpperCase();
export const manageToken = (bookingId: string) => derivedToken('manage', bookingId);
function assertManageProof(booking: any, token: string) {
  const expected = Buffer.from(manageToken(booking.id)), given = Buffer.from(String(token || ''));
  if (!booking || given.length !== expected.length || !timingSafeEqual(expected, given)) throw new Error('Booking not found');
}
async function load(db: any, args: any) {
  const booking = await db.booking.findUnique({ where: { bookingRef: norm(args.bookingRef) }, include: { departure: { include: { tour: { include: { meetingPoint: true } } } }, lines: true, participants: { select: { id: true, fullName: true, waiverStatus: true } } } });
  if (!booking) throw new Error('Booking not found');
  assertManageProof(booking, args.token);
  return booking;
}
const stage = (b: any, window: { open: boolean }) => !['confirmed'].includes(b.status) ? { can: false, why: b.status === 'cancelled' || b.status === 'refunded' ? 'This booking is cancelled.' : 'This booking can no longer be changed online. Contact the operator.' }
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
      lines: b.lines.map((l: any) => ({ name: l.name, qty: l.qty, kind: l.kind })), participants: b.participants.map((p: any) => ({ fullName: p.fullName, waiverStatus: p.waiverStatus })),
      policy: describePolicy(rules), changesCloseAt: window.closesAt, canChange: st.can, reason: st.why,
      refundIfCancelledCents: st.can ? refundPolicyAmount(b.totalCents - b.refundedCents, rules, (b.departure.startAt.getTime() - Date.now()) / 3600000) : 0,
      options: st.can ? await options(db, b) : [],
    };
  } catch (e) { throw userFacingError(e); }
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
    return await command(context, args.idempotencyKey, 'rescheduleManagedBooking', { bookingId: b0.id, departureId: targetId }, [`departure:${b0.departureId}`, `departure:${targetId}`], async (tx: any) => {
      const old = await tx.booking.findUnique({ where: { id: b0.id }, select: { id: true, status: true, departureId: true, seats: true, channelId: true, holdId: true, tourSnapshot: true } });
      // Replay of a committed move with a new key lands here as "already there": harmless, and a different target is judged on its own merits.
      if (old.departureId === targetId) throw new Error('Choose a different departure');
      const st = stage({ status: old.status, channelId: old.channelId }, selfServiceWindow(b0.departure.startAt, b0.departure.bookingCutoffMinutes));
      if (!st.can) throw new Error(st.why);
      if (old.departureId !== b0.departureId) throw new Error('This booking has already been changed');
      const target = await tx.departure.findUnique({ where: { id: targetId }, include: { tour: true } });
      if (!target || target.tourId !== b0.departure.tourId) throw new Error('Choose a departure of the same tour');
      if (target.tour.status !== 'active' || !OPEN_FOR_SALE.includes(target.status) || !selfServiceWindow(target.startAt, target.bookingCutoffMinutes).open) throw new Error('That departure is not open for booking');
      const price = await priceOn(tx, b0, target);
      if (!price || !samePrice(price, b0)) throw new Error('That departure is priced differently. Choose one at the same price, or cancel under the policy');
      const o = await occupancyNumbers(tx, target.id, target.startAt);
      if (Math.max(0, target.capacity - o.booked - o.held - o.allocated) < (old.seats || 1)) throw new Error('Not enough seats on that departure');
      const snapshot = { ...(old.tourSnapshot || {}), startAt: target.startAt, endAt: target.endAt };
      const moved = await tx.booking.updateMany({ where: { id: old.id, status: 'confirmed', departureId: old.departureId }, data: { departureId: target.id, tourSnapshot: snapshot } });
      if (moved.count !== 1) throw new Error('This booking has already been changed');
      if (old.holdId) await tx.inventoryHold.update({ where: { id: old.holdId }, data: { departureId: target.id } });
      await refreshDepartureStatus(tx, old.departureId); await refreshDepartureStatus(tx, target.id);
      await audit(tx, null, 'booking.self_rescheduled', 'Booking', old.id, { departureId: old.departureId, startAt: b0.departure.startAt }, { departureId: target.id, startAt: target.startAt, totalCents: b0.totalCents }, 'Guest rescheduled via manage link at the same price', args.idempotencyKey);
      return { bookingRef: b0.bookingRef, previousStartAt: b0.departure.startAt, startAt: target.startAt, manageToken: manageToken(old.id) };
    });
  } catch (e) { throw userFacingError(e); }
}
