// Pure rules for guest self-service (manage-booking link). No I/O: the mutations load the rows and ask these questions.
export type PolicyRule = { hoursBefore: number; refundBps: number };

// Self-service closes at the same moment booking closes for the departure: start time minus the operator's booking cutoff.
export function selfServiceWindow(startAt: Date | string, cutoffMinutes: number | null | undefined, now = new Date()) {
  const closesAt = new Date(new Date(startAt).getTime() - (cutoffMinutes ?? 0) * 60000);
  return { closesAt, open: closesAt.getTime() > now.getTime() };
}

// Human wording of the published policy, strictest cut-off last: "Full refund up to 24 hours before; 50% up to 12 hours before; no refund after".
export function describePolicy(rules: PolicyRule[] | null | undefined): string[] {
  const sorted = [...(rules || [])].sort((a, b) => b.hoursBefore - a.hoursBefore);
  if (!sorted.length) return ['No refund once booked'];
  const pct = (bps: number) => (bps >= 10000 ? 'Full refund' : bps <= 0 ? 'No refund' : `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}% refund`);
  const hours = (h: number) => (h === 1 ? '1 hour' : h % 24 === 0 && h >= 48 ? `${h / 24} days` : `${h} hours`);
  const lines = sorted.filter(r => r.hoursBefore > 0).map(r => `${pct(r.refundBps)} up to ${hours(r.hoursBefore)} before the start`);
  const last = sorted.find(r => r.hoursBefore === 0);
  lines.push(last ? `${pct(last.refundBps)} after that` : 'No refund after that');
  return lines;
}

// "Same price": the ticket and add-on subtotals (before discount and tax) are equal. Discount and tax rules are unchanged by moving.
export const samePrice = (a: { subtotalCents: number; addOnsCents: number }, b: { subtotalCents: number; addOnsCents: number }) =>
  a.subtotalCents === b.subtotalCents && a.addOnsCents === b.addOnsCents;

// The manage link keeps the proof in the URL fragment so it never reaches a server log: /manage#<bookingRef>.<token>
export const manageLinkPath = (bookingRef: string, token: string) => `/manage#${bookingRef}.${token}`;
export function parseManageHash(hash: string): { bookingRef: string; token: string } | null {
  const m = /^#?([A-Z0-9-]{4,40})\.([A-Za-z0-9_-]{20,120})$/.exec(String(hash || '').trim());
  return m ? { bookingRef: m[1], token: m[2] } : null;
}
