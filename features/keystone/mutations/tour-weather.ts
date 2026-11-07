import { command, audit, authorize, occupancyNumbers, derivedToken, userFacingError } from '../lib/tour-command';
import { placeHold } from './tour-catalog';
import { confirmBooking, newBooking, queueGuestNotification } from './tour-checkout';
import { closeWaitlist } from './tour-waitlist';

const PENDING = ['confirmed', 'checked_in', 'partially_refunded'];
const OPEN_FOR_SALE = ['on_sale', 'confirmed', 'min_not_met'];

// Weather cancellation. The departure is cancelled with a required reason, every booking gets a weatherCancellation notice
// (queued, or held back by the guest's preference; no transport) and then WAITS for the guest's choice: a rebook onto another
// departure of the same tour (rebookWeatherBooking) or a full refund, which goes through the normal approval-bound refundBooking.
export async function weatherCancelDeparture(_r: any, args: any, context: any) {
  try { return await weatherCancelCore(args, context); } catch (e) { throw userFacingError(e); }
}
async function weatherCancelCore(args: any, context: any) {
  const user = await authorize(context, 'canManageDepartures');
  const i = args.input, reason = String(i.reason || '').trim();
  if (reason.length < 3) throw new Error('A weather reason is required (for example "Small-craft advisory")');
  if (reason.length > 500) throw new Error('Reason is too long (maximum 500 characters)');
  return command(context, args.idempotencyKey, 'weatherCancelDeparture', { departureId: i.departureId, reason }, [`departure:${i.departureId}`], async (tx: any) => {
    const d = await tx.departure.findUnique({ where: { id: i.departureId }, include: { tour: true } });
    if (!d) throw new Error('Departure not found');
    if (['completed', 'in_progress'].includes(d.status)) throw new Error('Departure already ran');
    if (d.status === 'cancelled') throw new Error('Departure is already cancelled for another reason');
    if (d.status !== 'weather_cancelled') {
      await tx.departure.update({ where: { id: d.id }, data: { status: 'weather_cancelled' } });
      await tx.operationalTask.updateMany({ where: { taskKey: `min:${d.id}`, status: 'open' }, data: { status: 'resolved' } });
      const holds = await tx.inventoryHold.findMany({ where: { departureId: d.id, status: 'active' }, select: { id: true } });
      await tx.inventoryHold.updateMany({ where: { departureId: d.id, status: 'active' }, data: { status: 'released' } });
      await tx.promoRedemption.updateMany({ where: { holdId: { in: holds.map((h: any) => h.id) }, status: 'reserved' }, data: { status: 'released' } });
      await tx.booking.updateMany({ where: { departureId: d.id, status: 'pending_payment' }, data: { status: 'cancelled' } });
      await tx.guideAssignment.updateMany({ where: { departureId: d.id, status: { in: ['offered', 'accepted'] } }, data: { status: 'cancelled' } });
      await closeWaitlist(tx, d.id, 'Departure cancelled for weather');
      await audit(tx, user.id, 'departure.weather_cancelled', 'Departure', d.id, { status: d.status }, { status: 'weather_cancelled' }, reason, args.idempotencyKey);
    }
    const bookings = await tx.booking.findMany({ where: { departureId: d.id, status: { in: PENDING } } });
    let queued = 0, suppressed = 0;
    for (const b of bookings) {
      const r = await queueGuestNotification(tx, 'weather_cancellation', b, { tourName: d.tour.name, startAt: d.startAt, timezone: d.tour.timezone, refundCents: b.totalCents - b.refundedCents, currency: b.currencyCode, meetingPoint: null }, user.id);
      if (r === 'notification.queued') queued++; else if (r) suppressed++;
    }
    return { departureId: d.id, awaitingChoice: bookings.length, noticesQueued: queued, noticesHeldBack: suppressed };
  });
}

