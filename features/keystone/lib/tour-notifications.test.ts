import test from 'node:test';
import assert from 'node:assert/strict';
import { decideNotification, notificationAfter, composeNotification } from './tour-notifications';

test('no stored preference means opted in', () => assert.equal(decideNotification('a@b.co', null, 'booking_confirmation').status, 'queued'));
test('bookingUpdates=false suppresses confirmation and reminder', () => {
  for (const k of ['booking_confirmation', 'day_before_reminder'] as const) assert.equal(decideNotification('a@b.co', { bookingUpdates: false }, k).status, 'suppressed');
});
test('weather opt-out does not suppress booking updates', () => assert.equal(decideNotification('a@b.co', { bookingUpdates: true, weatherCancellation: false }, 'day_before_reminder').status, 'queued'));
test('invalid email is suppressed with a reason', () => { const d = decideNotification('nope', null, 'booking_confirmation'); assert.equal(d.status, 'suppressed'); assert.match(d.reason, /email/); });
test('message carries ref, tour, local time and meeting point', () => {
  const m = composeNotification('day_before_reminder', { bookingRef: 'TG-1', guestName: 'Sam' }, { tourName: 'Kayak', startAt: '2026-11-05T14:00:00Z', timezone: 'America/New_York', meetingPoint: { name: 'Dock', address: '1 Pier' } });
  assert.match(m.text, /9:00 AM/); assert.match(m.text, /Dock, 1 Pier/); assert.match(m.subject, /TG-1/);
});
test('notificationAfter lowercases the recipient and sets action', () => {
  const r = notificationAfter('booking_confirmation', { bookingRef: 'TG-2', guestEmail: ' Sam@X.CO ' }, { tourName: 'T', startAt: new Date() }, { bookingUpdates: false });
  assert.equal(r.action, 'notification.suppressed'); assert.equal(r.after.to, 'sam@x.co');
});
test('weather notice follows weatherCancellation, not bookingUpdates', () => {
  assert.equal(decideNotification('a@b.co', { bookingUpdates: false, weatherCancellation: true }, 'weather_cancellation').status, 'queued');
  const d = decideNotification('a@b.co', { bookingUpdates: true, weatherCancellation: false }, 'weather_cancellation');
  assert.equal(d.status, 'suppressed'); assert.match(d.reason, /weather/);
});
test('weather message offers rebook or full refund with the amount', () => {
  const m = composeNotification('weather_cancellation', { bookingRef: 'TG-9', guestName: 'Sam' }, { tourName: 'Kayak', startAt: '2026-11-05T14:00:00Z', timezone: 'America/New_York', refundCents: 20000 });
  assert.match(m.text, /rebook/); assert.match(m.text, /\$200\.00/); assert.match(m.subject, /weather/i);
});
