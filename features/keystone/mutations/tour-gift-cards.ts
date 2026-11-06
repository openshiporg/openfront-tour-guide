// Gift cards: stored value issued at the desk (cash) or as a complimentary voucher, redeemed at online checkout as a second tender next to
// the bank card, returned to the card on refund. The balance lives on GiftCard and every change is a GiftCardEntry under giftcard:<id>.
// Lock order everywhere: departure:<id> before giftcard:<id>.
import { randomBytes } from 'node:crypto';
import { command, audit, authorize, hashToken, derivedToken, lockTransactionKey, userFacingError } from '../lib/tour-command';
import { codeFromBytes, formatCode, normalizeCode, unusable, issueAmount } from '../lib/tour-gift-card';

// The code is recomputable by the server only (like waiver and manage links), so staff can show it again; the database keeps its hash.
export const giftCardCode = (id: string) => formatCode(codeFromBytes(Buffer.from(derivedToken('giftcard', id), 'base64url')));
export async function findCardByCode(db: any, code: string) {
  const raw = normalizeCode(code);
  return raw ? db.giftCard.findUnique({ where: { codeHash: hashToken(formatCode(raw)) } }) : null;
}

// Caller holds giftcard:<id>. Takes amount off the balance; refuses when the card cannot pay or no longer has it.
export async function debitCard(tx: any, a: { cardId: string; amount: number; currencyCode: string; key: string; booking: { id: string; bookingRef: string }; paymentId: string; actorId: string | null }) {
  const done = await tx.giftCardEntry.findUnique({ where: { idempotencyKey: a.key } });
  if (done) return done;
  const card = await tx.giftCard.findUnique({ where: { id: a.cardId } });
  const why = unusable(card, a.currencyCode);
  if (why) throw new Error(why);
  if (card.balanceCents < a.amount) throw new Error('The gift card balance changed; it no longer covers this amount');
  const balanceAfterCents = card.balanceCents - a.amount;
  await tx.giftCard.update({ where: { id: card.id }, data: { balanceCents: balanceAfterCents } });
  const entry = await tx.giftCardEntry.create({ data: { giftCardId: card.id, kind: 'redeem', amountCents: -a.amount, balanceAfterCents, bookingId: a.booking.id, bookingRef: a.booking.bookingRef, paymentId: a.paymentId, idempotencyKey: a.key, reason: 'Booking payment', actorId: a.actorId || '' } });
  await audit(tx, a.actorId, 'giftcard.redeemed', 'GiftCard', card.id, { balanceCents: card.balanceCents }, { balanceCents: balanceAfterCents, bookingRef: a.booking.bookingRef }, '', a.key);
  return entry;
}
// Caller holds the departure lock; takes giftcard:<id>. A refund leg paid by gift card goes back on the card (never out as cash).
// The value goes back even to an expired or void card, and is flagged in the audit so staff can reissue it.
export async function returnToCard(tx: any, a: { cardId: string; amount: number; key: string; booking: { id: string; bookingRef: string }; paymentId: string; reason: string; actorId: string | null }) {
  await lockTransactionKey(tx, `giftcard:${a.cardId}`);
  if (await tx.giftCardEntry.findUnique({ where: { idempotencyKey: a.key } })) return;
  const card = await tx.giftCard.findUnique({ where: { id: a.cardId } });
  const balanceAfterCents = card.balanceCents + a.amount;
  await tx.giftCard.update({ where: { id: card.id }, data: { balanceCents: balanceAfterCents } });
  await tx.giftCardEntry.create({ data: { giftCardId: card.id, kind: 'return', amountCents: a.amount, balanceAfterCents, bookingId: a.booking.id, bookingRef: a.booking.bookingRef, paymentId: a.paymentId, idempotencyKey: a.key, reason: a.reason || 'Refund', actorId: a.actorId || '' } });
  const stuck = card.status !== 'active' || (card.expiresAt && card.expiresAt <= new Date());
  await audit(tx, a.actorId, stuck ? 'giftcard.returned_to_unusable_card' : 'giftcard.returned', 'GiftCard', card.id, { balanceCents: card.balanceCents }, { balanceCents: balanceAfterCents, bookingRef: a.booking.bookingRef }, stuck ? 'Card is void or expired: reissue the value' : a.reason, a.key);
}

const view = (c: any, entries?: any[]) => ({
  id: c.id, last4: c.last4, status: c.expiresAt && c.expiresAt <= new Date() && c.status === 'active' ? 'expired' : c.status, initialCents: c.initialCents, balanceCents: c.balanceCents,
  currencyCode: c.currencyCode, expiresAt: c.expiresAt, fundedBy: c.fundedBy, recipientName: c.recipientName, recipientEmail: c.recipientEmail, note: c.note, createdAt: c.createdAt,
  ...(entries ? { entries: entries.map((e: any) => ({ kind: e.kind, amountCents: e.amountCents, balanceAfterCents: e.balanceAfterCents, bookingRef: e.bookingRef, reason: e.reason, createdAt: e.createdAt })) } : {}),
});

