import { authorize } from '../lib/tour-command';

// Read-only staff view of the guest notification queue (AuditEvent records written by lib/tour-notifications).
// Needs canManageBookings, not canReadAudit, so booking staff can see why a guest was or was not messaged.
export async function guestNotifications(_r: any, args: any, context: any) {
  await authorize(context, 'canManageBookings');
  const status = ['queued', 'suppressed', 'all'].includes(args.status) ? args.status : 'all';
  const take = Math.min(Math.max(Number(args.take) || 50, 1), 100);
  const from = args.from ? new Date(args.from) : null, to = args.to ? new Date(args.to) : null;
  if ((from && !Number.isFinite(+from)) || (to && !Number.isFinite(+to))) throw new Error('Date range is invalid');
  const db = context.prisma;
  // Date range and departure both filter on the DEPARTURE start time, which is what staff plan by.
  const bookingWhere: any = {};
  if (args.departureId) bookingWhere.departureId = String(args.departureId);
  if (from || to) bookingWhere.departure = { startAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } };
  let bookingIds: string[] | null = null;
  if (Object.keys(bookingWhere).length) bookingIds = [
    ...(await db.booking.findMany({ where: bookingWhere, select: { id: true }, take: 2000 })).map((b: any) => b.id),
    ...(await db.waitlistEntry.findMany({ where: bookingWhere, select: { id: true }, take: 500 })).map((b: any) => b.id),
  ];
  const kinds = ['booking_confirmation', 'day_before_reminder', 'weather_cancellation', 'waitlist_offer'];
  const rows = await db.auditEvent.findMany({
    where: {
      targetList: 'Notification',
      action: status === 'all' ? { in: ['notification.queued', 'notification.suppressed'] } : `notification.${status}`,
      ...(bookingIds ? { OR: kinds.flatMap((k) => bookingIds!.map((id) => ({ targetId: `${k}:${id}` }))).slice(0, 6000) } : {}),
    },
    orderBy: { createdAt: 'desc' }, take,
  });
  const ids = [...new Set(rows.map((r: any) => String(r.targetId).split(':')[1]).filter(Boolean))] as string[];
  const bookings = ids.length ? await db.booking.findMany({ where: { id: { in: ids } }, select: { id: true, bookingRef: true, departureId: true, departure: { select: { id: true, startAt: true, tour: { select: { name: true } } } } } }) : [];
  const byId = new Map(bookings.map((b: any) => [b.id, b]));
  // Waitlist offers target the waitlist entry, not a booking.
  const entryIds = rows.filter((r: any) => String(r.targetId).startsWith('waitlist_offer:')).map((r: any) => String(r.targetId).split(':')[1]);
  const entries = entryIds.length ? await db.waitlistEntry.findMany({ where: { id: { in: entryIds } }, select: { id: true, bookingRef: true, departure: { select: { id: true, startAt: true, tour: { select: { name: true } } } } } }) : [];
  for (const e of entries) byId.set(e.id, { ...e, bookingRef: e.bookingRef || 'Waitlist' });
  return rows.map((r: any) => {
    const [kind, bookingId] = String(r.targetId).split(':'); const b: any = byId.get(bookingId);
    return { id: r.id, createdAt: r.createdAt, kind, status: r.action === 'notification.queued' ? 'queued' : 'suppressed', reason: r.reason || '', to: r.after?.to || '', subject: r.after?.subject || '',
      bookingRef: b?.bookingRef || r.after?.bookingRef || '', departureId: b?.departure?.id || null, tourName: b?.departure?.tour?.name || '', departureStartAt: b?.departure?.startAt || null };
  });
}
