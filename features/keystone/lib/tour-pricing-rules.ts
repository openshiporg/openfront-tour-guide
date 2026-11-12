import { zonedStart } from './tour-schedule';

// Operator input for one seasonal pricing rule, checked once here so the editor and the command agree.
// A rule sets either a percentage change (basis points) or a fixed price per ticket, never both; a rule with neither would be ignored at checkout.
export type RuleInput = { id?: string | null; tourId: string; ticketTypeId?: string | null; name: string; from?: string | null; to?: string | null; weekdays?: number[] | null; adjustBps?: number | null; overridePriceCents?: number | null };
export const MAX_OVERRIDE_CENTS = 100_000_000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const plusDay = (d: string, n: number) => new Date(new Date(`${d}T12:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

export function checkRule(i: RuleInput, timeZone: string) {
  const name = String(i.name || '').trim();
  if (!name || name.length > 80) throw new Error('Give the rule a name of 80 characters or fewer');
  const hasAdjust = i.adjustBps !== null && i.adjustBps !== undefined, hasOverride = i.overridePriceCents !== null && i.overridePriceCents !== undefined;
  if (hasAdjust === hasOverride) throw new Error('Set either a percentage change or a fixed price, not both and not neither');
  if (hasAdjust && (!Number.isInteger(i.adjustBps) || (i.adjustBps as number) < -9000 || (i.adjustBps as number) > 100000)) throw new Error('The percentage change must be between -90% and +1000%');
  if (hasOverride && (!Number.isSafeInteger(i.overridePriceCents) || (i.overridePriceCents as number) < 0 || (i.overridePriceCents as number) > MAX_OVERRIDE_CENTS)) throw new Error('The fixed price must be a whole number of cents from 0 to 1,000,000.00');
  for (const d of [i.from, i.to]) if (d && !DAY.test(d)) throw new Error('Dates must be YYYY-MM-DD');
  if (i.from && i.to && i.to < i.from) throw new Error('The end date is before the start date');
  const days = i.weekdays?.length ? [...new Set(i.weekdays)].sort((a, b) => a - b) : null;
  if (days && days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw new Error('Weekdays must be Sunday (0) to Saturday (6)');
  if (days && days.length === 7) return { name, weekdays: null as number[] | null, ...window(i, timeZone), adjustBps: hasAdjust ? (i.adjustBps as number) : null, overridePriceCents: hasOverride ? (i.overridePriceCents as number) : null };
  return { name, weekdays: days, ...window(i, timeZone), adjustBps: hasAdjust ? (i.adjustBps as number) : null, overridePriceCents: hasOverride ? (i.overridePriceCents as number) : null };
}
// Dates are days in the tour's timezone: the rule starts at 00:00 on the first day and ends just before 00:00 after the last day.
function window(i: RuleInput, tz: string) {
  return {
    validFrom: i.from ? zonedStart(i.from, '00:00', tz) : null,
    validTo: i.to ? new Date(zonedStart(plusDay(i.to, 1), '00:00', tz).getTime() - 1000) : null,
  };
}
export const dayOf = (d: Date | string | null | undefined, tz: string) => (d ? new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(d)) : null);
