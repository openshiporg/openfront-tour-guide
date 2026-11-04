import { authorize, command, audit, lockTransactionKey } from '../lib/tour-command';

export function validatePayout(payout: any) {
  if (!payout.assignments.length || payout.assignments.some((a: any) => a.status !== 'worked' || a.guideId !== payout.guideId || a.currencyCode !== payout.currencyCode)) throw new Error('Payout requires worked assignments for the same guide and currency');
  const total = payout.assignments.reduce((n: number, a: any) => n + a.payCents, 0);
  if (!Number.isSafeInteger(total) || total < 0 || total !== payout.totalCents) throw new Error('Payout total does not match assignments');
}
export function settlementTransition(kind: 'payout' | 'statement', current: string, next: string, reference?: string) {
  const first = kind === 'payout' ? 'draft' : 'open', second = kind === 'payout' ? 'approved' : 'invoiced';
  if (!((current === first && next === second) || (current === second && next === 'paid'))) throw new Error('Invalid settlement transition');
  if (next === 'paid' && (!reference?.trim() || reference.trim().length > 200)) throw new Error('Payment receipt/reference required (maximum 200 characters)');
}

// Manual evidence only: no bank transfer or provider call is performed by these commands.
export async function transitionGuidePayout(_r: any, args: any, context: any) {
  await authorize(context, 'canManageGuides'); await authorize(context, 'canManagePayments');
  const i = args.input;
  return command(context, args.idempotencyKey, 'transitionGuidePayout', i, [`payout:${i.id}`], async tx => {
    const payout = await tx.guidePayout.findUnique({ where: { id: i.id }, include: { assignments: true } });
    if (!payout) throw new Error('Payout not found');
    settlementTransition('payout', payout.status, i.status, i.reference);
    validatePayout(payout);
    const result = await tx.guidePayout.updateMany({ where: { id: payout.id, status: payout.status }, data: { status: i.status, ...(i.status === 'paid' ? { paidAt: new Date(), reference: i.reference.trim() } : {}) } });
    if (result.count !== 1) throw new Error('Payout changed concurrently');
    await audit(tx, context.session.itemId, 'guide.payout_' + i.status, 'GuidePayout', payout.id, { status: payout.status }, { status: i.status, totalCents: payout.totalCents, currencyCode: payout.currencyCode, reference: i.reference?.trim() || '' }, i.reference?.trim() || '', args.idempotencyKey);
    return { id: payout.id, status: i.status };
  });
}
