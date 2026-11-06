// Scratch-DB proof of offline check-in sync: a guide's queued taps apply in tap order under the departure lock, a resent tap
// (same tap key, new batch key) never applies twice, a resent batch replays, and changes made meanwhile on another device or by
// the office turn into readable conflicts instead of overwriting (no show elsewhere, cancelled, moved, removed from the party).
// Also: guide scope (unassigned departure refused), no permission refused, batch validation. Fixtures are depth-*.
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { createChannelBooking } from '../features/keystone/mutations/tour-checkout';
import { syncOfflineCheckIns, markNoShow, checkInParticipant } from '../features/keystone/mutations/tour-operations';
const p: any = new PrismaClient(), tag = 'depth-' + randomUUID().slice(0, 8);
const key = () => tag + randomUUID();
const tapKey = () => randomUUID().replaceAll('-', '');
async function main() {
  const opsRole = await p.role.create({ data: { name: tag + 'ops', canManageBookings: true, canManagePayments: true, canCheckIn: true } });
  const guideRole = await p.role.create({ data: { name: tag + 'guide', canCheckIn: true } });
  const noneRole = await p.role.create({ data: { name: tag + 'none', canAccessDashboard: true } });
  const mk = async (r: any, s: string) => { const user = await p.user.create({ data: { name: tag + s, email: tag + s + '@test.example', password: 'disabled-runtime-fixture', roleId: r.id } }); return { user, ctx: { prisma: p, session: { itemId: user.id, data: { role: r } } } as any }; };
  const ops = await mk(opsRole, 'ops'), g = await mk(guideRole, 'g'), none = await mk(noneRole, 'n');
  const guide = await p.guide.create({ data: { name: tag + ' Guide', userId: g.user.id, status: 'active' } });
  const tour = await p.tour.create({ data: { name: tag, slug: tag, status: 'active', maxParticipants: 100 } });
  const tk = await p.ticketType.create({ data: { tourId: tour.id, name: 'Adult', priceCents: 4000, active: true, seatsUsed: 1, countsTowardCapacity: true } });
  const dep = (hours: number) => { const startAt = new Date(Date.now() + hours * 3600000); return p.departure.create({ data: { tourId: tour.id, departureKey: tag + hours + randomUUID(), startAt, endAt: new Date(+startAt + 3600000), capacity: 20, status: 'on_sale', bookingCutoffMinutes: 60 } }); };
  const d = await dep(30), dOther = await dep(54), dNot = await dep(78);
  await p.guideAssignment.create({ data: { departureId: d.id, guideId: guide.id, role: 'lead', status: 'accepted' } });
  const book = async (departure: any, qty: number) => {
    const r: any = await createChannelBooking(null, { idempotencyKey: key(), input: { departureId: departure.id, source: 'phone', paymentMethod: 'cash', tickets: [{ id: tk.id, qty }], lead: { name: 'Offline Guest', email: tag + randomUUID().slice(0, 4) + '@guest.example' }, participants: Array.from({ length: qty }, (_, i) => ({ ticketTypeId: tk.id, fullName: 'Guest ' + i, age: 30 })) } }, ops.ctx);
    return p.booking.findUnique({ where: { bookingRef: r.bookingRef }, include: { participants: { orderBy: { fullName: 'asc' } } } });
  };
  const sync = (events: any[], k = key(), ctx = g.ctx, departureId = d.id) => syncOfflineCheckIns(null, { input: { departureId, events }, idempotencyKey: k }, ctx);
  const t = (kind: 'check_in' | 'no_show', id: string, minutesAgo: number) => ({ key: tapKey(), kind, ...(kind === 'check_in' ? { participantId: id } : { bookingId: id }), recordedAt: new Date(Date.now() - minutesAgo * 60000).toISOString() });

  const a = await book(d, 2), b = await book(d, 1), c = await book(d, 1), e = await book(d, 1), f = await book(d, 2), h = await book(d, 1);
  const elsewhere = await book(dNot, 1);

  // Refusals: no permission, departure not on the guide's schedule, bad batches.
  await assert.rejects(() => sync([t('check_in', a.participants[0].id, 5)], key(), none.ctx), /Not authorized/);
  await assert.rejects(() => sync([t('check_in', elsewhere.participants[0].id, 5)], key(), g.ctx, dNot.id), /not on your schedule/);
  await assert.rejects(() => sync([]), /Nothing to sync/);
  const dupe = t('check_in', a.participants[0].id, 5); await assert.rejects(() => sync([dupe, dupe]), /twice/);

  // Meanwhile (while the guide had no signal): office marks C no show, cancels E, moves F's party member off, checks in H on another device.
  await markNoShow(null, { input: { bookingId: c.id }, idempotencyKey: key() }, ops.ctx);
  await p.booking.update({ where: { id: e.id }, data: { status: 'cancelled' } });
  await p.participant.update({ where: { id: f.participants[1].id }, data: { bookingId: null } });
  await checkInParticipant(null, { input: { participantId: h.participants[0].id }, idempotencyKey: key() }, ops.ctx);

  const taps = [
    t('check_in', a.participants[1].id, 9), t('check_in', a.participants[0].id, 10), // whole party A, out of order
    t('check_in', b.participants[0].id, 8), t('no_show', b.id, 2),                    // B checked in, later no-show tap refused
    t('check_in', c.participants[0].id, 7),                                            // C was no-showed by the office
    t('check_in', e.participants[0].id, 6),                                            // E cancelled
    t('check_in', f.participants[1].id, 5), t('check_in', f.participants[0].id, 4),   // F's removed member, then the one still there
    t('check_in', h.participants[0].id, 3),                                            // H already in from another device
    t('check_in', elsewhere.participants[0].id, 1),                                    // a guest on another departure
  ];
  const k1 = key();
  const r: any = await sync(taps, k1);
  const out = Object.fromEntries(r.results.map((x: any) => [x.key, x]));
  const o = (i: number) => out[taps[i].key].outcome;
  assert.deepEqual(taps.map((_, i) => o(i)), ['applied', 'applied', 'applied', 'conflict', 'conflict', 'conflict', 'conflict', 'applied', 'already', 'conflict']);
  assert.equal(r.applied, 4); assert.equal(r.conflicts, 5);
  assert.match(out[taps[3].key].reason, /was checked in/); assert.match(out[taps[4].key].reason, /no show on another device/);
  assert.match(out[taps[5].key].reason, /cancelled/); assert.match(out[taps[6].key].reason, /no longer on this departure/);
  const st = async (id: string) => (await p.booking.findUnique({ where: { id }, include: { participants: true } }));
  const [A, B, C, E, F] = await Promise.all([st(a.id), st(b.id), st(c.id), st(e.id), st(f.id)]);
  assert.equal(A.status, 'checked_in'); assert.ok(A.participants.every((x: any) => x.checkInStatus === 'checked_in'));
  assert.equal(B.status, 'checked_in'); assert.equal(C.status, 'no_show'); assert.equal(E.status, 'cancelled');
  assert.equal(F.status, 'checked_in', 'the remaining member completes the party');
  assert.equal((await p.participant.findUnique({ where: { id: elsewhere.participants[0].id } })).checkInStatus, 'pending');

  // Every tap left exactly one audit row with the device time and the decision.
  const rows = await p.auditEvent.findMany({ where: { requestId: { in: taps.map((x) => `offline:${g.user.id}:${x.key}`) } } });
  assert.equal(rows.length, taps.length);
  assert.ok(rows.every((x: any) => x.actorId === g.user.id && x.after.offline === true && x.after.recordedAt && x.after.syncedAt));
  assert.equal(rows.filter((x: any) => x.action === 'checkin.offline_conflict').length, 5);

  // Resent batch (same key) replays; resent taps in a new batch (lost answer) are reported, not reapplied or re-audited.
  const again: any = await sync(taps, k1); assert.deepEqual(again, r);
  const resent: any = await sync([taps[0], taps[3]], key());
  assert.deepEqual(resent.results.map((x: any) => [x.outcome, x.replay]), [['applied', true], ['conflict', true]]);
  assert.equal(resent.applied, 0, 'nothing applied twice');
  assert.equal(await p.auditEvent.count({ where: { requestId: { startsWith: `offline:${g.user.id}:` } } }), taps.length);

  // A no show tapped offline before anyone arrived applies, and blocks a later queued check-in in the same booking.
  const n = await book(d, 1);
  const r2: any = await sync([t('no_show', n.id, 6), t('check_in', n.participants[0].id, 2)]);
  assert.deepEqual(r2.results.map((x: any) => x.outcome), ['applied', 'conflict']);
  assert.equal((await st(n.id)).status, 'no_show');

  // A guide's device clock running a day fast is clamped to the sync time.
  const late = await book(d, 1), fut = { ...t('check_in', late.participants[0].id, 0), recordedAt: new Date(Date.now() + 86400000).toISOString() };
  await sync([fut]);
  const fa = await p.auditEvent.findFirst({ where: { requestId: `offline:${g.user.id}:${fut.key}` } });
  assert.ok(new Date(fa.after.recordedAt).getTime() <= Date.now() + 1000);

  // Two devices sync overlapping taps at once: each guest is checked in once.
  const z = await book(d, 2);
  const zt = [t('check_in', z.participants[0].id, 3), t('check_in', z.participants[1].id, 2)];
  const both = await Promise.all([sync(zt), sync([t('check_in', z.participants[0].id, 1)], key(), ops.ctx)]);
  const applied = both.reduce((s: number, x: any) => s + x.applied, 0);
  assert.equal(applied, 2, 'two guests, two check-ins, whatever the interleaving');
  assert.equal((await st(z.id)).status, 'checked_in');
  console.log('PASS offline-checkin: refusals (permission, guide scope, batch), tap-order apply, conflicts (no show elsewhere, cancelled, moved, other departure, no-show after check-in), duplicates, audit per tap, batch replay, resent taps not reapplied, clock clamp, concurrent devices');
  await p.$disconnect();
}
main().catch(async e => { console.error(e); await p.$disconnect(); process.exit(1); });
