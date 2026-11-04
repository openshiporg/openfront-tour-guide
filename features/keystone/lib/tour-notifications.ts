// Guest notification queue. Records only: nothing here talks to a mail or SMS transport.
// Each decision is stored as an AuditEvent (action notification.queued | notification.suppressed) so a later worker can
// deliver the queued ones and the suppressed ones stay as evidence that the guest's preference was honoured.
export type NotificationKind = 'booking_confirmation' | 'day_before_reminder';
export type Preference = { bookingUpdates?: boolean | null; weatherCancellation?: boolean | null } | null | undefined;

const PREFERENCE_FOR: Record<NotificationKind, 'bookingUpdates'> = { booking_confirmation: 'bookingUpdates', day_before_reminder: 'bookingUpdates' };

// Email is the only channel the preference model carries. No stored preference means the defaults (opted in).
export function decideNotification(email: string, pref: Preference, kind: NotificationKind): { status: 'queued' | 'suppressed'; reason: string } {
  const to = String(email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { status: 'suppressed', reason: 'No valid email address for this guest' };
  if (pref && pref[PREFERENCE_FOR[kind]] === false) return { status: 'suppressed', reason: 'Guest opted out of booking updates' };
  return { status: 'queued', reason: '' };
}

export const notificationRequestId = (kind: NotificationKind, bookingId: string) => `notify:${kind}:${bookingId}`;

type Booking = { bookingRef: string; guestName?: string | null; guestEmail?: string | null };
type Trip = { tourName: string; startAt: Date | string; timezone?: string | null; meetingPoint?: { name?: string; address?: string; instructions?: string } | null };

const when = (startAt: Date | string, timezone?: string | null) => {
  try { return new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeStyle: 'short', timeZone: timezone || 'UTC' }).format(new Date(startAt)); }
  catch { return new Date(startAt).toISOString(); }
};

export function composeNotification(kind: NotificationKind, booking: Booking, trip: Trip) {
  const name = String(booking.guestName || '').trim() || 'there';
  const mp = trip.meetingPoint;
  const meet = mp?.name ? `\nMeet at: ${[mp.name, mp.address].filter(Boolean).join(', ')}${mp.instructions ? `\n${mp.instructions}` : ''}` : '';
  const at = when(trip.startAt, trip.timezone);
  if (kind === 'booking_confirmation') {
    return { subject: `Booking ${booking.bookingRef} confirmed: ${trip.tourName}`, text: `Hi ${name},\n\nYour booking ${booking.bookingRef} for ${trip.tourName} on ${at} is confirmed.${meet}` };
  }
  return { subject: `Tomorrow: ${trip.tourName} (${booking.bookingRef})`, text: `Hi ${name},\n\nA reminder that ${trip.tourName} departs on ${at}.${meet}\n\nBooking reference: ${booking.bookingRef}` };
}

export function notificationAfter(kind: NotificationKind, booking: Booking, trip: Trip, pref: Preference) {
  const decision = decideNotification(booking.guestEmail || '', pref, kind);
  const message = composeNotification(kind, booking, trip);
  const action = decision.status === 'queued' ? 'notification.queued' : 'notification.suppressed';
  return { action, reason: decision.reason, after: { kind, channel: 'email', to: String(booking.guestEmail || '').trim().toLowerCase(), subject: message.subject, text: message.text, bookingRef: booking.bookingRef, status: decision.status } };
}

// Reminder window: departures starting within the next 25 hours (the sweep runs hourly, one hour of slack).
export const REMINDER_WINDOW_MS = 25 * 3600000;
