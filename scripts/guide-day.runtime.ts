// Scratch-DB proof of "my departures" and the pickup sheet. Fixtures are depth-*; remove with scripts/depth-cleanup.ts apply.
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { createChannelBooking } from '../features/keystone/mutations/tour-checkout';
import { myDepartures, pickupSheet, dayPickupSheet } from '../features/keystone/mutations/tour-guide-day';
const p: any = new PrismaClient(), tag = 'depth-' + randomUUID().slice(0, 8);
const key = () => tag + randomUUID();
async function main() {
  const mkUser = async (suffix: string, perms: any) => {
    const role = await p.role.create({ data: { name: tag + suffix, ...perms } });
    const user = await p.user.create({ data: { name: tag + suffix, email: tag + suffix + '@test.example', password: 'disabled-runtime-fixture', roleId: role.id } });
    return { user, ctx: { prisma: p, session: { itemId: user.id, data: { role } } } as any };
  };
  const ops = await mkUser('ops', { canManageBookings: true, canManagePayments: true, canCheckIn: true, canManageDepartures: true });
  const g1 = await mkUser('g1', { canCheckIn: true }), g2 = await mkUser('g2', { canCheckIn: true }), nolink = await mkUser('nl', { canCheckIn: true }), nocheck = await mkUser('nc', {});
  const guide1 = await p.guide.create({ data: { name: tag + ' Guide One', userId: g1.user.id, status: 'active' } });
  const guide2 = await p.guide.create({ data: { name: tag + ' Guide Two', userId: g2.user.id, status: 'active' } });
  const tour = await p.tour.create({ data: { name: tag, slug: tag, status: 'active', maxParticipants: 100 } });
  const tk = await p.ticketType.create({ data: { tourId: tour.id, name: 'Adult', priceCents: 7777, active: true, seatsUsed: 1, countsTowardCapacity: true } });
  const dep = async (days: number, status = 'on_sale') => { const startAt = new Date(Date.now() + days * 86400000); return p.departure.create({ data: { tourId: tour.id, departureKey: tag + days + status + randomUUID(), startAt, endAt: new Date(+startAt + 3600000), capacity: 30, status } }); };
  const mine = await dep(1), offered = await dep(2), other = await dep(3), cancelled = await dep(4, 'cancelled'), far = await dep(40), past = await dep(-3);
  const asg = (d: any, g: any, status: string) => p.guideAssignment.create({ data: { departureId: d.id, guideId: g.id, role: 'lead', status } });
  await asg(mine, guide1, 'accepted'); await asg(offered, guide1, 'offered'); await asg(other, guide2, 'accepted'); await asg(cancelled, guide1, 'accepted'); await asg(far, guide1, 'accepted'); await asg(past, guide1, 'worked');
  const book = (d: any, qty: number, name: string, names: string[]) => createChannelBooking(null, { idempotencyKey: key(), input: { departureId: d.id, source: 'phone', paymentMethod: 'cash', tickets: [{ id: tk.id, qty }], lead: { name, email: tag + randomUUID().slice(0, 4) + '@secret.example', phone: '555-0100' }, participants: names.map(n => ({ ticketTypeId: tk.id, fullName: n, age: 30 })) } }, ops.ctx);
  const b1 = await book(mine, 2, 'Zed Lead', ['Zed Lead', 'Zoe Guest']), b2 = await book(mine, 1, 'Amy Solo', ['Amy Solo']), b3 = await book(mine, 3, 'Cal Party', ['Cal A', 'Cal B', 'Cal C']);
  await book(other, 1, 'Other Guest', ['Other Guest']);
  const set = (b: any, data: any) => p.booking.update({ where: { bookingRef: b.bookingRef }, data });
  await set(b1, { pickupLocation: 'Hotel Meeting', specialRequests: 'Wheelchair at the curb' }); await set(b3, { pickupLocation: 'Hotel Meeting' });
  await p.participant.updateMany({ where: { fullName: 'Zoe Guest' }, data: { medicalNotes: 'SECRET-MEDICAL' } });
  // 1. My departures: only my accepted, upcoming, not cancelled departures; offers, other guides', far-future and past are excluded.
  const mineRes: any = await myDepartures(null, { days: 14 }, g1.ctx);
  assert.equal(mineRes.guide.id, guide1.id); assert.deepEqual(mineRes.departures.map((d: any) => d.id), [mine.id]);
  assert.equal(mineRes.departures[0].guests, 6); assert.equal(mineRes.departures[0].bookings, 3);
  assert.equal(((await myDepartures(null, { days: 60 }, g1.ctx)) as any).departures.length, 2, 'wider window adds the far departure only');
  const g2Res: any = await myDepartures(null, {}, g2.ctx); assert.deepEqual(g2Res.departures.map((d: any) => d.id), [other.id]);
  assert.deepEqual(await myDepartures(null, {}, nolink.ctx), { guide: null, departures: [] });
  await assert.rejects(() => myDepartures(null, {}, nocheck.ctx), /Not authorized/);
  // 2. Pickup sheet content: grouped by pickup point, party size, names, notes, phone.
  const sheet: any = await pickupSheet(null, { departureId: mine.id }, g1.ctx);
  assert.equal(sheet.totalGuests, 6); assert.deepEqual(sheet.stops.map((s: any) => [s.name, s.guests]), [['Hotel Meeting', 5], ['Meet at the meeting point', 1]]);
  const hotel = sheet.stops[0].bookings; assert.deepEqual(hotel.map((b: any) => b.leadName), ['Cal Party', 'Zed Lead'].sort((a, c) => (hotel.findIndex((x: any) => x.leadName === a) - hotel.findIndex((x: any) => x.leadName === c))));
  const zed = hotel.find((b: any) => b.leadName === 'Zed Lead'); assert.deepEqual([zed.partySize, zed.names, zed.notes, zed.phone], [2, ['Zed Lead', 'Zoe Guest'], 'Wheelchair at the curb', '555-0100']);
  // 3. No payment data, email or medical notes anywhere in the payload.
  const raw = JSON.stringify(sheet);
  for (const bad of ['totalCents', 'subtotal', 'refunded', 'payment', 'amount', 'price', '7777', '@secret.example', 'SECRET-MEDICAL', 'medical', 'channel', 'discount']) assert.ok(!raw.toLowerCase().includes(bad.toLowerCase()), 'leaked ' + bad);
  // 4. Access: a guide cannot open another guide's departure, an unaccepted offer, or any id they are not on; staff can open any; no permission is refused.
  await assert.rejects(() => pickupSheet(null, { departureId: other.id }, g1.ctx), /not on your schedule/);
  await assert.rejects(() => pickupSheet(null, { departureId: offered.id }, g1.ctx), /not on your schedule/);
  await assert.rejects(() => pickupSheet(null, { departureId: mine.id }, g2.ctx), /not on your schedule/);
  assert.equal(((await pickupSheet(null, { departureId: other.id }, ops.ctx)) as any).totalGuests, 1);
  await assert.rejects(() => pickupSheet(null, { departureId: mine.id }, nocheck.ctx), /Not authorized/);
  await assert.rejects(() => pickupSheet(null, { departureId: 'nope' }, ops.ctx), /Departure not found/);
  // 4b. Pickup sheet for the whole day: every running departure that starts that local day, one query for bookings, same access rule.
  const local = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d);
  const later = await p.departure.create({ data: { tourId: tour.id, departureKey: tag + 'later' + randomUUID(), startAt: new Date(+mine.startAt + 3 * 3600000), endAt: new Date(+mine.startAt + 4 * 3600000), capacity: 20, status: 'on_sale', bookingCutoffMinutes: 0 } });
  const sameDayOther = await p.departure.create({ data: { tourId: tour.id, departureKey: tag + 'sdo' + randomUUID(), startAt: new Date(+mine.startAt + 1 * 3600000), endAt: new Date(+mine.startAt + 2 * 3600000), capacity: 20, status: 'on_sale', bookingCutoffMinutes: 0 } });
  await asg(later, guide1, 'accepted'); await asg(sameDayOther, guide2, 'accepted');
  await book(later, 2, 'Late Lead', ['Late Lead', 'Late Two']); await book(sameDayOther, 1, 'Other Same Day', ['Other Same Day']);
  const day = local(mine.startAt);
  const dayDeps = (r: any) => r.departures.filter((d: any) => [mine.id, later.id, sameDayOther.id].includes(d.id)).map((d: any) => d.id);
  const ds: any = await dayPickupSheet(null, { day }, ops.ctx);
  assert.deepEqual(dayDeps(ds), [mine.id, sameDayOther.id, later.id], 'operations: all of the day, in time order');
  const dsMine = ds.departures.find((d: any) => d.id === mine.id); assert.equal(dsMine.totalGuests, 6); assert.deepEqual(dsMine.stops.map((s: any) => s.name), ['Hotel Meeting', 'Meet at the meeting point']);
  assert.deepEqual(dsMine.stops, ((await pickupSheet(null, { departureId: mine.id }, ops.ctx)) as any).stops, 'same stops as the per-departure sheet');
  assert.equal(ds.totalGuests, ds.departures.reduce((n: number, d: any) => n + d.totalGuests, 0));
  const gs: any = await dayPickupSheet(null, { day }, g1.ctx);
  assert.deepEqual(dayDeps(gs), [mine.id, later.id], 'guide: only their own accepted departures that day');
  assert.deepEqual((await dayPickupSheet(null, { day }, nolink.ctx) as any).departures.filter((d: any) => [mine.id, later.id, sameDayOther.id].includes(d.id)), [], 'unlinked login sees none');
  await assert.rejects(() => dayPickupSheet(null, { day }, nocheck.ctx), /Not authorized/);
  await assert.rejects(() => dayPickupSheet(null, { day: 'tomorrow' }, ops.ctx), /Choose a day/);
  const leak = JSON.stringify(ds); for (const bad of ['@secret.example', 'SECRET-MEDICAL', 'totalCents', 'paid', 'refund']) assert.ok(!leak.includes(bad), 'day sheet leaks ' + bad);
  await p.departure.update({ where: { id: later.id }, data: { status: 'weather_cancelled' } });
  assert.deepEqual(dayDeps(await dayPickupSheet(null, { day }, g1.ctx)), [mine.id], 'cancelled departures drop off');
  // 5. Cancelled bookings drop off the sheet.
  await set(b2, { status: 'cancelled' });
  assert.equal(((await pickupSheet(null, { departureId: mine.id }, g1.ctx)) as any).totalGuests, 5);
  console.log('PASS guide day: my departures scoping, pickup sheet grouping, whole-day sheet, no payment/email/medical data, access');
  await p.$disconnect();
}
main().catch(async e => { console.error(e); await p.$disconnect(); process.exit(1); });
