import { graphql } from '@keystone-6/core';
import { integer, text, timestamp, virtual } from '@keystone-6/core/fields';
import { domainList, name, state, rel } from './domainFields';
async function occupancy(item: any, context: any) {
  const [bookings, holds, assignments] = await Promise.all([
    context.prisma.booking.aggregate({ where: { departureId: item.id, status: { in: ['confirmed','checked_in','completed','no_show'] } }, _sum: { seats: true } }),
    context.prisma.inventoryHold.aggregate({ where: { departureId: item.id, status: 'active', expiresAt: { gt: new Date() } }, _sum: { quantity: true } }),
    context.prisma.guideAssignment.count({ where: { departureId: item.id, status: { in: ['accepted','worked'] } } }),
  ]);
  const tour = await context.prisma.tour.findUnique({ where: { id: item.tourId } });
  return { booked: bookings._sum.seats || 0, held: holds._sum.quantity || 0, assigned: assignments, ratio: tour?.guideRatio || 12 };
}
const count = (key: string) => virtual({ field: graphql.field({ type: graphql.Int, async resolve(item, _args, context) { const o = await occupancy(item, context); return key === 'remaining' ? Math.max(0, ((item as any).capacity as number) - o.booked - o.held) : key === 'guidesNeeded' ? Math.ceil(o.booked / o.ratio) : o[key as 'booked' | 'held']; } }) });
export const Departure = domainList('canManageDepartures', {
  departureKey: text({ isIndexed: 'unique', validation: { isRequired: true } }), tour: rel('Tour.departures'), schedule: rel('Schedule.departures'),
  startAt: timestamp({ validation: { isRequired: true }, isIndexed: true }), endAt: timestamp({ validation: { isRequired: true } }), capacity: integer({ validation: { isRequired: true, min: 1 } }),
  status: state(['scheduled','on_sale','min_not_met','confirmed','full','closed','in_progress','completed','cancelled','weather_cancelled']), bookingCutoffMinutes: integer({ defaultValue: 60, validation: { min: 0 } }),
  assignedGuides: rel('GuideAssignment.departure', true), resourceAssignments: rel('ResourceAssignment.departure', true), holds: rel('InventoryHold.departure', true), bookings: rel('Booking.departure', true), tasks: rel('OperationalTask.departure', true), waitlist: rel('WaitlistEntry.departure', true), notes: text(),
  booked: count('booked'), held: count('held'), remaining: count('remaining'), guidesNeeded: count('guidesNeeded'),
  staffed: virtual({ field: graphql.field({ type: graphql.Boolean, async resolve(item, _a, context) { const o = await occupancy(item, context); return o.assigned >= Math.ceil(o.booked / o.ratio); } }) }),
}, true);
