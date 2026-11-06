// Offline check-in: a guide's device keeps tapping while it has no signal and replays the taps later. The server decides each
// replayed tap against what is true NOW (another device, the office or the guest may have changed the booking meanwhile).
// Pure so the rules can be unit tested; the mutation loads the state, calls decide(), then writes what was applied.

export type OfflineEvent = { key: string; kind: 'check_in' | 'no_show'; participantId?: string | null; bookingId?: string | null; recordedAt: string };
export type BookingState = { id: string; bookingRef: string; status: string; departureId: string; participants: { id: string; fullName: string; checkInStatus: string | null }[] };
export type Decision =
  | { key: string; outcome: 'applied'; kind: OfflineEvent['kind']; bookingId: string; participantId?: string; label: string }
  | { key: string; outcome: 'already'; label: string }
  | { key: string; outcome: 'conflict'; label: string; reason: string };

export const MAX_EVENTS = 50;
export const KEY_RE = /^[A-Za-z0-9_-]{8,80}$/;
const SKEW_MS = 5 * 60000;

// A device clock can be wrong. A tap stamped in the future is clamped to the moment the server received it.
export function recordedTime(raw: string, now: Date): Date {
  const t = new Date(raw);
  if (Number.isNaN(t.getTime())) return now;
  return t.getTime() > now.getTime() + SKEW_MS ? now : t;
}

export function validateBatch(events: OfflineEvent[]): string | null {
  if (!Array.isArray(events) || !events.length) return 'Nothing to sync';
  if (events.length > MAX_EVENTS) return `Sync at most ${MAX_EVENTS} taps at a time`;
  const seen = new Set<string>();
  for (const e of events) {
    if (!e || !KEY_RE.test(String(e.key || ''))) return 'Each tap needs a key';
    if (seen.has(e.key)) return 'The same tap was sent twice in one batch';
    seen.add(e.key);
    if (e.kind === 'check_in' && !e.participantId) return 'A check-in tap needs a participant';
    if (e.kind === 'no_show' && !e.bookingId) return 'A no-show tap needs a booking';
    if (e.kind !== 'check_in' && e.kind !== 'no_show') return 'Unknown tap';
  }
  return null;
}

// Events are decided in the order they were tapped; each applied event changes the state the next one sees.
export function decide(events: OfflineEvent[], bookings: BookingState[], departureId: string, done: Set<string>): Decision[] {
  const byBooking = new Map(bookings.map((b) => [b.id, { ...b, participants: b.participants.map((p) => ({ ...p })) }]));
  const byParticipant = new Map<string, { b: BookingState; p: BookingState['participants'][number] }>();
  for (const b of byBooking.values()) for (const p of b.participants) byParticipant.set(p.id, { b, p });
  const ordered = [...events].sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());
  const out: Decision[] = [];
  for (const e of ordered) {
    if (done.has(e.key)) { out.push({ key: e.key, outcome: 'already', label: 'Already synced' }); continue; }
    if (e.kind === 'check_in') {
      const hit = byParticipant.get(String(e.participantId));
      if (!hit || hit.b.departureId !== departureId) { out.push({ key: e.key, outcome: 'conflict', label: 'Check-in', reason: 'This guest is no longer on this departure (moved or removed from the party). Check the booking.' }); continue; }
      const { b, p } = hit, label = `${p.fullName} · ${b.bookingRef}`;
      if (p.checkInStatus === 'checked_in') { out.push({ key: e.key, outcome: 'already', label }); continue; }
      if (!['confirmed', 'checked_in'].includes(b.status)) { out.push({ key: e.key, outcome: 'conflict', label, reason: b.status === 'no_show' ? 'Marked no show on another device. Undo the no show at the office if they came.' : `The booking is ${b.status.replaceAll('_', ' ')} now.` }); continue; }
      p.checkInStatus = 'checked_in';
      if (b.participants.every((x) => x.checkInStatus === 'checked_in') && b.status === 'confirmed') b.status = 'checked_in';
      out.push({ key: e.key, outcome: 'applied', kind: 'check_in', bookingId: b.id, participantId: p.id, label });
    } else {
      const b = byBooking.get(String(e.bookingId));
      if (!b || b.departureId !== departureId) { out.push({ key: e.key, outcome: 'conflict', label: 'No show', reason: 'This booking is no longer on this departure.' }); continue; }
      const label = `No show · ${b.bookingRef}`;
      if (b.status === 'no_show') { out.push({ key: e.key, outcome: 'already', label }); continue; }
      if (b.participants.some((x) => x.checkInStatus === 'checked_in')) { out.push({ key: e.key, outcome: 'conflict', label, reason: 'Someone in this booking was checked in, so it was not marked no show.' }); continue; }
      if (b.status !== 'confirmed') { out.push({ key: e.key, outcome: 'conflict', label, reason: `The booking is ${b.status.replaceAll('_', ' ')} now.` }); continue; }
      b.status = 'no_show';
      for (const x of b.participants) if (x.checkInStatus === 'pending' || !x.checkInStatus) x.checkInStatus = 'no_show';
      out.push({ key: e.key, outcome: 'applied', kind: 'no_show', bookingId: b.id, label });
    }
  }
  return out;
}
