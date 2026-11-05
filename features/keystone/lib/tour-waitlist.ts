// Pure waitlist rules. No I/O: tour-waitlist.ts loads rows under the departure lock and asks these questions.
export type Entry = { id: string; seats: number; createdAt: Date | string };

// Which waiting parties get an offer when `free` seats open. Oldest first; a party that does not fit is skipped (it keeps its place)
// and a smaller party behind it may take the seats, as on FareHarbor/Peek waitlists. Never offers more seats than are free.
export function pickOffers(waiting: Entry[], free: number): string[] {
  const out: string[] = [];
  let left = Math.max(0, Math.floor(free || 0));
  for (const e of [...waiting].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt) || a.id.localeCompare(b.id))) {
    if (left <= 0) break;
    if (e.seats <= left) { out.push(e.id); left -= e.seats; }
  }
  return out;
}

// How long an offer holds the seats: the operator's offer window, but never past the departure's booking cutoff.
// null = too little time left to be worth an offer (under 10 minutes).
export function offerExpiry(now: Date, startAt: Date | string, cutoffMinutes: number | null | undefined, offerHours: number | null | undefined): Date | null {
  const closes = new Date(startAt).getTime() - (cutoffMinutes ?? 0) * 60000;
  const until = Math.min(now.getTime() + Math.max(1, offerHours || 12) * 3600000, closes);
  return until - now.getTime() < 10 * 60000 ? null : new Date(until);
}

// Position among the parties still waiting (1-based), by join time.
export function positionOf(id: string, waiting: Entry[]): number | null {
  const sorted = [...waiting].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt) || a.id.localeCompare(b.id));
  const i = sorted.findIndex((e) => e.id === id);
  return i < 0 ? null : i + 1;
}

// The guest's waitlist link keeps its proof in the fragment, like the manage link: /waitlist#<entryId>.<token>
export const waitlistLinkPath = (entryId: string, token: string) => `/waitlist#${entryId}.${token}`;
export function parseWaitlistHash(hash: string): { entryId: string; token: string } | null {
  const m = /^#?([a-z0-9]{10,40})\.([A-Za-z0-9_-]{20,120})$/.exec(String(hash || '').trim());
  return m ? { entryId: m[1], token: m[2] } : null;
}
