import { randomBytes } from 'node:crypto';
import { command, hashToken, humanCode, derivedToken, occupancyNumbers } from '../lib/tour-command';
import { applyPricingRules } from '../lib/tour-pricing';
import { quoteTotal, basisPoints } from '../lib/tour-money';
import { buildParticipants } from './tour-checkout';

const newId = () => 'c' + randomBytes(12).toString('hex');

// Operator (phone / walk-up / reseller) cash bookings without promo codes or add-ons.
// Same locks, capacity rules, idempotency record and audit trail as the generic hold -> booking -> confirm path, but the
// catalog is read once BEFORE the transaction (it does not change under the departure lock) and the writes are batched,
// so the transaction is ~a dozen round trips instead of ~45. On a hosted database every round trip is 100-300 ms.
export async function fastOperatorBooking(context: any, args: any, user: any) {
  const i = args.input, db = context.prisma;
  const departure = await db.departure.findUnique({ where: { id: i.departureId }, include: { tour: { include: { ticketTypes: true } } } });
  if (!departure) throw new Error('Departure not found');
  const tour = departure.tour;
  const [pricingRules, settings, policy, meetingPoint, channel] = await Promise.all([
    db.pricingRule.findMany({ where: { tourId: tour.id } }),
    db.storeSettings.findFirst(),
    tour.cancellationPolicyId ? db.cancellationPolicy.findUnique({ where: { id: tour.cancellationPolicyId } }) : null,
    tour.meetingPointId ? db.meetingPoint.findUnique({ where: { id: tour.meetingPointId }, select: { name: true, address: true, instructions: true, mapLink: true } }) : null,
    i.source === 'reseller' ? db.channel.findUnique({ where: { id: i.channelId } }) : null,
  ]);
  if (i.source === 'reseller' && !channel?.active) throw new Error('Channel unavailable');

  return command(context, args.idempotencyKey, 'createChannelBooking', i, [`departure:${departure.id}`], async (tx: any) => {
    const d = departure;
    // Current state under the lock: status, capacity, expired holds and occupancy, in one statement.
    const occ = await occupancyNumbers(tx, d.id, d.startAt, undefined, channel?.id);
    const state = occ; if (!state?.status) throw new Error('Departure not found');
    if (state.stale > 0) { // rare: free expired holds and their pending bookings exactly as placeHold does
      const stale = (await tx.inventoryHold.findMany({ where: { departureId: d.id, status: 'active', expiresAt: { lte: new Date() } }, select: { id: true } })).map((h: any) => h.id);
      await tx.inventoryHold.updateMany({ where: { id: { in: stale } }, data: { status: 'expired' } });
      await tx.promoRedemption.updateMany({ where: { holdId: { in: stale }, status: 'reserved' }, data: { status: 'released' } });
      await tx.booking.updateMany({ where: { holdId: { in: stale }, status: 'pending_payment' }, data: { status: 'cancelled' } });
    }
    if (tour.status !== 'active' || !['on_sale', 'confirmed', 'min_not_met', 'full'].includes(state.status) || d.startAt.getTime() - (state.cutoff ?? 0) * 60000 <= Date.now()) throw new Error('Departure is not on sale');
    if (!Array.isArray(i.tickets) || !i.tickets.length || i.tickets.length > 20) throw new Error('Choose ticket quantities');

    const lines: any[] = []; let seats = 0;
    for (const chosen of i.tickets) {
      if (!Number.isSafeInteger(chosen.qty) || chosen.qty < 1 || chosen.qty > 100) throw new Error('Invalid quantity');
      const ticket = tour.ticketTypes.find((t: any) => t.id === chosen.id && t.active);
      if (!ticket) throw new Error('Ticket not offered on this tour');
      seats += ticket.countsTowardCapacity ? ticket.seatsUsed * chosen.qty : 0;
      const priced = applyPricingRules(ticket.priceCents, ticket.id, d.startAt, tour.timezone || 'America/New_York', pricingRules);
      lines.push({ catalogId: ticket.id, name: ticket.name, unitPriceCents: priced.unitPriceCents, basePriceCents: ticket.priceCents, pricingRuleId: priced.ruleId, qty: chosen.qty, seatsUsed: ticket.countsTowardCapacity ? ticket.seatsUsed : 0, kind: 'ticket', minAge: ticket.minAge, maxAge: ticket.maxAge });
    }
    if (!seats || seats > Math.max(0, state.capacity - occ.booked - occ.held - occ.allocated)) throw new Error('Not enough seats');

    const quote: any = { lines, ...quoteTotal(lines, settings?.taxBps || 0, 0), promo: null, seats, currencyCode: settings?.currencyCode || 'USD',
      tour: { id: tour.id, name: tour.name, timezone: tour.timezone, startAt: d.startAt, endAt: d.endAt, meetingPointId: tour.meetingPointId, waiverTemplateId: tour.requiresWaiverId, meetingPoint },
      policy: { rules: policy?.rules || [], weatherFullRefund: policy?.weatherFullRefund ?? true }, departureId: d.id };
    const participants = buildParticipants(quote, i.participants);
    const guestName = String(i.lead.name || '').trim(), guestEmail = String(i.lead.email || '').trim().toLowerCase();
    if (!guestName || !guestEmail.includes('@')) throw new Error('Lead booker name and email required');

    const holdId = newId(), bookingId = newId(), bookingRef = `TG-${humanCode(8)}`;
    const commission = channel ? basisPoints(quote.totalCents, channel.commissionBps) : 0;
    const waiver = Boolean(quote.tour.waiverTemplateId);
    const pay = quote.totalCents > 0 && !(channel && channel.paymentModel === 'channel_collects');
    const booked = occ.booked + seats;
    const nextStatus = !['scheduled', 'on_sale', 'min_not_met', 'confirmed', 'full'].includes(state.status) ? state.status
      : booked >= state.capacity ? 'full' : booked >= (tour.minParticipants ?? 1) ? 'confirmed' : state.status === 'min_not_met' ? 'min_not_met' : 'on_sale';
    const people = participants.map((p: any) => { const id = newId(); return { id, fullName: p.fullName, age: p.age, email: p.email, dietary: p.dietary, medicalNotes: p.medicalNotes, snapshot: p.snapshot, token: waiver ? hashToken(derivedToken('waiver', id)) : null }; });
    const lineRows = lines.map((l: any) => ({ id: newId(), name: l.name, unit: l.unitPriceCents, qty: l.qty, seatsUsed: l.seatsUsed, kind: l.kind, total: l.unitPriceCents * l.qty, catalogId: l.catalogId }));
    // The hold exists for the audit/quote snapshot and is born converted. Everything is ONE statement: hold, booking, lines,
    // participants, cash payment, departure status and audit all commit together or not at all.
    await tx.$executeRaw`
      WITH h AS (INSERT INTO "InventoryHold" (id, departure, quantity, "cartTokenHash", "expiresAt", status, quote, "updatedAt")
        VALUES (${holdId}, ${d.id}, ${seats}, ${hashToken(derivedToken('operator-hold', args.idempotencyKey + ':' + d.id))}, now() + interval '60 seconds', 'converted'::"InventoryHoldStatusType", ${JSON.stringify(quote)}::jsonb, now())),
      b AS (INSERT INTO "Booking" (id, "bookingRef", departure, "guestName", "guestEmail", "guestPhone", status, channel, source, "subtotalCents", "addOnsCents", "discountCents", "taxCents", "totalCents",
          "channelCommissionCents", "currencyCode", seats, "policySnapshot", "tourSnapshot", hold, "specialRequests", "pickupLocation", "updatedAt")
        VALUES (${bookingId}, ${bookingRef}, ${d.id}, ${guestName}, ${guestEmail}, ${String(i.lead.phone || '')}, 'confirmed'::"BookingStatusType", ${channel?.id ?? null}, ${i.source}::"BookingSourceType",
          ${quote.subtotalCents}, ${quote.addOnsCents}, ${quote.discountCents}, ${quote.taxCents}, ${quote.totalCents}, ${commission}, ${quote.currencyCode}, ${seats},
          ${JSON.stringify(quote.policy)}::jsonb, ${JSON.stringify({ ...quote.tour, promo: null })}::jsonb, ${holdId}, ${String(i.lead.specialRequests || '')}, ${String(i.lead.pickupLocation || '')}, now())),
      l AS (INSERT INTO "BookingLine" (id, booking, name, "unitPriceCents", qty, "seatsUsed", kind, "totalCents", "currencyCode", "catalogId", "updatedAt")
        SELECT x.id, ${bookingId}, x.name, x.unit, x.qty, x."seatsUsed", x.kind::"BookingLineKindType", x.total, ${quote.currencyCode}, x."catalogId", now()
        FROM jsonb_to_recordset(${JSON.stringify(lineRows)}::jsonb) AS x(id text, name text, unit int, qty int, "seatsUsed" int, kind text, total int, "catalogId" text)),
      p AS (INSERT INTO "Participant" (id, booking, "fullName", age, email, dietary, "medicalNotes", "ticketTypeSnapshot", "waiverStatus", "waiverTokenHash", "updatedAt")
        SELECT x.id, ${bookingId}, x."fullName", x.age, x.email, x.dietary, x."medicalNotes", x.snapshot, ${waiver ? 'required' : 'not_required'}::"ParticipantWaiverStatusType", x.token, now()
        FROM jsonb_to_recordset(${JSON.stringify(people)}::jsonb) AS x(id text, "fullName" text, age int, email text, dietary text, "medicalNotes" text, snapshot jsonb, token text)),
      pay AS (INSERT INTO "Payment" (id, "idempotencyKey", amount, "currencyCode", status, "paymentMethod", "order", "processedAt", "processedBy", notes, "updatedAt")
        SELECT ${newId()}, ${'tour-payment:' + bookingId}, ${quote.totalCents}, ${quote.currencyCode}, 'succeeded', 'cash', ${bookingId}, now(), ${user.id}, 'Collected by operator', now() WHERE ${pay}),
      dep AS (UPDATE "Departure" SET status = ${nextStatus}::"DepartureStatusType", "updatedAt" = now() WHERE id = ${d.id} AND status::text <> ${nextStatus})
      INSERT INTO "AuditEvent" (id, actor, action, "targetList", "targetId", before, after, reason, "requestId", "updatedAt") VALUES
        (${newId()}, ${user.id}, 'hold.created', 'InventoryHold', ${holdId}, NULL, ${JSON.stringify({ seats, departureId: d.id })}::jsonb, '', ${args.idempotencyKey}, now()),
        (${newId()}, ${user.id}, 'booking.confirmed', 'Booking', ${bookingId}, ${JSON.stringify({ status: 'pending_payment' })}::jsonb, ${JSON.stringify({ status: 'confirmed', seats })}::jsonb, '', ${args.idempotencyKey}, now())`;
    return { bookingRef, waivers: [] };
  });
}
