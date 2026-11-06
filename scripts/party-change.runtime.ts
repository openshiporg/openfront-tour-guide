// Scratch-DB + Stripe TEST proof of party-size / ticket changes with a price difference: guest adds a person and pays the difference by card
// (a second payment on the booking), guest removes people (refund under policy, newest payment first), staff add for cash, staff refund with
// the approval threshold, a split refund across two card payments on cancel, seats taken before payment (payment refunded), replays and audit.
// Every test charge ends refunded. Fixtures are depth-pc-*.
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { placeHold } from '../features/keystone/mutations/tour-catalog';
import { startBookingCheckout, completeBookingCheckout, createChannelBooking, issueRefund, requestRefundApproval, approveRefund } from '../features/keystone/mutations/tour-checkout';
import { manageToken, cancelManagedBooking, manageBooking } from '../features/keystone/mutations/tour-self-service';
import { partyChangeQuote, changeParty, completePartyChange, bookingParty, bookingPartyQuote, changeBookingParty } from '../features/keystone/mutations/tour-party-change';
const p: any = new PrismaClient(), tag = 'depth-pc-' + randomUUID().slice(0, 8), stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
assert.ok(process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_'), 'Stripe TEST key only');
const key = () => tag + randomUUID();
const intents: string[] = [];
async function confirm(clientSecret: string) {
  const id = clientSecret.split('_secret_')[0]; intents.push(id);
  const pi = await stripe.paymentIntents.confirm(id, { payment_method: 'pm_card_visa' });
  assert.equal(pi.status, 'succeeded');
}
async function main() {
  const role = await p.role.create({ data: { name: tag + 'ops', canAccessDashboard: true, canManageBookings: true, canIssueRefunds: true, canManagePayments: true } });
  const u1 = await p.user.create({ data: { name: tag + ' Ana', email: tag + 'a@test.example', password: 'disabled-runtime-fixture', roleId: role.id } });
  const u2 = await p.user.create({ data: { name: tag + ' Ben', email: tag + 'b@test.example', password: 'disabled-runtime-fixture', roleId: role.id } });
  const ops: any = { prisma: p, session: { itemId: u1.id, data: { role } } }, ops2: any = { prisma: p, session: { itemId: u2.id, data: { role } } }, anon: any = { prisma: p, session: undefined };
  const policy = await p.cancellationPolicy.create({ data: { name: tag + ' policy', rules: [{ hoursBefore: 48, refundBps: 10000 }, { hoursBefore: 12, refundBps: 5000 }, { hoursBefore: 0, refundBps: 0 }] } });
  const tour = await p.tour.create({ data: { name: tag, slug: tag, status: 'active', maxParticipants: 100, cancellationPolicyId: policy.id } });
  const adult = await p.ticketType.create({ data: { tourId: tour.id, name: 'Adult', priceCents: 6000, active: true, seatsUsed: 1, countsTowardCapacity: true } });
  const child = await p.ticketType.create({ data: { tourId: tour.id, name: 'Child', priceCents: 3000, active: true, seatsUsed: 1, countsTowardCapacity: true, maxAge: 12 } });
  const dep = async (hours: number, capacity = 10) => { const startAt = new Date(Date.now() + hours * 3600000); return p.departure.create({ data: { tourId: tour.id, departureKey: tag + hours + randomUUID(), startAt, endAt: new Date(+startAt + 3600000), capacity, status: 'on_sale', bookingCutoffMinutes: 60 } }); };
  // Channel allocations reserve seats on departures more than a day out, so the tight one is sized above them.
  const reserved = (await p.channel.findMany({ where: { active: true, allocation: { gt: 0 } } })).reduce((n: number, c: any) => n + c.allocation, 0);
  const dFar = await dep(120), dTight = await dep(130, reserved + 3), dNear = await dep(24);
  const online = async (d: any, qty: number) => {
    const token = randomUUID() + randomUUID();
    const h: any = await p.$transaction((tx: any) => placeHold(tx, { departureId: d.id, tickets: [{ id: adult.id, qty }], addOns: [], token } as any, null, key(), undefined, 15 * 60000), { timeout: 20000 });
    const s: any = await startBookingCheckout(null, { idempotencyKey: key(), input: { holdId: h.holdId, token, lead: { name: 'Party Guest', email: tag + randomUUID().slice(0, 4) + '@guest.example' }, participants: Array.from({ length: qty }, (_, i) => ({ ticketTypeId: adult.id, fullName: 'Adult ' + (i + 1), age: 30 })) } }, anon);
    await confirm(s.clientSecret);
    await completeBookingCheckout(null, { idempotencyKey: key(), input: { bookingRef: s.bookingRef, token } }, anon);
    const b = await p.booking.findUnique({ where: { bookingRef: s.bookingRef }, include: { participants: true } });
    return { b, link: { bookingRef: b.bookingRef, token: manageToken(b.id) } };
  };

  // 1. Guest adds a child: quote, pay the difference by card (2nd payment), applied only after payment. Kept adults keep their price.
  const g = await online(dFar, 2);
  assert.equal(g.b.totalCents, 12000);
  const keepAll = g.b.participants.map((x: any) => x.id);
  const addChild = { keep: keepAll, add: [{ ticketTypeId: child.id, fullName: 'Kid One', age: 8 }] };
  const q: any = await partyChangeQuote(null, { ...g.link, input: addChild }, anon);
  assert.deepEqual([q.collectCents, q.newTotalCents, q.seats, q.roomForAdded], [3000, 15000, 3, true]);
  await assert.rejects(() => partyChangeQuote(null, { ...g.link, token: 'x'.repeat(43), input: addChild }, anon), /Booking not found/);
  await assert.rejects(() => partyChangeQuote(null, { ...g.link, input: { keep: keepAll, add: [{ ticketTypeId: child.id, fullName: 'Too Old', age: 30 }] } }, anon), /age range/);
  const ck = key();
  const started: any = await changeParty(null, { ...g.link, input: addChild, idempotencyKey: ck }, anon);
  assert.equal(started.status, 'pending_payment'); assert.ok(started.clientSecret);
  const again: any = await changeParty(null, { ...g.link, input: addChild, idempotencyKey: ck }, anon);
  assert.equal(again.changeId, started.changeId, 'same key replays the same pending change');
  assert.equal(again.clientSecret, started.clientSecret, 'one PaymentIntent per change');
  await assert.rejects(() => completePartyChange(null, { ...g.link, changeId: started.changeId }, anon), /Payment not completed/);
  // Starting over (reload, changed mind) replaces the unpaid change: its intent is cancelled at Stripe and its held seat released.
  const first = await p.partyChange.findUnique({ where: { id: started.changeId } });
  const redo: any = await changeParty(null, { ...g.link, input: addChild, idempotencyKey: key() }, anon);
  assert.notEqual(redo.changeId, started.changeId);
  assert.equal((await p.partyChange.findUnique({ where: { id: started.changeId } })).status, 'cancelled');
  assert.equal((await p.inventoryHold.findUnique({ where: { id: first.holdId } })).status, 'released');
  assert.equal((await stripe.paymentIntents.retrieve(first.paymentIntentId)).status, 'canceled');
  await assert.rejects(() => completePartyChange(null, { ...g.link, changeId: started.changeId }, anon), /cancelled/);
  assert.equal((await p.booking.findUnique({ where: { id: g.b.id } })).seats, 2, 'nothing changes before payment');
  await confirm(redo.clientSecret);
  const done: any = await completePartyChange(null, { ...g.link, changeId: redo.changeId }, anon);
  assert.equal(done.status, 'applied');
  assert.equal(((await completePartyChange(null, { ...g.link, changeId: redo.changeId }, anon)) as any).status, 'applied', 'completing twice is safe');
  const gb = await p.booking.findUnique({ where: { id: g.b.id }, include: { payments: { orderBy: { createdAt: 'asc' } }, participants: true, lines: true } });
  assert.deepEqual([gb.seats, gb.totalCents, gb.payments.length, gb.payments.map((x: any) => x.amount), gb.participants.length], [3, 15000, 2, [12000, 3000], 3]);
  assert.deepEqual(gb.lines.filter((l: any) => l.kind === 'ticket').map((l: any) => [l.name, l.qty, l.unitPriceCents]).sort(), [['Adult', 2, 6000], ['Child', 1, 3000]]);
  assert.equal(await p.auditEvent.count({ where: { action: 'booking.party_changed', targetId: gb.id } }), 1);
  assert.equal((await p.inventoryHold.findUnique({ where: { id: (await p.partyChange.findUnique({ where: { id: redo.changeId } })).holdId } })).status, 'converted');

  // 2. Guest removes the child and one adult (5 days out: full refund of the difference) -> newest payment (the top-up) refunded first.
  const kid = gb.participants.find((x: any) => x.fullName === 'Kid One'), a2 = gb.participants.find((x: any) => x.fullName === 'Adult 2');
  const rmKey = key(), rmInput = { keep: gb.participants.filter((x: any) => x !== kid && x !== a2).map((x: any) => x.id) };
  const rm: any = await changeParty(null, { ...g.link, input: rmInput, idempotencyKey: rmKey }, anon);
  assert.equal(((await changeParty(null, { ...g.link, input: rmInput, idempotencyKey: rmKey }, anon)) as any).changeId, rm.changeId, 'guest retry replays');
  assert.deepEqual([rm.status, rm.refundCents, rm.keptCents, rm.refundStatus], ['applied', 9000, 0, 'succeeded']);
  const gb2 = await p.booking.findUnique({ where: { id: g.b.id }, include: { payments: { orderBy: { createdAt: 'asc' } }, refunds: true, participants: true } });
  assert.deepEqual([gb2.seats, gb2.totalCents, gb2.refundedCents, gb2.status, gb2.participants.length], [1, 6000, 0, 'confirmed', 1]);
  assert.deepEqual(gb2.payments.map((x: any) => [x.amount, x.refundedAmount, x.status]), [[12000, 6000, 'partially_refunded'], [3000, 3000, 'refunded']]);
  assert.equal(gb2.refunds.length, 2, 'one refund leg per payment');
  assert.equal((await p.participant.findUnique({ where: { id: kid.id } })).bookingId, null, 'removed people leave the booking, the row stays');
  for (const r of gb2.refunds) assert.ok(r.providerRefundId.startsWith('re_'), 'refunded at Stripe');
  // Cancelling now refunds what is left (6000) from the original card only.
  await cancelManagedBooking(null, { ...g.link, idempotencyKey: key() }, anon);
  const gb3 = await p.booking.findUnique({ where: { id: g.b.id }, include: { payments: { orderBy: { createdAt: 'asc' } } } });
  assert.deepEqual([gb3.status, gb3.refundedCents, gb3.payments.map((x: any) => x.status)], ['refunded', 6000, ['refunded', 'refunded']]);

  // 3. Inside 48h the guest gets half the removed amount back; the rest stays as a fee. Staff can still refund the rest.
  const n = await online(dNear, 2);
  const half: any = await changeParty(null, { ...n.link, input: { keep: [n.b.participants[0].id] }, idempotencyKey: key() }, anon);
  assert.deepEqual([half.refundCents, half.keptCents], [3000, 3000]);
  const nb = await p.booking.findUnique({ where: { id: n.b.id } });
  assert.deepEqual([nb.totalCents, nb.feeCents, nb.seats], [9000, 3000, 1]);
  assert.match((await manageBooking(null, n.link, anon) as any).policy[0], /Full refund up to 2 days/);

  // 4. Seats taken before the guest pays: the hold lapses, someone else takes the last seat, payment arrives -> refunded, booking unchanged.
  const t = await online(dTight, 2);
  const tk: any = await changeParty(null, { ...t.link, input: { keep: t.b.participants.map((x: any) => x.id), add: [{ ticketTypeId: adult.id, fullName: 'Late Adult', age: 40 }] }, idempotencyKey: key() }, anon);
  const pc = await p.partyChange.findUnique({ where: { id: tk.changeId } });
  await p.inventoryHold.update({ where: { id: pc.holdId }, data: { expiresAt: new Date(Date.now() - 1000) } });
  await createChannelBooking(null, { idempotencyKey: key(), input: { departureId: dTight.id, source: 'phone', paymentMethod: 'cash', tickets: [{ id: adult.id, qty: 1 }], lead: { name: 'Walk Up', email: tag + 'w@guest.example' }, participants: [{ ticketTypeId: adult.id, fullName: 'Walk Up', age: 30 }] } }, ops);
  await confirm(tk.clientSecret);
  await assert.rejects(() => completePartyChange(null, { ...t.link, changeId: tk.changeId }, anon), /payment for the change was refunded/);
  const tb = await p.booking.findUnique({ where: { id: t.b.id }, include: { payments: { orderBy: { createdAt: 'asc' } } } });
  assert.deepEqual([tb.seats, tb.totalCents, tb.refundedCents, tb.status], [2, 12000, 0, 'confirmed']);
  assert.deepEqual(tb.payments.map((x: any) => [x.amount, x.status]), [[12000, 'succeeded'], [6000, 'refunded']]);
  assert.equal((await p.partyChange.findUnique({ where: { id: tk.changeId } })).status, 'failed');

  // 5. Staff add a person for cash; reason required; view + quote; replay by key.
  const s = await online(dFar, 1);
  const party: any = await bookingParty(null, { bookingId: s.b.id }, ops);
  assert.equal(party.canChange, true); assert.equal(party.participants.length, 1);
  const sAdd = { keep: [s.b.participants[0].id], add: [{ ticketTypeId: adult.id, fullName: 'Phone Add', age: 50 }] };
  assert.equal(((await bookingPartyQuote(null, { bookingId: s.b.id, input: sAdd }, ops)) as any).collectCents, 6000);
  await assert.rejects(() => changeBookingParty(null, { input: { bookingId: s.b.id, ...sAdd, reason: ' ' }, idempotencyKey: key() }, ops), /reason is required/);
  const sk = key();
  const t1 = Date.now();
  const staffAdd: any = await changeBookingParty(null, { input: { bookingId: s.b.id, ...sAdd, reason: 'Guest called to add a friend, paid cash at desk' }, idempotencyKey: sk }, ops);
  console.log('staff add ms', Date.now() - t1);
  const replay: any = await changeBookingParty(null, { input: { bookingId: s.b.id, ...sAdd, reason: 'Guest called to add a friend, paid cash at desk' }, idempotencyKey: sk }, ops);
  assert.equal(replay.changeId, staffAdd.changeId);
  const sb = await p.booking.findUnique({ where: { id: s.b.id }, include: { payments: { orderBy: { createdAt: 'asc' } }, participants: true } });
  assert.deepEqual([sb.seats, sb.totalCents, sb.payments.map((x: any) => x.paymentMethod)], [2, 12000, ['credit_card', 'cash']]);
  // 6. Staff remove two people over a 50.00 threshold: refused without approval, then approved by a second manager and consumed.
  const settings = await p.storeSettings.findFirst();
  const oldThreshold = settings?.refundApprovalThresholdCents;
  if (settings) await p.storeSettings.update({ where: { id: settings.id }, data: { refundApprovalThresholdCents: 5000 } });
  try {
    const keepOne = { keep: [sb.participants.find((x: any) => x.fullName === 'Adult 1').id] };
    const reason = 'Two guests ill, refund in full';
    assert.equal(((await bookingPartyQuote(null, { bookingId: s.b.id, input: keepOne }, ops)) as any).needsApproval, true);
    await assert.rejects(() => changeBookingParty(null, { input: { bookingId: s.b.id, ...keepOne, reason }, idempotencyKey: key() }, ops), /over the approval threshold/);
    assert.equal((await p.booking.findUnique({ where: { id: s.b.id } })).seats, 2, 'refused change writes nothing');
    const ap: any = await requestRefundApproval(null, { bookingId: s.b.id, reason, amount: 6000 }, ops);
    await approveRefund(null, { approvalId: ap.id }, ops2);
    const t0 = Date.now(), cutKey = key();
    const cut: any = await changeBookingParty(null, { input: { bookingId: s.b.id, ...keepOne, reason }, idempotencyKey: cutKey }, ops);
    console.log('staff refund change ms', Date.now() - t0);
    const cutAgain: any = await changeBookingParty(null, { input: { bookingId: s.b.id, ...keepOne, reason }, idempotencyKey: cutKey }, ops);
    assert.deepEqual([cutAgain.changeId, cutAgain.replay, cutAgain.refundCents], [cut.changeId, true, 6000], 'a retry after a timeout replays the committed change');
    assert.deepEqual([cut.refundCents, cut.refundStatus], [6000, 'succeeded']);
    assert.equal((await p.managerApproval.findUnique({ where: { id: ap.id } })).status, 'consumed');
    // Newest payment first: the cash top-up is returned by hand (manual), the card is untouched.
    const sb2 = await p.booking.findUnique({ where: { id: s.b.id }, include: { payments: { orderBy: { createdAt: 'asc' } }, refunds: true } });
    assert.deepEqual(sb2.payments.map((x: any) => [x.paymentMethod, x.status]), [['credit_card', 'succeeded'], ['cash', 'refunded']]);
    assert.ok(sb2.refunds[0].providerRefundId.startsWith('manual:'));
  } finally { if (settings) await p.storeSettings.update({ where: { id: settings.id }, data: { refundApprovalThresholdCents: oldThreshold } }); }
  // 7. Refusals: a reseller-free guard (started departure), nothing to change, checked-in guest removal.
  await assert.rejects(() => changeBookingParty(null, { input: { bookingId: s.b.id, keep: [sb.participants.find((x: any) => x.fullName === 'Adult 1').id], reason: 'x' }, idempotencyKey: key() }, ops), /Nothing to change/);
  await p.participant.update({ where: { id: sb.participants.find((x: any) => x.fullName === 'Adult 1').id }, data: { checkInStatus: 'checked_in' } });
  await assert.rejects(() => bookingPartyQuote(null, { bookingId: s.b.id, input: { keep: [], add: [{ ticketTypeId: adult.id, fullName: 'X', age: 30 }] } }, ops), /checked-in guest/);
  await assert.rejects(() => bookingParty(null, { bookingId: s.b.id }, anon), /Not authorized/);

  // Clean money: refund everything still captured on every fixture booking (Stripe test).
  for (const b of [n.b, t.b, s.b]) {
    const live = await p.booking.findUnique({ where: { id: b.id } });
    if (live.totalCents - live.refundedCents > 0) await issueRefund(p, { bookingId: live.id, amount: live.totalCents - live.refundedCents, reason: 'runtime cleanup', key: key(), actorId: u1.id, cancel: true });
  }
  for (const id of intents) { const pi = await stripe.paymentIntents.retrieve(id); const refunded = (await stripe.refunds.list({ payment_intent: id })).data.filter(r => r.status === 'succeeded').reduce((n, r) => n + r.amount, 0); assert.equal(refunded, pi.amount_received, `${id} fully refunded`); }
  console.log(`party change runtime checks passed (${intents.length} Stripe test charges, all refunded)`);
}
main().then(() => p.$disconnect(), async (e) => { console.error(e); await p.$disconnect(); process.exit(1); });
