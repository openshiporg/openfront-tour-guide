import { command, departureOccupancy, opaqueToken, hashToken, authorize, audit } from '../lib/tour-command';
import { quoteTotal, basisPoints } from '../lib/tour-money';
import { lockTransactionKey } from '../lib/tour-command';

export async function releaseHoldPromos(tx: any, holdIds: string[]) {
  if (holdIds.length) await tx.promoRedemption.updateMany({ where: { holdId: { in: holdIds }, status: 'reserved' }, data: { status: 'released' } });
}
export async function toursOnSale(_root: any, _args: any, context: any) {
  return context.prisma.tour.findMany({ where: { status: 'active', departures: { some: { startAt: { gt: new Date() }, status: { in: ['on_sale','confirmed','min_not_met'] } } } }, select: { id: true, name: true, slug: true, description: true, durationMinutes: true, images: true, ticketTypes: { where: { active: true }, select: { id: true, name: true, priceCents: true, currencyCode: true } } }, take: 100 });
}
export async function tourAvailability(_root: any, args: any, context: any) {
  const from = new Date(args.from), to = new Date(args.to);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from || to.getTime() - from.getTime() > 92 * 86400000) throw new Error('Choose a valid date range of at most 92 days');
  const rows = await context.prisma.departure.findMany({ where: { tourId: args.tourId, tour: { status: 'active' }, startAt: { gte: from, lte: to }, status: { in: ['on_sale','confirmed','min_not_met','full'] } }, select: { id: true, startAt: true, endAt: true, capacity: true, bookingCutoffMinutes: true }, take: 500, orderBy: { startAt: 'asc' } });
  const result = [];
  for (const row of rows) if (row.startAt.getTime() - row.bookingCutoffMinutes * 60000 > Date.now()) { const o = await departureOccupancy(context.prisma, row.id); result.push({ ...row, remaining: o.remaining }); }
  return result;
}
export async function createDepartureHold(_root: any, args: any, context: any) {
  const input = args.input;
  // Caller creates the proof; only its digest is stored. Replays prove the same token.
  if (!input.token || input.token.length < 32 || input.token.length > 256) throw new Error('Guest proof must contain 32–256 characters');
  return command(context, args.idempotencyKey, 'createDepartureHold', input, [`departure:${input.departureId}`], tx => placeHold(tx, input, context.session?.itemId || null, args.idempotencyKey));
}
export async function placeHold(tx: any, input: any, actorId: string | null, requestId: string, channelId?: string, ttlMs = 600000) {
    // Expired holds free their seats and promo reservations under the same departure lock.
    const stale = await tx.inventoryHold.findMany({ where: { departureId: input.departureId, status: 'active', expiresAt: { lte: new Date() } }, select: { id: true } });
    if (stale.length) {
      await tx.inventoryHold.updateMany({ where: { id: { in: stale.map((h: any) => h.id) } }, data: { status: 'expired' } });
      await releaseHoldPromos(tx, stale.map((h: any) => h.id));
      await tx.booking.updateMany({ where: { holdId: { in: stale.map((h: any) => h.id) }, status: 'pending_payment' }, data: { status: 'cancelled' } });
    }
    const o = await departureOccupancy(tx, input.departureId, undefined, channelId);
    const d = o.departure;
    if (d.tour.status !== 'active' || !['on_sale','confirmed','min_not_met','full'].includes(d.status) || d.startAt.getTime() - d.bookingCutoffMinutes * 60000 <= Date.now()) throw new Error('Departure is not on sale');
    if (!Array.isArray(input.tickets) || !input.tickets.length || input.tickets.length > 20) throw new Error('Choose ticket quantities');
    const lines = [];
    let seats = 0;
    for (const chosen of input.tickets) {
      if (!Number.isSafeInteger(chosen.qty) || chosen.qty < 1 || chosen.qty > 100) throw new Error('Invalid quantity');
      const ticket = await tx.ticketType.findFirst({ where: { id: chosen.id, tourId: d.tourId, active: true } });
      if (!ticket) throw new Error('Ticket not offered on this tour');
      seats += ticket.countsTowardCapacity ? ticket.seatsUsed * chosen.qty : 0;
      lines.push({ catalogId: ticket.id, name: ticket.name, unitPriceCents: ticket.priceCents, qty: chosen.qty, seatsUsed: ticket.countsTowardCapacity ? ticket.seatsUsed : 0, kind: 'ticket', minAge: ticket.minAge, maxAge: ticket.maxAge });
    }
    if (!seats || seats > o.remaining) throw new Error('Not enough seats');
    if ((input.addOns || []).length > 20) throw new Error('Too many add-ons');
    for (const chosen of input.addOns || []) {
      const addOn = await tx.addOn.findFirst({ where: { id: chosen.id, tourId: d.tourId } });
      if (!addOn || !Number.isSafeInteger(chosen.qty) || chosen.qty < 1 || chosen.qty > 100) throw new Error('Invalid add-on');
      if (addOn.inventory !== null) {
        const booked = await tx.bookingLine.aggregate({ where: { catalogId: addOn.id, booking: { departureId: d.id, status: { in: ['confirmed','checked_in','completed','partially_refunded'] } } }, _sum: { qty: true } });
        const holds = await tx.inventoryHold.findMany({ where: { departureId: d.id, status: 'active', expiresAt: { gt: new Date() } }, select: { quote: true } });
        const held = holds.reduce((n: number, h: any) => n + (h.quote?.lines || []).filter((l: any) => l.catalogId === addOn.id).reduce((a: number,l: any) => a + l.qty,0),0);
        if (chosen.qty + held + (booked._sum.qty || 0) > addOn.inventory) throw new Error('Add-on unavailable');
      }
      lines.push({ catalogId: addOn.id, name: addOn.name, unitPriceCents: addOn.priceCents, qty: chosen.qty, seatsUsed: 0, kind: 'addon' });
    }
    const settings = await tx.storeSettings.findFirst();
    const policy = d.tour.cancellationPolicyId ? await tx.cancellationPolicy.findUnique({ where: { id: d.tour.cancellationPolicyId } }) : null;
    let discountCents = 0, promo: any = null;
    if (input.promoCode) {
      promo = await tx.promoCode.findUnique({ where: { code: String(input.promoCode).trim().toUpperCase() }, include: { tours: { select: { id: true } } } });
      const now = new Date();
      if (!promo || promo.status !== 'active' || (promo.startsAt && promo.startsAt > now) || (promo.endsAt && promo.endsAt < now) || (promo.tours.length && !promo.tours.some((t: any) => t.id === d.tourId))) throw new Error('Promo code is not valid');
      await lockTransactionKey(tx, `promo:${promo.id}`);
      const reserved = await tx.promoRedemption.count({ where: { promoCodeId: promo.id, status: { in: ['reserved', 'committed'] } } });
      if (promo.maxUses !== null && reserved >= promo.maxUses) throw new Error('Promo code is fully used');
      const base = lines.reduce((n: number, l: any) => n + l.unitPriceCents * l.qty, 0);
      discountCents = promo.discountType === 'comp' ? base : promo.discountType === 'percent_bps' ? basisPoints(base, promo.value) : Math.min(base, promo.value);
    }
    const quote = { lines, ...quoteTotal(lines, settings?.taxBps || 0, discountCents), promo: promo ? { id: promo.id, code: promo.code, discountType: promo.discountType, value: promo.value } : null, seats, currencyCode: settings?.currencyCode || 'USD', tour: { id: d.tour.id, name: d.tour.name, timezone: d.tour.timezone, startAt: d.startAt, endAt: d.endAt, meetingPointId: d.tour.meetingPointId, waiverTemplateId: d.tour.requiresWaiverId, meetingPoint: d.tour.meetingPointId ? await tx.meetingPoint.findUnique({ where: { id: d.tour.meetingPointId }, select: { name: true, address: true, instructions: true, mapLink: true } }) : null }, policy: { rules: policy?.rules || [], weatherFullRefund: policy?.weatherFullRefund ?? true } };
    const hold = await tx.inventoryHold.create({ data: { departureId: d.id, quantity: seats, cartTokenHash: hashToken(input.token), expiresAt: new Date(Date.now() + ttlMs), status: 'active', quote } });
    if (promo) await tx.promoRedemption.create({ data: { promoCodeId: promo.id, holdId: hold.id, amountCents: discountCents, currencyCode: quote.currencyCode, status: 'reserved' } });
    await audit(tx, actorId, 'hold.created', 'InventoryHold', hold.id, null, { seats, departureId: d.id }, '', requestId);
    return { holdId: hold.id, expiresAt: hold.expiresAt, quote };
}
