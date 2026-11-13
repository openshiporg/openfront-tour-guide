// Pure tender rules. A booking can hold several captured payments (the original card or cash, a party-change top-up, later a voucher).
// No I/O: tour-checkout.ts loads the payments under the departure lock and asks these questions.
import { minor } from './tour-money';

export type Tender = { id: string; amount: number; refundedAmount?: number | null; createdAt: Date | string; paymentMethod?: string | null };

// Split a refund across the captured payments, newest first: the last charge is undone first, so a refunded party increase goes back
// to the card that paid for it and the original charge is touched only after that. Each leg is capped at what that payment has left.
// Throws when the refund is more than all payments have left together.
export function allocateRefund(tenders: Tender[], amount: number): { paymentId: string; amount: number }[] {
  minor(amount);
  const ordered = [...tenders].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt) || b.id.localeCompare(a.id));
  const legs: { paymentId: string; amount: number }[] = [];
  let left = amount;
  for (const t of ordered) {
    if (left <= 0) break;
    const room = minor(t.amount) - minor(t.refundedAmount || 0);
    if (room <= 0) continue;
    const take = Math.min(room, left);
    legs.push({ paymentId: t.id, amount: take });
    left -= take;
  }
  if (left > 0) throw new Error('Refund exceeds captured amount');
  return legs;
}

// Idempotency keys of the legs of one refund: the first leg keeps the caller's key (so existing lookups by key still find a refund),
// later legs add ~1, ~2. A replay finds every leg by the key or the key~ prefix.
export const legKey = (key: string, index: number) => (index === 0 ? key : `${key}~${index}`);
export const legWhere = (key: string) => ({ OR: [{ idempotencyKey: key }, { idempotencyKey: { startsWith: `${key}~` } }] });

// Staff refund request checks, before anything is reserved: a refund moves money (0 is allowed only to cancel a booking with nothing
// to give back), and a retry with the same idempotency key must ask for the same amount, or it would silently return the first refund.
export function refundRequestRefusal(amount: number, cancel: boolean, priorLegs: { amount: number }[]): string | null {
  if (!Number.isSafeInteger(amount) || amount < 0) return 'Refund amount must be a whole number of cents, 0 or more';
  if (amount === 0 && !cancel) return 'Enter a refund amount above 0';
  if (priorLegs.length) {
    const prior = priorLegs.reduce((n, l) => n + l.amount, 0);
    if (prior !== amount) return 'This request was already used for a different refund amount. Start a new refund.';
  }
  return null;
}
