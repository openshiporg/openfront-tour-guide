import { authorize, command, audit, userFacingError } from '../lib/tour-command';
import { checkRule, dayOf } from '../lib/tour-pricing-rules';

// Seasonal pricing editor. Rules are applied at quote time by applyPricingRules (lib/tour-pricing.ts); every booking keeps its own price snapshot,
// so saving or removing a rule never changes a booking that already exists. Each change is audited with before and after.
const shape = (r: any, tz: string) => ({
  id: r.id, name: r.name, tourId: r.tourId, ticketTypeId: r.ticketTypeId || null, from: dayOf(r.validFrom, tz), to: dayOf(r.validTo, tz),
  weekdays: Array.isArray(r.weekdays) ? r.weekdays : [], adjustBps: r.adjustBps ?? null, overridePriceCents: r.overridePriceCents ?? null, currencyCode: r.currencyCode,
});

export async function pricingRuleBoard(_r: any, _args: any, context: any) {
  await authorize(context, 'canManageTours');
  try {
    const db = context.prisma;
    const [tours, rules] = await Promise.all([
      db.tour.findMany({ where: { status: { not: 'archived' } }, orderBy: { name: 'asc' }, take: 200, select: { id: true, name: true, timezone: true, ticketTypes: { where: { active: true }, orderBy: { priceCents: 'desc' }, select: { id: true, name: true, priceCents: true, currencyCode: true } } } }),
      db.pricingRule.findMany({ orderBy: [{ createdAt: 'desc' }], take: 1000 }),
    ]);
    const zone = new Map<string, string>(tours.map((t: any) => [t.id, t.timezone || 'America/New_York']));
    return { tours, rules: rules.filter((r: any) => r.tourId).map((r: any) => shape(r, zone.get(r.tourId) || 'America/New_York')) };
  } catch (e) { throw userFacingError(e); }
}

export async function savePricingRule(_r: any, args: any, context: any) {
  const actor = await authorize(context, 'canManageTours'); const i = args.input;
  if (!i?.tourId) throw new Error('Choose a tour');
  return command(context, args.idempotencyKey, 'savePricingRule', i, [`pricingrules:${i.tourId}`], async tx => {
    const tour = await tx.tour.findUnique({ where: { id: i.tourId }, select: { id: true, timezone: true } });
    if (!tour) throw new Error('Tour not found');
    const tz = tour.timezone || 'America/New_York';
    const checked = checkRule(i, tz);
    let ticket: any = null;
    if (i.ticketTypeId) {
      ticket = await tx.ticketType.findFirst({ where: { id: i.ticketTypeId, tourId: tour.id } });
      if (!ticket) throw new Error('That ticket type is not on this tour');
    }
    const currencyCode = ticket?.currencyCode || (await tx.ticketType.findFirst({ where: { tourId: tour.id }, select: { currencyCode: true } }))?.currencyCode || 'USD';
    const data = { name: checked.name, validFrom: checked.validFrom, validTo: checked.validTo, weekdays: checked.weekdays ?? undefined, adjustBps: checked.adjustBps, overridePriceCents: checked.overridePriceCents, currencyCode };
    if (i.id) {
      const before = await tx.pricingRule.findUnique({ where: { id: i.id } });
      if (!before || before.tourId !== tour.id) throw new Error('Pricing rule not found');
      const row = await tx.pricingRule.update({ where: { id: i.id }, data: { ...data, weekdays: checked.weekdays ?? [], ticketType: ticket ? { connect: { id: ticket.id } } : { disconnect: true } } });
      await audit(tx, actor.id, 'pricing_rule.updated', 'PricingRule', row.id, shape(before, tz), shape(row, tz));
      return { id: row.id };
    }
    const row = await tx.pricingRule.create({ data: { ...data, weekdays: checked.weekdays ?? [], tour: { connect: { id: tour.id } }, ...(ticket ? { ticketType: { connect: { id: ticket.id } } } : {}) } });
    await audit(tx, actor.id, 'pricing_rule.created', 'PricingRule', row.id, null, shape(row, tz));
    return { id: row.id };
  });
}

export async function removePricingRule(_r: any, args: any, context: any) {
  const actor = await authorize(context, 'canManageTours'); const i = args.input;
  // Looked up first only to take the same per-tour lock as saving; a rule already removed by this same request still replays its result.
  const found = await context.prisma.pricingRule.findUnique({ where: { id: i?.id }, select: { tourId: true } });
  return command(context, args.idempotencyKey, 'removePricingRule', i, [found ? `pricingrules:${found.tourId}` : `pricingrule:${i?.id}`], async tx => {
    const before = await tx.pricingRule.findUnique({ where: { id: i.id }, include: { tour: { select: { timezone: true } } } });
    if (!before) throw new Error('Pricing rule not found');
    await tx.pricingRule.delete({ where: { id: i.id } });
    await audit(tx, actor.id, 'pricing_rule.removed', 'PricingRule', i.id, shape(before, before.tour?.timezone || 'America/New_York'), null);
    return { id: i.id, removed: true };
  });
}
