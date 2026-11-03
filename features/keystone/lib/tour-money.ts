export type CancellationRule = { hoursBefore: number; refundBps: number };
export function minor(value: number, label = 'Amount') {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be nonnegative integer minor units`);
  return value;
}
export function basisPoints(amount: number, bps: number) {
  minor(amount); minor(bps, 'Basis points');
  if (bps > 10000) throw new Error('Basis points cannot exceed 10000');
  const result = (BigInt(amount) * BigInt(bps) + BigInt(5000)) / BigInt(10000);
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Money overflow');
  return Number(result);
}
export function settlement(grossCents: number, commissionBps: number) {
  const commissionCents = basisPoints(grossCents, commissionBps);
  return { grossCents, commissionCents, netCents: grossCents - commissionCents };
}
export function refundPolicyAmount(totalCents: number, rules: CancellationRule[], hoursBefore: number, weather = false) {
  minor(totalCents);
  if (!Number.isFinite(hoursBefore)) throw new Error('Invalid departure time');
  if (weather) return totalCents;
  const sorted = [...rules].sort((a,b) => b.hoursBefore - a.hoursBefore);
  for (const rule of sorted) {
    if (!Number.isFinite(rule.hoursBefore) || rule.hoursBefore < 0) throw new Error('Invalid policy rule');
    minor(rule.refundBps); if (rule.refundBps > 10000) throw new Error('Invalid refund basis points');
  }
  const rule = sorted.find(rule => hoursBefore >= rule.hoursBefore);
  return rule ? basisPoints(totalCents, rule.refundBps) : 0;
}
export function minimumDecision(booked: number, minimum: number, startAt: Date, now = new Date()) {
  minor(booked); minor(minimum);
  return { reached: booked >= minimum, needsDecision: booked < minimum && startAt.getTime() - now.getTime() <= 86400000 && startAt > now };
}
export function quoteTotal(lines: { unitPriceCents: number; qty: number; kind: string }[], taxBps = 0, discountCents = 0) {
  let subtotalCents = 0, addOnsCents = 0;
  for (const line of lines) {
    minor(line.unitPriceCents); minor(line.qty); if (!line.qty) throw new Error('Quantity must be positive');
    const amount = minor(line.unitPriceCents * line.qty);
    if (line.kind === 'addon') addOnsCents = minor(addOnsCents + amount); else subtotalCents = minor(subtotalCents + amount);
  }
  minor(discountCents);
  const taxable = minor(subtotalCents + addOnsCents - discountCents);
  const taxCents = basisPoints(taxable, taxBps);
  return { subtotalCents, addOnsCents, discountCents, taxCents, totalCents: minor(taxable + taxCents) };
}
