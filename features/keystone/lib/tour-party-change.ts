// Pure rules for changing a confirmed booking's party (who is coming, and on which tickets). No I/O.
// Units the guest already paid for keep the price they were sold at; only added units are priced at today's price for the departure,
// so a change never re-prices what was paid. Add-ons do not change here.
import { basisPoints, minor, refundPolicyAmount, type CancellationRule } from './tour-money';

export type TicketLine = { catalogId: string; name: string; unitPriceCents: number; qty: number; seatsUsed: number };
export type Offer = { name: string; unitPriceCents: number; seatsUsed: number };
export type Promo = { discountType: string; value: number } | null | undefined;

// New ticket lines for the new head count per ticket type. For each type the existing lines are kept in order (the first sold first),
// trimmed when there are fewer people; extra people are added at today's price (merged into a kept line sold at that same price).
export function planTicketLines(old: TicketLine[], counts: Record<string, number>, offers: Record<string, Offer>): TicketLine[] {
  const types = [...new Set([...old.map(l => l.catalogId), ...Object.keys(counts)])];
  const out: TicketLine[] = [];
  for (const type of types) {
    let need = counts[type] || 0;
    if (!Number.isSafeInteger(need) || need < 0 || need > 100) throw new Error('Invalid quantity');
    const kept: TicketLine[] = [];
    for (const l of old.filter(l => l.catalogId === type)) {
      if (need <= 0) break;
      const qty = Math.min(l.qty, need);
      kept.push({ ...l, qty }); need -= qty;
    }
    if (need > 0) {
      const o = offers[type];
      if (!o) throw new Error('That ticket is no longer sold for this tour');
      const same = kept.find(l => l.unitPriceCents === o.unitPriceCents);
      if (same) same.qty += need; else kept.push({ catalogId: type, name: o.name, unitPriceCents: o.unitPriceCents, qty: need, seatsUsed: o.seatsUsed });
    }
    out.push(...kept);
  }
  if (!out.some(l => l.qty > 0)) throw new Error('At least one person must stay on the booking. To cancel, use Cancel');
  return out;
}

export const seatsOf = (lines: TicketLine[]) => lines.reduce((n, l) => n + l.seatsUsed * l.qty, 0);

// Subtotal, discount and tax for a set of ticket lines plus the booking's unchanged add-ons. The promo snapshot taken at booking time
// applies again (no new redemption is used): percent re-applies, a fixed amount is capped at the new base, a comp stays free.
export function partyTotals(lines: TicketLine[], addOnsCents: number, promo: Promo, taxBps: number) {
  const subtotalCents = lines.reduce((n, l) => n + minor(l.unitPriceCents) * minor(l.qty), 0);
  const base = subtotalCents + minor(addOnsCents);
  const discountCents = !promo ? 0 : promo.discountType === 'comp' ? base : promo.discountType === 'percent_bps' ? basisPoints(base, promo.value) : Math.min(base, minor(promo.value));
  const taxCents = basisPoints(base - discountCents, taxBps || 0);
  return { subtotalCents, discountCents, taxCents, totalCents: base - discountCents + taxCents };
}

// What the change does to money. Both totals are computed the same way with today's tax rate, so only the change itself moves the
// price (a tax setting edited since booking does not leak into the difference). A guest who pays less gets the removed amount back
// under the booking's published policy; what the policy keeps stays on the booking as a fee. Staff refund the whole difference.
export function settleChange(a: { oldTotalCents: number; oldFeeCents: number; before: { totalCents: number }; after: { totalCents: number }; guest: boolean; rules: CancellationRule[]; hoursBefore: number }) {
  const differenceCents = a.after.totalCents - a.before.totalCents;
  if (differenceCents >= 0) return { differenceCents, collectCents: differenceCents, refundCents: 0, keptCents: 0, feeCents: a.oldFeeCents, totalCents: a.oldTotalCents + differenceCents };
  const owed = -differenceCents;
  const refundCents = a.guest ? refundPolicyAmount(owed, a.rules, a.hoursBefore) : owed;
  const keptCents = owed - refundCents;
  return { differenceCents, collectCents: 0, refundCents, keptCents, feeCents: a.oldFeeCents + keptCents, totalCents: a.oldTotalCents - refundCents };
}
