export type PricingRuleRow = { id: string; ticketTypeId: string | null; validFrom: Date | null; validTo: Date | null; weekdays: unknown; adjustBps: number | null; overridePriceCents: number | null; createdAt?: Date };

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function weekdayIn(date: Date, timeZone: string) {
  return DAYS.indexOf(new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone }).format(date));
}

// A rule applies to the departure start (not the purchase time). Ticket-specific rules beat tour-wide ones;
// within the same specificity the newest rule wins. An override price beats a percentage adjustment.
export function applyPricingRules(baseCents: number, ticketTypeId: string, startAt: Date, timeZone: string, rules: PricingRuleRow[]) {
  if (!Number.isSafeInteger(baseCents) || baseCents < 0) throw new Error('Invalid base price');
  const day = weekdayIn(startAt, timeZone);
  const matching = rules.filter(r =>
    (!r.ticketTypeId || r.ticketTypeId === ticketTypeId) &&
    (!r.validFrom || r.validFrom <= startAt) && (!r.validTo || r.validTo >= startAt) &&
    (!Array.isArray(r.weekdays) || !r.weekdays.length || (r.weekdays as number[]).includes(day)) &&
    (r.overridePriceCents !== null || r.adjustBps !== null));
  matching.sort((a, b) => Number(!!b.ticketTypeId) - Number(!!a.ticketTypeId) || (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  const rule = matching[0];
  if (!rule) return { unitPriceCents: baseCents, ruleId: null as string | null };
  if (rule.overridePriceCents !== null) {
    if (!Number.isSafeInteger(rule.overridePriceCents) || rule.overridePriceCents < 0) throw new Error('Invalid pricing rule');
    return { unitPriceCents: rule.overridePriceCents, ruleId: rule.id };
  }
  const bps = rule.adjustBps as number;
  if (!Number.isInteger(bps) || bps < -10000 || bps > 100000) throw new Error('Invalid pricing rule');
  return { unitPriceCents: Math.round(baseCents * (10000 + bps) / 10000), ruleId: rule.id };
}