// Move a weather-cancelled booking onto another departure of the same tour. The amount the guest paid is the credit: the new
// booking is priced from the same tickets and add-ons and must cost exactly that, otherwise the operator is told to refund instead.
export async function rebookWeatherBooking(_r: any, args: any, context: any) {
  try { return await rebookCore(args, context); } catch (e) { throw userFacingError(e); }
}
async function rebookCore(args: any, context: any) {
  const user = await authorize(context, 'canManageBookings');
  const i = args.input;
  const probe = await context.prisma.booking.findUnique({ where: { id: i.bookingId }, select: { departureId: true } });
  if (!probe) throw new Error('Booking not found');
  return command(context, args.idempotencyKey, 'rebookWeatherBooking', { bookingId: i.bookingId, departureId: i.departureId }, [`departure:${i.departureId}`, `departure:${probe.departureId}`], (tx: any) => rebookInTx(tx, user.id, i, args.idempotencyKey));
}
async function rebookInTx(tx: any, actorId: string, i: any, requestKey: string) {
  const old = await tx.booking.findUnique({ where: { id: i.bookingId }, include: { lines: true, participants: true, departure: true } });
  if (!old.departure || old.departure.status !== 'weather_cancelled') throw new Error('Only bookings on a weather-cancelled departure can be rebooked here');
  if (!PENDING.includes(old.status) || old.creditUsedAt) throw new Error('This booking has already been resolved');
  if (old.channelId) throw new Error('Reseller bookings are re-planned with the reseller; use the refund instead');
  if (i.departureId === old.departureId) throw new Error('Choose a different departure');
  const target = await tx.departure.findUnique({ where: { id: i.departureId }, include: { tour: true } });
  if (!target || target.tourId !== old.departure.tourId) throw new Error('Choose a departure of the same tour');
  const credit = old.totalCents - old.refundedCents;
  const tickets = old.lines.filter((l: any) => l.kind === 'ticket').map((l: any) => ({ id: l.catalogId, qty: l.qty }));
  const addOns = old.lines.filter((l: any) => l.kind === 'addon').map((l: any) => ({ id: l.catalogId, qty: l.qty }));
  const hold = await placeHold(tx, { departureId: target.id, tickets, addOns, token: derivedToken('weather-rebook-hold', old.id) }, actorId, `weather-rebook:${old.id}`);
  const quote = { ...hold.quote, departureId: target.id };
  if (quote.totalCents !== credit) {
    const f = (c: number) => `$${(c / 100).toFixed(2)}`;
    throw new Error(`That departure costs ${f(quote.totalCents)} but the guest paid ${f(credit)}. Pick a departure at the same price or refund instead`);
  }
  const row = await tx.inventoryHold.findUnique({ where: { id: hold.holdId } });
  const participants = old.participants.map((p: any) => ({ fullName: p.fullName, age: p.age, email: p.email, dietary: p.dietary, medicalNotes: p.medicalNotes, snapshot: p.ticketTypeSnapshot }));
  const booking = await newBooking(tx, { quote: { ...quote, totalCents: 0, discountCents: quote.subtotalCents + quote.addOnsCents + quote.taxCents }, lead: { name: old.guestName, email: old.guestEmail, phone: old.guestPhone, specialRequests: old.specialRequests, pickupLocation: old.pickupLocation }, participants, source: old.source, holdId: row.id, status: 'pending_payment' });
  const confirmed = await confirmBooking(tx, booking.id, actorId, `weather-rebook:${old.id}`);
  if (!confirmed) throw new Error('Not enough seats on that departure');
  const moved = await tx.booking.updateMany({ where: { id: old.id, creditUsedAt: null, status: { in: PENDING } }, data: { status: 'cancelled', seats: 0, creditUsedAt: new Date() } });
  if (moved.count !== 1) throw new Error('This booking has already been resolved');
  await audit(tx, actorId, 'booking.weather_rebooked', 'Booking', old.id, { status: old.status }, { newBookingId: booking.id, newBookingRef: confirmed.bookingRef, departureId: target.id, creditCents: credit }, 'Weather cancellation rebook', requestKey);
  return { bookingRef: confirmed.bookingRef, previousBookingRef: old.bookingRef };
}

// Operator read: weather-cancelled departures with the bookings still waiting on a choice, each guest's notice state, and the
// departures a rebook can move them to (same tour, on sale, with room for that party).
export async function weatherCancellations(_r: any, _a: any, context: any) {
  await authorize(context, 'canManageBookings');
  const db = context.prisma, now = new Date();
  const deps = await db.departure.findMany({ where: { status: 'weather_cancelled', startAt: { gte: new Date(+now - 14 * 86400000) } }, orderBy: { startAt: 'asc' }, take: 40, include: { tour: { select: { id: true, name: true } } } });
  if (!deps.length) return { departures: [] };
  const depIds = deps.map((d: any) => d.id);
  const bookings = await db.booking.findMany({ where: { departureId: { in: depIds }, status: { in: [...PENDING, 'refunded', 'cancelled'] } }, orderBy: { createdAt: 'asc' }, take: 600 });
  const noticeRows = bookings.length ? await db.auditEvent.findMany({ where: { targetList: 'Notification', targetId: { in: bookings.map((b: any) => `weather_cancellation:${b.id}`) } } }) : [];
  const notice = new Map(noticeRows.map((n: any) => [n.targetId, n.action === 'notification.queued' ? 'queued' : 'held back']));
  const reasons = await db.auditEvent.findMany({ where: { action: 'departure.weather_cancelled', targetId: { in: depIds } }, orderBy: { createdAt: 'desc' } });
  const reasonOf = new Map(reasons.map((a: any) => [a.targetId, a.reason]));
  const tourIds = [...new Set(deps.filter((d: any) => bookings.some((b: any) => b.departureId === d.id && PENDING.includes(b.status))).map((d: any) => d.tourId))] as string[];
  const options = new Map<string, any[]>();
  for (const tourId of tourIds) {
    const rows = await db.departure.findMany({ where: { tourId, status: { in: OPEN_FOR_SALE }, startAt: { gt: now } }, orderBy: { startAt: 'asc' }, take: 8 });
    const withRoom = await Promise.all(rows.map(async (r: any) => { const o = await occupancyNumbers(db, r.id, r.startAt); return { id: r.id, startAt: r.startAt, remaining: Math.max(0, r.capacity - o.booked - o.held - o.allocated) }; }));
    options.set(tourId, withRoom);
  }
  return {
    departures: deps.map((d: any) => {
      const mine = bookings.filter((b: any) => b.departureId === d.id);
      const pending = mine.filter((b: any) => PENDING.includes(b.status));
      return {
        id: d.id, startAt: d.startAt, tourName: d.tour.name, reason: reasonOf.get(d.id) || '', resolved: mine.length - pending.length,
        bookings: pending.map((b: any) => ({ id: b.id, bookingRef: b.bookingRef, guestName: b.guestName, guestEmail: b.guestEmail, seats: b.seats, balanceCents: b.totalCents - b.refundedCents, currencyCode: b.currencyCode, canRebook: !b.channelId, notice: notice.get(`weather_cancellation:${b.id}`) || 'none',
          options: (options.get(d.tourId) || []).filter((o) => o.remaining >= (b.seats || 1)) })),
      };
    }),
  };
}