// Staff: sell a card for cash at the desk, or give a complimentary voucher. Returns the code once per request (replays return it again).
export async function issueGiftCard(_r: any, args: any, context: any) {
  const user = await authorize(context, 'canManagePayments'); const i = args.input || {};
  const amount = issueAmount(Number(i.amountCents));
  const fundedBy = i.fundedBy === 'complimentary' ? 'complimentary' : 'cash';
  const recipientName = String(i.recipientName || '').trim(), recipientEmail = String(i.recipientEmail || '').trim().toLowerCase();
  if (recipientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) throw userFacingError(new Error('Recipient email is not valid'));
  const expiresAt = i.expiresAt ? new Date(i.expiresAt) : null;
  if (expiresAt && !(expiresAt.getTime() > Date.now() + 86400000)) throw userFacingError(new Error('Expiry must be at least a day from now'));
  if (fundedBy === 'complimentary' && !String(i.note || '').trim()) throw userFacingError(new Error('Say why this voucher is complimentary'));
  const settings = await context.prisma.storeSettings.findFirst({ select: { currencyCode: true } });
  const id = 'c' + randomBytes(12).toString('hex');
  const params = { amount, fundedBy, recipientName, recipientEmail, expiresAt: expiresAt?.toISOString() || null, note: String(i.note || '').trim() };
  const card: any = await command(context, args.idempotencyKey, 'issueGiftCard', params, [`giftcard:${id}`], async tx => {
    const code = giftCardCode(id);
    const c = await tx.giftCard.create({ data: { id, codeHash: hashToken(code), last4: code.slice(-4), status: 'active', initialCents: amount, balanceCents: amount, currencyCode: settings?.currencyCode || 'USD', expiresAt, fundedBy, recipientName, recipientEmail, note: params.note, issuedById: user.id } });
    await tx.giftCardEntry.create({ data: { giftCardId: c.id, kind: 'issue', amountCents: amount, balanceAfterCents: amount, idempotencyKey: `gift-issue:${c.id}`, reason: fundedBy === 'cash' ? 'Sold for cash' : `Complimentary: ${params.note}`, actorId: user.id } });
    await audit(tx, user.id, 'giftcard.issued', 'GiftCard', c.id, null, { amountCents: amount, fundedBy, currencyCode: c.currencyCode, last4: c.last4 }, params.note, args.idempotencyKey);
    return { id: c.id };
  });
  const c = await context.prisma.giftCard.findUnique({ where: { id: card.id } });
  return { ...view(c), code: giftCardCode(c.id) };
}
// Staff: show the code again (reprint for a guest who lost it). Audited.
export async function revealGiftCardCode(_r: any, args: any, context: any) {
  const user = await authorize(context, 'canManagePayments');
  const c = await context.prisma.giftCard.findUnique({ where: { id: String(args.id || '') } });
  if (!c) throw userFacingError(new Error('Gift card not found'));
  await context.prisma.$transaction((tx: any) => audit(tx, user.id, 'giftcard.code_shown', 'GiftCard', c.id, null, null, ''));
  return { id: c.id, code: giftCardCode(c.id) };
}
// Staff: void a card (lost, sold in error). The remaining balance is written off in the ledger.
export async function voidGiftCard(_r: any, args: any, context: any) {
  const user = await authorize(context, 'canManagePayments'); const i = args.input || {};
  const reason = String(i.reason || '').trim();
  if (!reason) throw userFacingError(new Error('Reason required'));
  await command(context, args.idempotencyKey, 'voidGiftCard', { id: i.id, reason }, [`giftcard:${i.id}`], async tx => {
    const c = await tx.giftCard.findUnique({ where: { id: String(i.id || '') } });
    if (!c) throw new Error('Gift card not found');
    if (c.status === 'void') return { id: c.id };
    await tx.giftCard.update({ where: { id: c.id }, data: { status: 'void', balanceCents: 0 } });
    await tx.giftCardEntry.create({ data: { giftCardId: c.id, kind: 'void', amountCents: -c.balanceCents, balanceAfterCents: 0, idempotencyKey: `gift-void:${c.id}`, reason, actorId: user.id } });
    await audit(tx, user.id, 'giftcard.voided', 'GiftCard', c.id, { status: c.status, balanceCents: c.balanceCents }, { status: 'void', balanceCents: 0 }, reason, args.idempotencyKey);
    return { id: c.id };
  });
  return view(await context.prisma.giftCard.findUnique({ where: { id: i.id } }));
}
// Staff list: newest first, searchable by last 4, recipient or full code; with the ledger and the outstanding balance (a liability).
export async function giftCardBoard(_r: any, args: any, context: any) {
  await authorize(context, 'canManagePayments');
  const q = String(args.search || '').trim();
  const byCode = q ? await findCardByCode(context.prisma, q) : null;
  const where = byCode ? { id: byCode.id } : q ? { OR: [{ last4: q.toUpperCase() }, { recipientName: { contains: q, mode: 'insensitive' } }, { recipientEmail: { contains: q.toLowerCase() } }] } : {};
  const [cards, outstanding] = await Promise.all([
    context.prisma.giftCard.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100, include: { entries: { orderBy: { createdAt: 'asc' } } } }),
    // Outstanding = every balance still owed, including value a refund returned to a card after it was voided or expired (to reissue).
    context.prisma.giftCard.aggregate({ where: { balanceCents: { gt: 0 } }, _sum: { balanceCents: true }, _count: true }),
  ]);
  return { cards: cards.map((c: any) => view(c, c.entries)), outstandingCents: outstanding._sum.balanceCents || 0, activeCards: outstanding._count };
}
// Guest: what a code is worth before paying. The same answer for a wrong and a void code, so codes cannot be probed for state.
export async function giftCardBalance(_r: any, args: any, context: any) {
  const c = await findCardByCode(context.prisma, args.code);
  const settings = await context.prisma.storeSettings.findFirst({ select: { currencyCode: true } });
  const why = unusable(c, c?.currencyCode || settings?.currencyCode || 'USD');
  if (why) throw userFacingError(new Error(why === 'This gift card is no longer valid' ? 'Gift card not found' : why));
  return { last4: c.last4, balanceCents: c.balanceCents, currencyCode: c.currencyCode, expiresAt: c.expiresAt };
}
