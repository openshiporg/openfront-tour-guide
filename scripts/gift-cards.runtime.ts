// Scratch-DB + Stripe TEST proof of gift cards: issue (cash and complimentary, audited, code shown once and recomputable), balance lookup,
// checkout paid part by gift card and part by bank card (two payments), fully by gift card (no Stripe), the gift card debited only when
// the booking confirms, a balance spent elsewhere before payment finishes (bank card refunded, booking cancelled), refunds put value back
// on the gift card first (no cash-out), void, concurrency on one card, replays and audit. Every test charge ends refunded. Fixtures are depth-gc-*.
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { placeHold } from '../features/keystone/mutations/tour-catalog';
import { startBookingCheckout, completeBookingCheckout, issueRefund, refundBooking } from '../features/keystone/mutations/tour-checkout';
import { manageToken, cancelManagedBooking } from '../features/keystone/mutations/tour-self-service';
import { issueGiftCard, voidGiftCard, revealGiftCardCode, giftCardBoard, giftCardBalance, giftCardCode } from '../features/keystone/mutations/tour-gift-cards';
const p: any = new PrismaClient(), tag = 'depth-gc-' + randomUUID().slice(0, 8), stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
assert.ok(process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_'), 'Stripe TEST key only');
const key = () => tag + randomUUID();
const intents: string[] = [];
async function confirm(clientSecret: string) {
  const id = clientSecret.split('_secret_')[0]; intents.push(id);
  const pi = await stripe.paymentIntents.confirm(id, { payment_method: 'pm_card_visa' });
  assert.equal(pi.status, 'succeeded');
  return pi;
}
async function main() {
  const role = await p.role.create({ data: { name: tag + 'ops', canAccessDashboard: true, canManageBookings: true, canIssueRefunds: true, canManagePayments: true } });
  const desk = await p.role.create({ data: { name: tag + 'desk', canAccessDashboard: true, canManageBookings: true } });
  const u1 = await p.user.create({ data: { name: tag + ' Ana', email: tag + 'a@test.example', password: 'disabled-runtime-fixture', roleId: role.id } });
  const u2 = await p.user.create({ data: { name: tag + ' Cy', email: tag + 'c@test.example', password: 'disabled-runtime-fixture', roleId: desk.id } });
  const ops: any = { prisma: p, session: { itemId: u1.id, data: { role } } }, deskCtx: any = { prisma: p, session: { itemId: u2.id, data: { role: desk } } }, anon: any = { prisma: p, session: undefined };
  const policy = await p.cancellationPolicy.create({ data: { name: tag + ' policy', rules: [{ hoursBefore: 48, refundBps: 10000 }, { hoursBefore: 0, refundBps: 0 }] } });
  const tour = await p.tour.create({ data: { name: tag, slug: tag, status: 'active', maxParticipants: 100, cancellationPolicyId: policy.id } });
  const adult = await p.ticketType.create({ data: { tourId: tour.id, name: 'Adult', priceCents: 6000, active: true, seatsUsed: 1, countsTowardCapacity: true } });
  const startAt = new Date(Date.now() + 120 * 3600000);
  const dep = await p.departure.create({ data: { tourId: tour.id, departureKey: tag + randomUUID(), startAt, endAt: new Date(+startAt + 3600000), capacity: 40, status: 'on_sale', bookingCutoffMinutes: 60 } });
  const settings = await p.storeSettings.findFirst({ select: { taxBps: true } });
  const priced = (cents: number) => cents + Math.round(cents * (settings?.taxBps || 0) / 10000);
  // Hold + start checkout (optionally with a gift card). Returns what startBookingCheckout said plus the proof token.
  const start = async (qty: number, giftCardCode?: string) => {
    const token = randomUUID() + randomUUID();
    const h: any = await p.$transaction((tx: any) => placeHold(tx, { departureId: dep.id, tickets: [{ id: adult.id, qty }], addOns: [], token } as any, null, key(), undefined, 15 * 60000), { timeout: 20000 });
    const s: any = await startBookingCheckout(null, { idempotencyKey: key(), input: { holdId: h.holdId, token, giftCardCode, lead: { name: 'Gift Guest', email: tag + randomUUID().slice(0, 4) + '@guest.example' }, participants: Array.from({ length: qty }, (_, i) => ({ ticketTypeId: adult.id, fullName: 'Adult ' + (i + 1), age: 30 })) } }, anon);
    return { s, token };
  };
  const finish = (s: any, token: string) => completeBookingCheckout(null, { idempotencyKey: key(), input: { bookingRef: s.bookingRef, token } }, anon);
  const card = (id: string) => p.giftCard.findUnique({ where: { id }, include: { entries: { orderBy: { createdAt: 'asc' } } } });

  // 1. Issue: cash and complimentary, permissions, bounds, replay returns the same card, code shown once and recomputable.
  await assert.rejects(() => issueGiftCard(null, { input: { amountCents: 5000, fundedBy: 'cash' }, idempotencyKey: key() }, deskCtx), /Not authorized/);
  await assert.rejects(() => issueGiftCard(null, { input: { amountCents: 50, fundedBy: 'cash' }, idempotencyKey: key() }, ops), /at least 1.00/);
  await assert.rejects(() => issueGiftCard(null, { input: { amountCents: 5000, fundedBy: 'complimentary' }, idempotencyKey: key() }, ops), /complimentary/);
  const ik = key();
  const g1: any = await issueGiftCard(null, { input: { amountCents: 10000, fundedBy: 'cash', recipientName: 'Maya Ortiz', recipientEmail: tag + 'maya@test.example' }, idempotencyKey: ik }, ops);
  const g1again: any = await issueGiftCard(null, { input: { amountCents: 10000, fundedBy: 'cash', recipientName: 'Maya Ortiz', recipientEmail: tag + 'maya@test.example' }, idempotencyKey: ik }, ops);
  assert.equal(g1again.id, g1.id, 'replay returns the same card');
  await assert.rejects(() => issueGiftCard(null, { input: { amountCents: 9000, fundedBy: 'cash' }, idempotencyKey: ik }, ops), /different|Idempotency/i);
  assert.match(g1.code, /^GC-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal(g1.code, giftCardCode(g1.id));
  assert.equal((await revealGiftCardCode(null, { id: g1.id }, ops) as any).code, g1.code);
  const row1 = await p.giftCard.findUnique({ where: { id: g1.id } });
  assert.ok(row1.codeHash && !JSON.stringify(row1).includes(g1.code.slice(3)), 'only the hash of the code is stored');
  assert.equal(await p.giftCard.count({ where: { id: g1.id } }), 1);
  assert.equal(await p.auditEvent.count({ where: { action: 'giftcard.issued', targetId: g1.id } }), 1);
  assert.equal(await p.auditEvent.count({ where: { action: 'giftcard.code_shown', targetId: g1.id } }), 1);
  const comp: any = await issueGiftCard(null, { input: { amountCents: 2500, fundedBy: 'complimentary', note: 'Sorry for the rained-out sunset tour' }, idempotencyKey: key() }, ops);
  assert.deepEqual([comp.fundedBy, comp.balanceCents], ['complimentary', 2500]);

  // 2. Balance lookup: any typing works; a wrong code and a void code say the same thing.
  const lower = g1.code.toLowerCase().replaceAll('-', ' ');
  assert.equal((await giftCardBalance(null, { code: lower }, anon) as any).balanceCents, 10000);
  await assert.rejects(() => giftCardBalance(null, { code: 'GC-AAAA-BBBB-CCCC' }, anon), /Gift card not found/);

  // 3. Split checkout: 2 adults (12000 + tax), 100.00 on the gift card, the rest by Stripe. Gift card untouched until confirm.
  const total2 = priced(12000);
  const a = await start(2, g1.code);
  assert.deepEqual([a.s.totalCents, a.s.giftCents, a.s.cardCents, a.s.giftLast4], [total2, 10000, total2 - 10000, g1.code.slice(-4)]);
  assert.equal((await card(g1.id)).balanceCents, 10000, 'not debited before payment');
  const pi = await confirm(a.s.clientSecret);
  assert.equal(pi.amount, total2 - 10000, 'Stripe charged only the rest');
  const done: any = await finish(a.s, a.token);
  assert.equal(done.status, 'confirmed');
  await finish(a.s, a.token); // completing twice is safe
  const ab = await p.booking.findUnique({ where: { bookingRef: a.s.bookingRef }, include: { payments: { orderBy: { createdAt: 'asc' } } } });
  assert.deepEqual(ab.payments.map((x: any) => [x.paymentMethod, x.amount, x.isSplitPayment]), [['credit_card', total2 - 10000, true], ['gift_card', 10000, true]]);
  const c1 = await card(g1.id);
  assert.deepEqual([c1.balanceCents, c1.entries.map((e: any) => [e.kind, e.amountCents, e.balanceAfterCents])], [0, [['issue', 10000, 10000], ['redeem', -10000, 0]]]);
  await assert.rejects(() => giftCardBalance(null, { code: g1.code }, anon), /no balance/);

  // 4. Refund on the split booking: guest cancels 5 days out (full refund). Gift card first (recorded last), then the bank card.
  const aLink = { bookingRef: ab.bookingRef, token: manageToken(ab.id) };
  await cancelManagedBooking(null, { ...aLink, idempotencyKey: key() }, anon);
  const ab2 = await p.booking.findUnique({ where: { id: ab.id }, include: { payments: { orderBy: { createdAt: 'asc' } }, refunds: { orderBy: { createdAt: 'asc' } } } });
  assert.deepEqual([ab2.status, ab2.refundedCents], ['refunded', total2]);
  assert.deepEqual(ab2.payments.map((x: any) => [x.paymentMethod, x.status]), [['credit_card', 'refunded'], ['gift_card', 'refunded']]);
  const legs = ab2.refunds.map((r: any) => [r.amount, r.providerRefundId.split(/[:_]/)[0]]);
  assert.deepEqual(legs, [[10000, 'giftcard'], [total2 - 10000, 're']], 'gift card leg first, bank card leg at Stripe');
  const c2 = await card(g1.id);
  assert.deepEqual([c2.balanceCents, c2.entries.at(-1).kind, c2.entries.at(-1).bookingRef], [10000, 'return', ab.bookingRef], 'value back on the gift card, not cash');

  // 5. Partial staff refund on a gift-card booking goes to the gift card only; the bank card is untouched.
  const b = await start(1, g1.code);
  const total1 = priced(6000);
  assert.deepEqual([b.s.giftCents, b.s.cardCents, b.s.clientSecret], [Math.min(10000, total1), Math.max(0, total1 - 10000), null]);
  const bDone: any = await finish(b.s, b.token);
  assert.equal(bDone.status, 'confirmed', 'fully paid by gift card, no Stripe');
  const bb = await p.booking.findUnique({ where: { bookingRef: b.s.bookingRef }, include: { payments: true } });
  assert.deepEqual(bb.payments.map((x: any) => [x.paymentMethod, x.isSplitPayment]), [['gift_card', false]]);
  assert.equal((await card(g1.id)).balanceCents, 10000 - total1);
  await refundBooking(null, { input: { bookingId: bb.id, amountCents: 1000, reason: 'Late start, partial goodwill' }, idempotencyKey: key() }, ops);
  assert.equal((await card(g1.id)).balanceCents, 10000 - total1 + 1000);
  assert.equal((await p.booking.findUnique({ where: { id: bb.id } })).status, 'partially_refunded');

  // 6. Balance spent elsewhere before payment finished: start with the card covering part, then another checkout spends it first.
  const g3: any = await issueGiftCard(null, { input: { amountCents: 5000, fundedBy: 'cash' }, idempotencyKey: key() }, ops);
  const slow = await start(2, g3.code);
  assert.equal(slow.s.giftCents, 5000);
  const fast = await start(1, g3.code);
  assert.equal(fast.s.giftCents, 5000);
  await confirm(fast.s.clientSecret); await finish(fast.s, fast.token);
  assert.equal((await card(g3.id)).balanceCents, 0);
  await confirm(slow.s.clientSecret);
  await assert.rejects(() => finish(slow.s, slow.token), /(no balance|balance changed).*card payment refunded/);
  const sb = await p.booking.findUnique({ where: { bookingRef: slow.s.bookingRef }, include: { payments: true, hold: true } });
  assert.deepEqual([sb.status, sb.seats, sb.hold.status, sb.payments.map((x: any) => [x.paymentMethod, x.status])], ['cancelled', 0, 'released', [['credit_card', 'refunded']]]);
  assert.equal((await card(g3.id)).entries.filter((e: any) => e.kind === 'redeem').length, 1, 'the card was debited once');

  // 7. Two checkouts racing for one card that covers both totals only once: exactly one gets it.
  const g4: any = await issueGiftCard(null, { input: { amountCents: total1, fundedBy: 'cash' }, idempotencyKey: key() }, ops);
  const r1 = await start(1, g4.code), r2 = await start(1, g4.code);
  assert.deepEqual([r1.s.clientSecret, r2.s.clientSecret], [null, null]);
  const race = await Promise.allSettled([finish(r1.s, r1.token), finish(r2.s, r2.token)]);
  assert.deepEqual(race.map(x => x.status).sort(), ['fulfilled', 'rejected']);
  assert.match(String((race.find(x => x.status === 'rejected') as any).reason?.message), /no balance|balance changed/);
  assert.equal((await card(g4.id)).balanceCents, 0);

  // 8. Void: the code stops working, the remaining balance is written off, a checkout with it is refused; refunds still return to it
  //    and are flagged for reissue.
  const vk = key();
  await assert.rejects(() => voidGiftCard(null, { input: { id: g1.id, reason: '' }, idempotencyKey: vk }, ops), /Reason/);
  const v: any = await voidGiftCard(null, { input: { id: g1.id, reason: 'Guest reported it lost' }, idempotencyKey: vk }, ops);
  assert.deepEqual([v.status, v.balanceCents], ['void', 0]);
  await assert.rejects(() => giftCardBalance(null, { code: g1.code }, anon), /Gift card not found/);
  await assert.rejects(() => start(1, g1.code), /Gift card not found/);
  await issueRefund(p, { bookingId: bb.id, amount: 500, reason: 'More goodwill', key: key(), actorId: u1.id });
  assert.equal(await p.auditEvent.count({ where: { action: 'giftcard.returned_to_unusable_card', targetId: g1.id } }), 1);
  const c8 = await card(g1.id);
  assert.equal(c8.balanceCents, c8.entries.reduce((n: number, e: any) => n + e.amountCents, 0), 'balance equals the ledger');

  // 9. The board: search by full code and by last 4, outstanding liability, desk staff refused.
  const board: any = await giftCardBoard(null, { search: g3.code }, ops);
  assert.deepEqual(board.cards.map((c: any) => c.id), [g3.id]);
  assert.ok((await giftCardBoard(null, { search: comp.last4 }, ops) as any).cards.some((c: any) => c.id === comp.id));
  assert.ok(board.outstandingCents >= 2500);
  await assert.rejects(() => giftCardBoard(null, {}, deskCtx), /Not authorized/);

  // Clean money: refund everything still captured on every fixture booking.
  for (const bk of await p.booking.findMany({ where: { departureId: dep.id } })) if (['confirmed', 'partially_refunded'].includes(bk.status) && bk.totalCents - bk.refundedCents > 0) await issueRefund(p, { bookingId: bk.id, amount: bk.totalCents - bk.refundedCents, reason: 'runtime cleanup', key: key(), actorId: u1.id, cancel: true });
  for (const id of intents) { const pi = await stripe.paymentIntents.retrieve(id); const refunded = (await stripe.refunds.list({ payment_intent: id })).data.filter(r => r.status === 'succeeded').reduce((n, r) => n + r.amount, 0); assert.equal(refunded, pi.amount_received, `${id} fully refunded`); }
  for (const c of await p.giftCard.findMany({ where: { issuedById: u1.id }, include: { entries: true } })) assert.equal(c.balanceCents, c.entries.reduce((n: number, e: any) => n + e.amountCents, 0), 'every card balance equals its ledger');
  console.log(`gift card runtime checks passed (${intents.length} Stripe test charges, all refunded)`);
}
main().then(() => p.$disconnect(), async (e) => { console.error(e); await p.$disconnect(); process.exit(1); });
