import { authorize, audit } from '../lib/tour-command';

const LIVE = ['confirmed', 'checked_in', 'completed', 'no_show', 'partially_refunded'];
// Operator reads for the Today and check-in screens. Capability-gated; medical notes are staff-only and audited.
export async function departuresInRange(_r: any, args: any, context: any) {
  await authorize(context, 'canCheckIn');
  const from = new Date(args.from), to = new Date(args.to);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from || to.getTime() - from.getTime() > 31 * 86400000) throw new Error('Choose a range of at most 31 days');
  const rows = await context.prisma.departure.findMany({
    where: { startAt: { gte: from, lt: to } }, orderBy: { startAt: 'asc' }, take: 300,
    include: { tour: { select: { id: true, name: true, guideRatio: true, minParticipants: true, requiresWaiverId: true } }, assignedGuides: { include: { guide: { select: { id: true, name: true } } } }, resourceAssignments: { include: { resource: { select: { name: true } } } } },
  });
  const out = [];
  for (const d of rows) {
    const [booked, held, gaps] = await Promise.all([
      context.prisma.booking.aggregate({ where: { departureId: d.id, status: { in: LIVE } }, _sum: { seats: true }, _count: true }),
      context.prisma.inventoryHold.aggregate({ where: { departureId: d.id, status: 'active', expiresAt: { gt: new Date() } }, _sum: { quantity: true } }),
      context.prisma.participant.count({ where: { waiverStatus: 'required', booking: { departureId: d.id, status: { in: LIVE } } } }),
    ]);
    const seats = booked._sum.seats || 0;
    const accepted = d.assignedGuides.filter((a: any) => ['accepted', 'worked'].includes(a.status));
    out.push({
      id: d.id, startAt: d.startAt, endAt: d.endAt, status: d.status, capacity: d.capacity, tourId: d.tour.id, tourName: d.tour.name, minParticipants: d.tour.minParticipants,
      booked: seats, held: held._sum.quantity || 0, bookings: booked._count, waiverGaps: gaps, guidesNeeded: Math.ceil(seats / d.tour.guideRatio), guidesAssigned: accepted.length,
      staffed: accepted.length >= Math.ceil(seats / d.tour.guideRatio), guides: d.assignedGuides.map((a: any) => ({ id: a.id, name: a.guide?.name, role: a.role, status: a.status })), resources: d.resourceAssignments.map((r: any) => `${r.resource?.name} x${r.quantity}`),
    });
  }
  return out;
}
export async function departureManifest(_r: any, args: any, context: any) {
  const user = await authorize(context, 'canCheckIn');
  const canMedical = !!user.role?.canReadMedicalNotes;
  const d = await context.prisma.departure.findUnique({ where: { id: args.departureId }, include: { tour: { include: { meetingPoint: true } } } });
  if (!d) throw new Error('Departure not found');
  const bookings = await context.prisma.booking.findMany({ where: { departureId: d.id, status: { in: LIVE } }, orderBy: { bookingRef: 'asc' }, include: { participants: true } });
  if (canMedical && bookings.some((b: any) => b.participants.some((p: any) => p.medicalNotes))) {
    await context.prisma.$transaction((tx: any) => audit(tx, user.id, 'medical_notes.read', 'Departure', d.id, null, null, 'Manifest viewed'));
  }
  return {
    departure: { id: d.id, startAt: d.startAt, endAt: d.endAt, status: d.status, tourName: d.tour.name, meetingPoint: d.tour.meetingPoint?.name || null },
    bookings: bookings.map((b: any) => ({
      id: b.id, bookingRef: b.bookingRef, status: b.status, leadName: b.guestName, leadPhone: b.guestPhone, pickupLocation: b.pickupLocation, specialRequests: b.specialRequests,
      participants: b.participants.map((p: any) => ({ id: p.id, fullName: p.fullName, age: p.age, dietary: p.dietary, medicalFlag: !!p.medicalNotes, medicalNotes: canMedical ? p.medicalNotes : null, waiverStatus: p.waiverStatus, checkInStatus: p.checkInStatus })),
    })),
  };
}
