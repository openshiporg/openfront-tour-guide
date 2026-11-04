import { authorize, userFacingError } from '../lib/tour-command';
import { zonedStart } from '../lib/tour-schedule';
import { assertDepartureAccess } from '../lib/tour-scope';

const LIVE = ['confirmed', 'checked_in', 'completed', 'no_show', 'partially_refunded'];
const WORKING = ['accepted', 'worked'];
const DAY = (d: Date, tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d);

async function zone(db: any) { return (await db.storeSettings.findFirst({ select: { timezone: true } }))?.timezone || 'America/New_York'; }

// A guide's own days: only departures where THEIR assignment is accepted or worked (offers and declines are handled on the guide roster).
// The guide is found from the signed-in user, never from an argument, so nobody can read another guide's schedule by id.
export async function myDepartures(_r: any, args: any, context: any) {
  const user = await authorize(context, 'canCheckIn');
  try {
    const db = context.prisma, tz = await zone(db);
    const guide = await db.guide.findUnique({ where: { userId: user.id }, select: { id: true, name: true } });
    if (!guide) return { guide: null, departures: [] };
    const days = Math.min(Math.max(Number(args.days) || 14, 1), 60);
    const from = zonedStart(DAY(new Date(), tz), '00:00', tz), to = new Date(from.getTime() + days * 86400000);
    const assignments = await db.guideAssignment.findMany({
      where: { guideId: guide.id, status: { in: WORKING }, departure: { startAt: { gte: from, lt: to }, status: { notIn: ['cancelled', 'weather_cancelled'] } } },
      orderBy: { departure: { startAt: 'asc' } }, take: 100,
      include: { departure: { include: { tour: { select: { name: true, meetingPoint: { select: { name: true, instructions: true } } } } } } },
    });
    const out = [];
    for (const a of assignments) {
      const d = a.departure;
      const [agg, gaps] = await Promise.all([
        db.booking.aggregate({ where: { departureId: d.id, status: { in: LIVE } }, _sum: { seats: true }, _count: true }),
        db.participant.count({ where: { waiverStatus: 'required', booking: { departureId: d.id, status: { in: LIVE } } } }),
      ]);
      out.push({ id: d.id, startAt: d.startAt, endAt: d.endAt, status: d.status, tourName: d.tour.name, meetingPoint: d.tour.meetingPoint?.name || null, role: a.role, assignmentStatus: a.status, guests: agg._sum.seats || 0, bookings: agg._count, waiverGaps: gaps });
    }
    return { guide, departures: out };
  } catch (e) { throw userFacingError(e); }
}

// Printable pickup sheet. Operations staff (departures or bookings) may open any departure; a guide only their own.
// It carries what a driver needs: where, when, who, party size and notes. No amounts, payment state, refunds, email or medical notes.
export async function pickupSheet(_r: any, args: any, context: any) {
  const user = await authorize(context, 'canCheckIn');
  try {
    const db = context.prisma;
    const d = await db.departure.findUnique({ where: { id: String(args.departureId || '') }, include: { tour: { select: { name: true, meetingPoint: { select: { name: true, address: true, instructions: true } } } }, assignedGuides: { include: { guide: { select: { name: true, userId: true } } } } } });
    if (!d) throw new Error('Departure not found');
    await assertDepartureAccess(db, user, d.id);
    const bookings = await db.booking.findMany({ where: { departureId: d.id, status: { in: LIVE } }, orderBy: [{ pickupLocation: 'asc' }, { bookingRef: 'asc' }], select: { bookingRef: true, guestName: true, guestPhone: true, pickupLocation: true, specialRequests: true, seats: true, participants: { select: { fullName: true }, orderBy: { fullName: 'asc' } } } });
    const stops = new Map<string, any>();
    for (const b of bookings) {
      const name = (b.pickupLocation || '').trim() || 'Meet at the meeting point';
      if (!stops.has(name)) stops.set(name, { name, guests: 0, bookings: [] });
      const s = stops.get(name); s.guests += b.seats || 0;
      s.bookings.push({ bookingRef: b.bookingRef, leadName: b.guestName, phone: b.guestPhone || '', partySize: b.seats || 0, names: b.participants.map((p: any) => p.fullName).filter(Boolean), notes: (b.specialRequests || '').trim() });
    }
    const list = [...stops.values()].sort((a, b) => (a.name.startsWith('Meet at') ? 1 : 0) - (b.name.startsWith('Meet at') ? 1 : 0) || a.name.localeCompare(b.name));
    return { departure: { id: d.id, startAt: d.startAt, tourName: d.tour.name, meetingPoint: d.tour.meetingPoint || null, guides: d.assignedGuides.filter((a: any) => WORKING.includes(a.status)).map((a: any) => a.guide?.name).filter(Boolean) }, totalGuests: list.reduce((n, s) => n + s.guests, 0), stops: list };
  } catch (e) { throw userFacingError(e); }
}
