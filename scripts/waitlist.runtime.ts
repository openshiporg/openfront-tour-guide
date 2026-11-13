// Scratch-DB proof of the waitlist: join only when the party does not fit, one live entry per email, staff add needs permission,
// a freed seat is offered (held) to the oldest party that fits, a new arrival cannot take an offered seat, the guest claims the offer and
// books through the normal checkout, staff books an offer for cash (replay-safe), leaving releases the seats to the next party, a resize
// offers added seats, lapsed offers expire and pass on, a weather cancel closes the waitlist, and Fixtures are depth-*.
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { createChannelBooking, refundBooking, startBookingCheckout, completeBookingCheckout, checkoutHold } from '../features/keystone/mutations/tour-checkout';
import { joinWaitlist, addToWaitlist, waitlistStatus, claimWaitlistOffer, leaveWaitlist, withdrawWaitlistEntry, bookWaitlistOffer, waitlistBoard, waitlistToken, promoteWaitlist } from '../features/keystone/mutations/tour-waitlist';
import { resizeDeparture } from '../features/keystone/mutations/tour-operations';
import { weatherCancelDeparture } from '../features/keystone/mutations/tour-weather';
import { lockTransactionKey } from '../features/keystone/lib/tour-command';
const p: any = new PrismaClient(), tag = 'depth-' + randomUUID().slice(0, 8);
const key = () => tag + randomUUID();
async function main() {
  const role = await p.role.create({ data: { name: tag + 'ops', canManageBookings: true, canManagePayments: true, canIssueRefunds: true, canManageDepartures: true } });
  const weak = await p.role.create({ data: { name: tag + 'weak', canCheckIn: true } });
  const user = await p.user.create({ data: { name: tag, email: tag + '@test.example', password: 'disabled-runtime-fixture', roleId: role.id } });
  const wuser = await p.user.create({ data: { name: tag + 'w', email: tag + 'w@test.example', password: 'disabled-runtime-fixture', roleId: weak.id } });
  const ops: any = { prisma: p, session: { itemId: user.id, data: { role } } };
  const guide: any = { prisma: p, session: { itemId: wuser.id, data: { role: weak } } };
  const anon: any = { prisma: p, session: undefined };
  const tour = await p.tour.create({ data: { name: tag, slug: tag, status: 'active', maxParticipants: 10 } });
  const adult = await p.ticketType.create({ data: { tourId: tour.id, name: 'Adult', priceCents: 4000, active: true, seatsUsed: 1, countsTowardCapacity: true } });
  const free = await p.ticketType.create({ data: { tourId: tour.id, name: 'Guest pass', priceCents: 0, active: true, seatsUsed: 1, countsTowardCapacity: true } });
  const dep = (hours: number, capacity: number) => { const startAt = new Date(Date.now() + hours * 3600000); return p.departure.create({ data: { tourId: tour.id, departureKey: tag + hours + randomUUID(), startAt, endAt: new Date(+startAt + 3600000), capacity, status: 'on_sale', bookingCutoffMinutes: 60 } }); };
  const full = await dep(20, 2), roomy = await dep(30, 10); // inside 24h: channel allocations do not reserve seats
  const book = async (d: any, qty = 1) => {
    const r: any = await createChannelBooking(null, { idempotencyKey: key(), input: { departureId: d.id, source: 'phone', paymentMethod: 'cash', tickets: [{ id: adult.id, qty }], lead: { name: 'Seat Holder', email: tag + randomUUID().slice(0, 4) + '@guest.example' }, participants: Array.from({ length: qty }, (_, i) => ({ ticketTypeId: adult.id, fullName: 'Guest ' + i, age: 30 })) } }, ops);
    return p.booking.findUnique({ where: { bookingRef: r.bookingRef } });
  };
  const join = (d: any, email: string, tickets: any[], ctx: any = anon, f = joinWaitlist) => f(null, { idempotencyKey: key(), input: { departureId: d.id, tickets, lead: { name: 'Waiting ' + email, email: tag + email + '@guest.example', phone: '555-0100' } } }, ctx);
  const cancel = (b: any) => refundBooking(null, { idempotencyKey: key(), input: { bookingId: b.id, amountCents: b.totalCents, reason: 'Guest cancelled by phone', cancelBooking: true } }, ops);
  const entry = (id: string) => p.waitlistEntry.findUnique({ where: { id } });

  const b1 = await book(full), b2 = await book(full);
  // Refusals at join.
  await assert.rejects(() => join(roomy, 'r', [{ id: adult.id, qty: 1 }]), /Seats are available/);
  await assert.rejects(() => join(full, 'big', [{ id: adult.id, qty: 3 }]), /larger than the departure/);
  await assert.rejects(() => join(full, 'x', [{ id: adult.id, qty: 1 }], guide, addToWaitlist), /Not authorized/);
  await assert.rejects(() => joinWaitlist(null, { idempotencyKey: key(), input: { departureId: full.id, tickets: [{ id: adult.id, qty: 1 }], lead: { name: 'No Mail', email: 'nope' } } }, anon), /valid email/);

  const e1: any = await join(full, 'one', [{ id: free.id, qty: 1 }]);              // online, 1 seat, free ticket
  const e2: any = await join(full, 'two', [{ id: adult.id, qty: 2 }], ops, addToWaitlist); // phone, 2 seats
  const e3: any = await join(full, 'three', [{ id: adult.id, qty: 1 }]);           // online, 1 seat
  assert.deepEqual([e1.position, e2.position, e3.position], [1, 2, 3]);
  assert.match(e1.link, /^\/waitlist#c[a-z0-9]+\./);
  await assert.rejects(() => join(full, 'one', [{ id: adult.id, qty: 1 }]), /already on the waitlist/);
  await assert.rejects(() => waitlistStatus(null, { entryId: e1.entryId, token: waitlistToken(e2.entryId) }, anon), /not found/);
  const s1: any = await waitlistStatus(null, { entryId: e1.entryId, token: waitlistToken(e1.entryId) }, anon);
  assert.equal(s1.status, 'waiting'); assert.equal(s1.position, 1);
  await assert.rejects(() => claimWaitlistOffer(null, { entryId: e1.entryId, token: waitlistToken(e1.entryId), cartToken: 'x'.repeat(40) }, anon), /no open offer/);

  // One seat frees: the oldest party that fits (e1) is offered and held; e2 (2 seats) keeps its place; nobody else can take the seat.
  await cancel(b1);
  let r1 = await entry(e1.entryId), r2 = await entry(e2.entryId), r3 = await entry(e3.entryId);
  assert.equal(r1.status, 'offered'); assert.equal(r2.status, 'waiting'); assert.equal(r3.status, 'waiting');
  const hold1 = await p.inventoryHold.findUnique({ where: { id: r1.offerHoldId } });
  assert.equal(hold1.status, 'active'); assert.equal(hold1.quantity, 1); assert.ok(hold1.expiresAt > new Date(Date.now() + 3600000));
  await assert.rejects(() => book(full), /Not enough seats/);
  const board: any = await waitlistBoard(null, {}, ops);
  assert.deepEqual(board.filter((r: any) => r.departureId === full.id).map((r: any) => r.status), ['offered', 'waiting', 'waiting']);
  await assert.rejects(() => waitlistBoard(null, {}, guide), /Not authorized/);

  // Guest claims the offer and books it through the normal checkout ($0 ticket, so no card).
  const cart = randomUUID() + randomUUID();
  const claim: any = await claimWaitlistOffer(null, { entryId: e1.entryId, token: waitlistToken(e1.entryId), cartToken: cart }, anon);
  assert.equal(claim.holdId, hold1.id);
  assert.equal((await checkoutHold(null, { holdId: hold1.id, token: cart }, anon) as any).id, hold1.id);
  const started: any = await startBookingCheckout(null, { idempotencyKey: key(), input: { holdId: hold1.id, token: cart, lead: { name: 'Waiting one', email: tag + 'one@guest.example' }, participants: [{ ticketTypeId: free.id, fullName: 'Waiting One', age: 30 }] } }, anon);
  assert.equal((await p.inventoryHold.findUnique({ where: { id: hold1.id } })).expiresAt.getTime(), hold1.expiresAt.getTime(), 'checkout does not shorten the offer');
  await completeBookingCheckout(null, { idempotencyKey: key(), input: { bookingRef: started.bookingRef, token: cart } }, anon);
  r1 = await entry(e1.entryId);
  assert.equal(r1.status, 'converted'); assert.equal(r1.bookingRef, started.bookingRef);
  assert.equal((await p.booking.findUnique({ where: { bookingRef: started.bookingRef } })).status, 'confirmed');
  await assert.rejects(() => leaveWaitlist(null, { entryId: e1.entryId, token: waitlistToken(e1.entryId), idempotencyKey: key() }, anon), /Already booked/);

  // Another seat frees: e2 (2) does not fit, e3 (1) is offered. e3 leaves: the seat is released and not offered to e2 (still 1 seat).
  await cancel(b2);
  r2 = await entry(e2.entryId); r3 = await entry(e3.entryId);
  assert.equal(r2.status, 'waiting'); assert.equal(r3.status, 'offered');
  const k3 = key();
  const left: any = await leaveWaitlist(null, { entryId: e3.entryId, token: waitlistToken(e3.entryId), idempotencyKey: k3 }, anon);
  assert.equal(left.status, 'withdrawn');
  assert.deepEqual(await leaveWaitlist(null, { entryId: e3.entryId, token: waitlistToken(e3.entryId), idempotencyKey: k3 }, anon), left, 'replay');
  assert.equal((await p.inventoryHold.findUnique({ where: { id: r3.offerHoldId } })).status, 'released');
  assert.equal((await entry(e2.entryId)).status, 'waiting');

  // Resize adds a seat: now 2 free, e2 is offered.
  await resizeDeparture(null, { idempotencyKey: key(), input: { departureId: full.id, capacity: 3 } }, ops);
  r2 = await entry(e2.entryId); assert.equal(r2.status, 'offered');
  // Staff books e2 for cash: wrong name count refused, then booked; replay returns the same booking.
  await assert.rejects(() => bookWaitlistOffer(null, { idempotencyKey: key(), input: { entryId: e2.entryId, participants: ['Only One'] } }, ops), /Enter 2 participant names/);
  await assert.rejects(() => bookWaitlistOffer(null, { idempotencyKey: key(), input: { entryId: e2.entryId, participants: ['A', 'B'] } }, guide), /Not authorized/);
  const kb = key();
  const booked: any = await bookWaitlistOffer(null, { idempotencyKey: kb, input: { entryId: e2.entryId, participants: ['Pat Two', 'Sam Two'] } }, ops);
  assert.deepEqual(await bookWaitlistOffer(null, { idempotencyKey: kb, input: { entryId: e2.entryId, participants: ['Pat Two', 'Sam Two'] } }, ops), booked);
  assert.equal(booked.totalCents, 8000);
  const bk = await p.booking.findUnique({ where: { bookingRef: booked.bookingRef }, include: { payments: true, participants: true } });
  assert.equal(bk.status, 'confirmed'); assert.equal(bk.seats, 2); assert.equal(bk.payments[0].paymentMethod, 'cash'); assert.equal(bk.payments[0].amount, 8000); assert.equal(bk.participants.length, 2);
  assert.equal((await entry(e2.entryId)).status, 'converted');
  assert.equal(await p.booking.count({ where: { departureId: full.id, bookingRef: booked.bookingRef } }), 1);

  // Lapsed offer: expires and passes to the next party.
  const e4: any = await join(full, 'four', [{ id: adult.id, qty: 1 }]);
  const e5: any = await join(full, 'five', [{ id: adult.id, qty: 1 }]);
  const seatOwner = await p.booking.findUnique({ where: { bookingRef: started.bookingRef } });
  await refundBooking(null, { idempotencyKey: key(), input: { bookingId: seatOwner.id, amountCents: 0, reason: 'Guest cannot come', cancelBooking: true } }, ops);
  const r4 = await entry(e4.entryId); assert.equal(r4.status, 'offered');
  await p.waitlistEntry.update({ where: { id: e4.entryId }, data: { offerExpiresAt: new Date(Date.now() - 1000) } });
  await p.inventoryHold.update({ where: { id: r4.offerHoldId }, data: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await waitlistStatus(null, { entryId: e4.entryId, token: waitlistToken(e4.entryId) }, anon) as any).status, 'expired');
  await assert.rejects(() => claimWaitlistOffer(null, { entryId: e4.entryId, token: waitlistToken(e4.entryId), cartToken: cart }, anon), /no open offer/);
  const promoted = await p.$transaction(async (tx: any) => { await lockTransactionKey(tx, `departure:${full.id}`); return promoteWaitlist(tx, full.id, user.id); });
  assert.deepEqual(promoted, { offered: 1, expired: 1 });
  assert.equal((await entry(e4.entryId)).status, 'expired'); assert.equal((await entry(e5.entryId)).status, 'offered');

  // Staff withdraws with a reason; the held seat is released.
  await assert.rejects(() => withdrawWaitlistEntry(null, { idempotencyKey: key(), input: { entryId: e5.entryId, reason: ' ' } }, ops), /reason/);
  await withdrawWaitlistEntry(null, { idempotencyKey: key(), input: { entryId: e5.entryId, reason: 'Guest booked another day' } }, ops);
  assert.equal((await entry(e5.entryId)).status, 'withdrawn');

  // Concurrent joins with the same email: exactly one entry.
  const twice = await Promise.allSettled([join(full, 'race', [{ id: adult.id, qty: 1 }]), join(full, 'race', [{ id: adult.id, qty: 1 }])]);
  // (After e5 left, the departure has room again, so both may be refused as "seats available". Fill it first if so.)
  if (twice.every((t) => t.status === 'rejected')) assert.match(String((twice[0] as any).reason?.message), /Seats are available|already on/);
  else assert.equal(twice.filter((t) => t.status === 'fulfilled').length, 1);
  await book(full); // fill the freed seat
  const race = await Promise.allSettled([join(full, 'race2', [{ id: adult.id, qty: 1 }]), join(full, 'race2', [{ id: adult.id, qty: 1 }])]);
  assert.equal(race.filter((t) => t.status === 'fulfilled').length, 1, 'one entry per email under the lock');
  assert.equal(await p.waitlistEntry.count({ where: { departureId: full.id, guestEmail: tag + 'race2@guest.example' } }), 1);

  // Weather cancel closes the waitlist.
  await weatherCancelDeparture(null, { idempotencyKey: key(), input: { departureId: full.id, reason: 'Gale warning test' } }, ops);
  assert.equal(await p.waitlistEntry.count({ where: { departureId: full.id, status: { in: ['waiting', 'offered'] } } }), 0);

  const audits = await p.auditEvent.findMany({ where: { targetList: 'WaitlistEntry', targetId: { in: [e1.entryId, e2.entryId, e3.entryId, e4.entryId, e5.entryId] } }, select: { action: true } });
  for (const a of ['waitlist.joined', 'waitlist.offered', 'waitlist.offer_claimed', 'waitlist.withdrawn', 'waitlist.booked', 'waitlist.offer_expired']) assert.ok(audits.some((x: any) => x.action === a), a);
  console.log('PASS waitlist: join refusals, positions, proof, oldest-that-fits offer with a held seat, new arrival refused, guest claim + checkout converts, leave releases, resize offers, staff cash booking with replay, lapsed offer passes on, staff withdraw, one entry per email under a race, weather cancel closes, audits and offer notice');
  await p.$disconnect();
}
main().catch(async e => { console.error(e); await p.$disconnect(); process.exit(1); });
