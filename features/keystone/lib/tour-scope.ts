// Who may see which departure on the check-in side. Operations rights (manage departures or bookings) see every departure.
// Anyone else with canCheckIn (a guide) sees only departures where THEIR assignment is accepted or worked. The guide is resolved
// from the signed-in user, never from an argument. A login that is not linked to a guide profile sees nothing.
export const WORKING_ASSIGNMENTS = ['accepted', 'worked'];
export const seesAllDepartures = (user: any) => !!(user?.role?.canManageDepartures || user?.role?.canManageBookings);

export async function scopedDepartureFilter(db: any, user: any): Promise<any | null> {
  if (seesAllDepartures(user)) return null;
  return { assignedGuides: { some: { status: { in: WORKING_ASSIGNMENTS }, guide: { userId: user.id } } } };
}
export async function assertDepartureAccess(db: any, user: any, departureId: string | null | undefined) {
  if (seesAllDepartures(user)) return;
  const hit = departureId && await db.guideAssignment.findFirst({ where: { departureId, status: { in: WORKING_ASSIGNMENTS }, guide: { userId: user.id } }, select: { id: true } });
  if (!hit) throw new Error('This departure is not on your schedule');
}
