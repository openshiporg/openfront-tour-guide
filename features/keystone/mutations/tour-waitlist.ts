import { timingSafeEqual } from 'node:crypto';
import { command, audit, authorize, derivedToken, hashToken, departureOccupancy, lockTransactionKey, userFacingError } from '../lib/tour-command';
import { pickOffers, offerExpiry, positionOf, waitlistLinkPath } from '../lib/tour-waitlist';
import { placeHold } from './tour-catalog';
import { newBooking, confirmBooking, queueGuestNotification } from './tour-checkout';

// Waitlist for a full departure (Gym Waitlist + classCapacity donor, adapted). A guest (online) or the operator (phone) joins when the party
// does not fit. When seats free up (a cancel, a move away, a resize, an expired hold) the departure's lock holder calls promoteWaitlist in the
// same transaction: offers go oldest first, each offer is a real InventoryHold for the party's seats until the offer window ends, so a new
// arrival cannot take the seats. The guest books the held seats through the normal checkout; staff can book them for cash. No transport:
// the offer notice is queued like every other guest notice.
const OPEN = ['on_sale', 'confirmed', 'min_not_met', 'full'];
const LIVE = ['waiting', 'offered'];
export const waitlistToken = (entryId: string) => derivedToken('waitlist', entryId);
const linkFor = (id: string) => waitlistLinkPath(id, waitlistToken(id));
const norm = (s: string) => String(s || '').trim().toLowerCase();

function assertWaitlistProof(entryId: string, token: string) {
  const expected = Buffer.from(waitlistToken(entryId)), given = Buffer.from(String(token || ''));
  if (given.length !== expected.length || !timingSafeEqual(expected, given)) throw new Error('Waitlist entry not found');
}

// Expire lapsed offers, then offer the freed seats to the next parties. Caller holds departure:<id>.
export async function promoteWaitlist(tx: any, departureId: string, actorId: string | null) {
  const now = new Date();
  const live = await tx.waitlistEntry.findMany({ where: { departureId, status: { in: LIVE } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  if (!live.length) return { offered: 0, expired: 0 };
  let expired = 0, offered = 0;
  for (const e of live.filter((x: any) => x.status === 'offered' && x.offerExpiresAt && x.offerExpiresAt <= now)) {
    const hold = e.offerHoldId ? await tx.inventoryHold.findUnique({ where: { id: e.offerHoldId } }) : null;
    if (hold?.status === 'converted') continue; // booked; confirmBooking marks the entry converted
    if (hold?.status === 'active') {
      await tx.inventoryHold.update({ where: { id: hold.id }, data: { status: 'expired' } });
      await tx.booking.updateMany({ where: { holdId: hold.id, status: 'pending_payment' }, data: { status: 'cancelled' } });
    }
    await tx.waitlistEntry.update({ where: { id: e.id }, data: { status: 'expired', note: 'Offer not taken in time' } });
    await audit(tx, actorId, 'waitlist.offer_expired', 'WaitlistEntry', e.id, { status: 'offered' }, { status: 'expired' });
    expired++;
  }
  const waiting = live.filter((x: any) => x.status === 'waiting');
  if (!waiting.length) return { offered, expired };
  const o = await departureOccupancy(tx, departureId);
  const d = o.departure;
  if (d.tour.status !== 'active' || !OPEN.includes(d.status)) return { offered, expired };
  const settings = await tx.storeSettings.findFirst({ select: { waitlistOfferHours: true } });
  const until = offerExpiry(now, d.startAt, d.bookingCutoffMinutes, settings?.waitlistOfferHours);
  if (!until) return { offered, expired };
  for (const id of pickOffers(waiting, o.remaining)) {
    const e = waiting.find((x: any) => x.id === id);
    let hold: any;
    try {
      hold = await placeHold(tx, { departureId, tickets: e.tickets, addOns: [], token: derivedToken('waitlist-hold', e.id) }, actorId, `waitlist:${e.id}`, undefined, until.getTime() - now.getTime());
    } catch (err: any) {
      if (/Not enough seats/.test(err?.message || '')) continue;
      await tx.waitlistEntry.update({ where: { id: e.id }, data: { status: 'expired', note: `Could not offer: ${err?.message || 'tickets unavailable'}` } });
      await audit(tx, actorId, 'waitlist.offer_failed', 'WaitlistEntry', e.id, { status: 'waiting' }, { status: 'expired' }, String(err?.message || ''));
      continue;
    }
    await tx.waitlistEntry.update({ where: { id: e.id }, data: { status: 'offered', offerHoldId: hold.holdId, offeredAt: now, offerExpiresAt: until } });
    await audit(tx, actorId, 'waitlist.offered', 'WaitlistEntry', e.id, { status: 'waiting' }, { status: 'offered', holdId: hold.holdId, seats: e.seats, offerExpiresAt: until });
    await queueGuestNotification(tx, 'waitlist_offer', { id: e.id, bookingRef: '', guestName: e.guestName, guestEmail: e.guestEmail }, { tourName: d.tour.name, startAt: d.startAt, timezone: d.tour.timezone, offerExpiresAt: until, seats: e.seats }, actorId);
    offered++;
  }
  return { offered, expired };
}

// A booking made from an offer hold closes the entry. Called by confirmBooking.
export async function markWaitlistConverted(tx: any, holdId: string, bookingRef: string) {
  await tx.waitlistEntry.updateMany({ where: { offerHoldId: holdId, status: { in: LIVE } }, data: { status: 'converted', bookingRef } });
}

// Departure cancelled: nobody waits for it any more. Offer holds are released by the caller with the other holds.
export async function closeWaitlist(tx: any, departureId: string, note: string) {
  await tx.waitlistEntry.updateMany({ where: { departureId, status: { in: LIVE } }, data: { status: 'expired', note } });
}

async function joinInTx(tx: any, i: any, source: 'online' | 'phone', actorId: string | null) {
  const o = await departureOccupancy(tx, String(i.departureId || ''));
  const d = o.departure;
  if (d.tour.status !== 'active' || !OPEN.includes(d.status) || d.startAt.getTime() - (d.bookingCutoffMinutes ?? 0) * 60000 <= Date.now()) throw new Error('This departure is not taking bookings or waitlist requests');
  const name = String(i.lead?.name || '').trim(), email = norm(i.lead?.email), phone = String(i.lead?.phone || '').trim();
  if (!name || name.length > 120) throw new Error('Name required');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('A valid email is required');
  if (!Array.isArray(i.tickets) || !i.tickets.length || i.tickets.length > 20) throw new Error('Choose ticket quantities');
  let seats = 0; const tickets: any[] = [];
  for (const c of i.tickets) {
    if (!Number.isSafeInteger(c.qty) || c.qty < 1 || c.qty > 100) throw new Error('Invalid quantity');
    const t = await tx.ticketType.findFirst({ where: { id: String(c.id), tourId: d.tourId, active: true } });
    if (!t) throw new Error('Ticket not offered on this tour');
    seats += t.countsTowardCapacity ? t.seatsUsed * c.qty : 0; tickets.push({ id: t.id, qty: c.qty });
  }
  if (!seats) throw new Error('Choose at least one ticket that takes a seat');
  if (seats > d.capacity) throw new Error('This party is larger than the departure');
  if (seats <= o.remaining) throw new Error('Seats are available on this departure. Book them instead of joining the waitlist');
  if (await tx.waitlistEntry.findFirst({ where: { departureId: d.id, guestEmail: email, status: { in: LIVE } }, select: { id: true } })) throw new Error('This email is already on the waitlist for this departure');
  const e = await tx.waitlistEntry.create({ data: { departureId: d.id, guestName: name, guestEmail: email, guestPhone: phone, seats, tickets, source, status: 'waiting', note: String(i.note || '').slice(0, 500) } });
  await audit(tx, actorId, 'waitlist.joined', 'WaitlistEntry', e.id, null, { departureId: d.id, seats, source });
  const waiting = await tx.waitlistEntry.findMany({ where: { departureId: d.id, status: 'waiting' }, select: { id: true, seats: true, createdAt: true } });
  return { entryId: e.id, link: linkFor(e.id), position: positionOf(e.id, waiting), seats };
}

// Public: a guest whose party does not fit joins the waitlist. Returns the private link (proof in the fragment).
export async function joinWaitlist(_r: any, args: any, context: any) {
  try {
    const i = args.input || {};
    return await command(context, args.idempotencyKey, 'joinWaitlist', i, [`departure:${i.departureId}`], (tx: any) => joinInTx(tx, i, 'online', context.session?.itemId || null));
  } catch (e) { throw userFacingError(e); }
}
// Staff: a phone caller joins. The link is returned for the operator to give the guest.
export async function addToWaitlist(_r: any, args: any, context: any) {
  try {
    const user = await authorize(context, 'canManageBookings'); const i = args.input || {};
    return await command(context, args.idempotencyKey, 'addToWaitlist', i, [`departure:${i.departureId}`], (tx: any) => joinInTx(tx, i, 'phone', user.id));
  } catch (e) { throw userFacingError(e); }
}

async function view(db: any, e: any) {
  const d = await db.departure.findUnique({ where: { id: e.departureId }, include: { tour: true } });
  const waiting = e.status === 'waiting' ? await db.waitlistEntry.findMany({ where: { departureId: e.departureId, status: 'waiting' }, select: { id: true, seats: true, createdAt: true } }) : [];
  const lapsed = e.status === 'offered' && e.offerExpiresAt && e.offerExpiresAt <= new Date();
  return { entryId: e.id, status: lapsed ? 'expired' : e.status, guestName: e.guestName, seats: e.seats, tourName: d.tour.name, tourSlug: d.tour.slug, startAt: d.startAt, timezone: d.tour.timezone,
    position: e.status === 'waiting' ? positionOf(e.id, waiting) : null, offerExpiresAt: lapsed ? null : e.offerExpiresAt, bookingRef: e.bookingRef || null, note: e.note || '' };
}
// Public: what the guest's link shows.
export async function waitlistStatus(_r: any, args: any, context: any) {
  try {
    assertWaitlistProof(String(args.entryId || ''), args.token);
    const e = await context.prisma.waitlistEntry.findUnique({ where: { id: String(args.entryId) } });
    if (!e) throw new Error('Waitlist entry not found');
    return await view(context.prisma, e);
  } catch (e) { throw userFacingError(e); }
}

// Public: the guest takes the offer. The offer hold is bound to this browser's checkout proof, then the normal checkout takes over.
export async function claimWaitlistOffer(_r: any, args: any, context: any) {
  try {
    const entryId = String(args.entryId || ''); assertWaitlistProof(entryId, args.token);
    const cart = String(args.cartToken || ''); if (cart.length < 32 || cart.length > 256) throw new Error('Guest proof must contain 32–256 characters');
    const probe = await context.prisma.waitlistEntry.findUnique({ where: { id: entryId }, select: { departureId: true } });
    if (!probe) throw new Error('Waitlist entry not found');
    return await context.prisma.$transaction(async (tx: any) => {
      await lockTransactionKey(tx, `departure:${probe.departureId}`);
      const e = await tx.waitlistEntry.findUnique({ where: { id: entryId } });
      if (e.status === 'converted') throw new Error(`Already booked as ${e.bookingRef}`);
      if (e.status !== 'offered' || !e.offerExpiresAt || e.offerExpiresAt <= new Date()) throw new Error('There is no open offer for this waitlist entry');
      const hold = await tx.inventoryHold.findUnique({ where: { id: e.offerHoldId } });
      if (!hold || hold.status !== 'active' || hold.expiresAt <= new Date()) throw new Error('There is no open offer for this waitlist entry');
      await tx.inventoryHold.update({ where: { id: hold.id }, data: { cartTokenHash: hashToken(cart) } });
      await audit(tx, null, 'waitlist.offer_claimed', 'WaitlistEntry', e.id, null, { holdId: hold.id });
      return { holdId: hold.id, offerExpiresAt: e.offerExpiresAt };
    }, { timeout: 20000 });
  } catch (e) { throw userFacingError(e); }
}

async function withdrawInTx(tx: any, entryId: string, actorId: string | null, reason: string) {
  const e = await tx.waitlistEntry.findUnique({ where: { id: entryId } });
  if (!e) throw new Error('Waitlist entry not found');
  if (!LIVE.includes(e.status)) throw new Error(e.status === 'converted' ? `Already booked as ${e.bookingRef}` : 'This waitlist entry is already closed');
  if (e.offerHoldId) {
    const hold = await tx.inventoryHold.findUnique({ where: { id: e.offerHoldId } });
    if (hold?.status === 'active') {
      if (await tx.booking.findFirst({ where: { holdId: hold.id, status: { not: 'cancelled' } }, select: { id: true } })) throw new Error('Checkout has started on this offer; finish or abandon it first');
      await tx.inventoryHold.update({ where: { id: hold.id }, data: { status: 'released' } });
    }
  }
  await tx.waitlistEntry.update({ where: { id: e.id }, data: { status: 'withdrawn', note: reason } });
  await audit(tx, actorId, 'waitlist.withdrawn', 'WaitlistEntry', e.id, { status: e.status }, { status: 'withdrawn' }, reason);
  // Freed offer seats go to the next party.
  const next = await promoteWaitlist(tx, e.departureId, actorId);
  return { entryId: e.id, status: 'withdrawn', nextOffered: next.offered };
}
// Public: the guest leaves the waitlist (or turns down an offer).
export async function leaveWaitlist(_r: any, args: any, context: any) {
  try {
    const entryId = String(args.entryId || ''); assertWaitlistProof(entryId, args.token);
    const probe = await context.prisma.waitlistEntry.findUnique({ where: { id: entryId }, select: { departureId: true } });
    if (!probe) throw new Error('Waitlist entry not found');
    return await command(context, args.idempotencyKey, 'leaveWaitlist', { entryId }, [`departure:${probe.departureId}`], (tx: any) => withdrawInTx(tx, entryId, null, 'Guest left the waitlist'));
  } catch (e) { throw userFacingError(e); }
}
export async function withdrawWaitlistEntry(_r: any, args: any, context: any) {
  try {
    const user = await authorize(context, 'canManageBookings'); const i = args.input || {};
    const reason = String(i.reason || '').trim(); if (!reason) throw new Error('A reason is required');
    const probe = await context.prisma.waitlistEntry.findUnique({ where: { id: String(i.entryId || '') }, select: { departureId: true } });
    if (!probe) throw new Error('Waitlist entry not found');
    return await command(context, args.idempotencyKey, 'withdrawWaitlistEntry', { entryId: i.entryId, reason }, [`departure:${probe.departureId}`], (tx: any) => withdrawInTx(tx, String(i.entryId), user.id, reason));
  } catch (e) { throw userFacingError(e); }
}

// Staff: the guest on an open offer pays cash (phone or at the desk). Books exactly the held seats at the held quote.
export async function bookWaitlistOffer(_r: any, args: any, context: any) {
  try {
    const user = await authorize(context, 'canManageBookings'); const i = args.input || {};
    const names = (Array.isArray(i.participants) ? i.participants : []).map((n: any) => String(n || '').trim()).filter(Boolean);
    const probe = await context.prisma.waitlistEntry.findUnique({ where: { id: String(i.entryId || '') }, select: { departureId: true } });
    if (!probe) throw new Error('Waitlist entry not found');
    return await command(context, args.idempotencyKey, 'bookWaitlistOffer', { entryId: i.entryId, names }, [`departure:${probe.departureId}`], async (tx: any) => {
      const e = await tx.waitlistEntry.findUnique({ where: { id: String(i.entryId) } });
      if (e.status !== 'offered' || !e.offerExpiresAt || e.offerExpiresAt <= new Date()) throw new Error('There is no open offer for this waitlist entry');
      const hold = await tx.inventoryHold.findUnique({ where: { id: e.offerHoldId } });
      if (!hold || hold.status !== 'active' || hold.expiresAt <= new Date()) throw new Error('There is no open offer for this waitlist entry');
      if (await tx.booking.findFirst({ where: { holdId: hold.id }, select: { id: true } })) throw new Error('The guest has started checkout on this offer');
      const quote = { ...hold.quote, departureId: hold.departureId };
      const slots = quote.lines.filter((l: any) => l.kind === 'ticket').flatMap((l: any) => Array.from({ length: l.qty }, () => l));
      if (names.length !== slots.length) throw new Error(`Enter ${slots.length} participant name${slots.length === 1 ? '' : 's'}, one per ticket`);
      const participants = slots.map((l: any, n: number) => ({ fullName: names[n].slice(0, 120), age: null, email: '', dietary: '', medicalNotes: '', snapshot: { ticketTypeId: l.catalogId, name: l.name, unitPriceCents: l.unitPriceCents } }));
      const booking = await newBooking(tx, { quote, lead: { name: e.guestName, email: e.guestEmail, phone: e.guestPhone }, participants, source: 'phone', holdId: hold.id, status: 'pending_payment' });
      const done = await confirmBooking(tx, booking.id, user.id, args.idempotencyKey);
      if (!done) throw new Error('The held seats are no longer available');
      if (booking.totalCents > 0) await tx.payment.create({ data: { idempotencyKey: `tour-payment:${booking.id}`, amount: booking.totalCents, currencyCode: booking.currencyCode, status: 'succeeded', paymentMethod: 'cash', orderId: booking.id, processedAt: new Date(), processedById: user.id, notes: 'Collected by operator (waitlist offer)' } });
      await audit(tx, user.id, 'waitlist.booked', 'WaitlistEntry', e.id, { status: 'offered' }, { status: 'converted', bookingRef: booking.bookingRef, totalCents: booking.totalCents });
      return { bookingRef: booking.bookingRef, totalCents: booking.totalCents, currencyCode: booking.currencyCode };
    });
  } catch (e) { throw userFacingError(e); }
}

// Staff list: open entries (waiting or offered) on departures that have not started, oldest departure first; or every entry ("all").
export async function waitlistBoard(_r: any, args: any, context: any) {
  await authorize(context, 'canManageBookings');
  const db = context.prisma, all = args.status === 'all';
  const rows = await db.waitlistEntry.findMany({ where: { ...(all ? {} : { status: { in: LIVE } }), departure: { startAt: { gt: new Date(Date.now() - (all ? 7 * 86400000 : 0)) } } }, orderBy: [{ createdAt: 'asc' }], take: 200 });
  const depIds = [...new Set(rows.map((r: any) => r.departureId))];
  const deps = depIds.length ? await db.departure.findMany({ where: { id: { in: depIds } }, select: { id: true, startAt: true, capacity: true, status: true, tour: { select: { name: true, timezone: true } } } }) : [];
  const byDep = new Map(deps.map((d: any) => [d.id, d]));
  const waitingBy = new Map<string, any[]>();
  for (const r of rows) if (r.status === 'waiting') waitingBy.set(r.departureId, [...(waitingBy.get(r.departureId) || []), r]);
  const out = rows.map((r: any) => {
    const d: any = byDep.get(r.departureId);
    const lapsed = r.status === 'offered' && r.offerExpiresAt && r.offerExpiresAt <= new Date();
    return { id: r.id, status: lapsed ? 'expired' : r.status, guestName: r.guestName, guestEmail: r.guestEmail, guestPhone: r.guestPhone, seats: r.seats, source: r.source, createdAt: r.createdAt,
      position: r.status === 'waiting' ? positionOf(r.id, waitingBy.get(r.departureId) || []) : null, offerExpiresAt: lapsed ? null : r.offerExpiresAt, bookingRef: r.bookingRef || null, note: r.note || '',
      link: LIVE.includes(r.status) ? linkFor(r.id) : null, departureId: r.departureId, startAt: d?.startAt, tourName: d?.tour?.name || '', departureStatus: d?.status || '' };
  });
  return out.sort((a: any, b: any) => +new Date(a.startAt) - +new Date(b.startAt) || (a.position ?? 0) - (b.position ?? 0));
}
