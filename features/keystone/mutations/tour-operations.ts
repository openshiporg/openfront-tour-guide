import { authorize, command, audit, departureOccupancy, lockTransactionKey } from '../lib/tour-command';
import { assertDepartureAccess } from '../lib/tour-scope';
import { peakConcurrentResourceUnits } from '../lib/resourceCapacity';
import { expandSchedule, departureData } from '../lib/tour-schedule';
import { settlement } from '../lib/tour-money';
import { promoteWaitlist } from './tour-waitlist';
import { decide, recordedTime, validateBatch, type OfflineEvent } from '../lib/tour-offline-checkin';

export async function generateDepartures(_r: any, args: any, context: any) {
  await authorize(context, 'canManageDepartures');
  return command(context, args.idempotencyKey, 'generateDepartures', args.input, ['schedule-generation'], async tx => {
    const schedules = await tx.schedule.findMany({ where: args.input?.tourId ? { tourId: args.input.tourId } : {}, include: { tour: true }, take: 100 });
    const created = [];
    const now = new Date(), horizon = new Date(now.getTime() + Math.min(60, args.input?.days || 60) * 86400000);
    for (const schedule of schedules) {
      if (schedule.tour.status !== 'active') continue;
      for (const startAt of expandSchedule(schedule, schedule.tour, now, horizon)) {
        const departureKey = `${schedule.tourId}:${startAt.toISOString()}`;
        if (await tx.departure.findUnique({ where: { departureKey } })) continue;
        const d = await tx.departure.create({ data: departureData(schedule, schedule.tour, startAt, departureKey) });
        created.push(d.id);
      }
    }
    await audit(tx, context.session.itemId, 'departures.generated', 'Schedule', args.input?.tourId || 'all', null, { count: created.length });
    return { created: created.length, ids: created };
  });
}
export async function assignGuide(_r: any, args: any, context: any) {
  await authorize(context, 'canManageGuides'); const i = args.input;
  return command(context, args.idempotencyKey, 'assignGuide', i, [`departure:${i.departureId}`, `guide:${i.guideId}`], async tx => {
    const departure = await tx.departure.findUnique({ where: { id: i.departureId }, include: { tour: true } });
    const guide = await tx.guide.findUnique({ where: { id: i.guideId }, include: { certifications: true, availability: true } });
    if (!departure || !guide || guide.status !== 'active') throw new Error('Guide or departure unavailable');
    if (['completed','cancelled','weather_cancelled'].includes(departure.status)) throw new Error('Departure is closed');
    for (const name of departure.tour.requiredCertifications as string[] || []) if (!guide.certifications.some((c: any) => c.name === name && (!c.expiresAt || c.expiresAt > departure.endAt))) throw new Error(`Valid ${name} certification required`);
    const conflict = await tx.guideAssignment.findFirst({ where: { guideId: guide.id, departureId: { not: departure.id }, status: { in: ['accepted','worked'] }, departure: { startAt: { lt: departure.endAt }, endAt: { gt: departure.startAt }, status: { notIn: ['cancelled','weather_cancelled'] } } } });
    if (conflict) throw new Error('Guide has an overlapping accepted assignment');
    for (const availability of guide.availability) {
      for (const block of availability.unavailable as any[] || []) if (new Date(block.startAt) < departure.endAt && new Date(block.endAt) > departure.startAt) throw new Error('Guide is unavailable');
    }
    const existing = await tx.guideAssignment.findFirst({ where: { guideId: guide.id, departureId: departure.id, status: { notIn: ['declined','cancelled'] } } });
    if (existing) return existing;
    const assignment = await tx.guideAssignment.create({ data: { guideId: guide.id, departureId: departure.id, role: i.role || 'lead', status: 'offered', payCents: guide.payRateType === 'hourly' ? Math.round(guide.payRateCents * (departure.endAt - departure.startAt) / 3600000) : guide.payRateCents } });
    await audit(tx, context.session.itemId, 'guide.offered', 'GuideAssignment', assignment.id, null, assignment); return assignment;
  });
}
export async function respondToAssignment(_r: any, args: any, context: any) {
  if (!context.session?.itemId) throw new Error('Not authorized');
  const i = args.input; const assignment = await context.prisma.guideAssignment.findUnique({ where: { id: i.assignmentId }, include: { guide: true } });
  if (!assignment || assignment.guide?.userId !== context.session.itemId) await authorize(context, 'canManageGuides');
  if (!assignment) throw new Error('Assignment not found');
  return command(context, args.idempotencyKey, 'respondToAssignment', i, [`departure:${assignment.departureId}`, `guide:${assignment.guideId}`], async tx => {
    const a = await tx.guideAssignment.findUnique({ where: { id: assignment.id }, include: { departure: { include: { tour: true } }, guide: { include: { certifications: true } } } });
    if (a.status !== 'offered' || !['accepted','declined'].includes(i.status)) throw new Error('Invalid assignment transition');
    if (i.status === 'accepted') {
      const conflict = await tx.guideAssignment.findFirst({ where: { guideId: a.guideId, id: { not: a.id }, status: { in: ['accepted','worked'] }, departure: { startAt: { lt: a.departure.endAt }, endAt: { gt: a.departure.startAt }, status: { notIn: ['cancelled','weather_cancelled'] } } } });
      if (conflict) throw new Error('Guide has an overlapping assignment');
      for (const name of a.departure.tour.requiredCertifications as string[] || []) if (!a.guide.certifications.some((c: any) => c.name === name && (!c.expiresAt || c.expiresAt > a.departure.endAt))) throw new Error(`Valid ${name} certification required (expired or missing by the end of this departure)`);
    }
    const result = await tx.guideAssignment.updateMany({ where: { id: a.id, status: 'offered' }, data: { status: i.status } });
    if (result.count !== 1) throw new Error('Assignment changed concurrently');
    await audit(tx, context.session.itemId, 'guide.responded', 'GuideAssignment', a.id, { status: 'offered' }, { status: i.status }); return { id: a.id, status: i.status };
  });
}
export async function assignResource(_r: any, args: any, context: any) {
  await authorize(context, 'canManageResources'); const i = args.input;
  return command(context, args.idempotencyKey, 'assignResource', i, [`departure:${i.departureId}`, `resource:${i.resourceId}`], async tx => {
    const o = await departureOccupancy(tx, i.departureId); const d = o.departure;
    const resource = await tx.resource.findUnique({ where: { id: i.resourceId } });
    if (!resource || resource.status !== 'active' || resource.kind !== d.tour.requiresResourceKind) throw new Error('Resource does not satisfy this tour');
    if (!Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > resource.quantity) throw new Error('Invalid resource quantity');
    const assignments = await tx.resourceAssignment.findMany({ where: { resourceId: resource.id, departureId: { not: d.id }, departure: { startAt: { lt: d.endAt }, endAt: { gt: d.startAt }, status: { notIn: ['cancelled','weather_cancelled'] } } }, include: { departure: true } });
    const peak = peakConcurrentResourceUnits([...assignments.map((a: any) => ({ units: a.quantity, startsAt: a.departure.startAt, endsAt: a.departure.endAt })), { units: i.quantity, startsAt: d.startAt, endsAt: d.endAt }]);
    if (peak === null || peak > resource.quantity) throw new Error('Resource pool overlaps another departure');
    const capacity = Math.min(d.tour.maxParticipants, resource.seats * i.quantity);
    if (capacity < o.booked + o.held + o.allocated) throw new Error('Resource seats below active reservations');
    // A departure uses one pool/vehicle assignment. Replace under the same departure lock.
    await tx.resourceAssignment.deleteMany({ where: { departureId: d.id } });
    const result = await tx.resourceAssignment.create({ data: { departureId: d.id, resourceId: resource.id, quantity: i.quantity } });
    await tx.departure.update({ where: { id: d.id }, data: { capacity } });
    await audit(tx, context.session.itemId, 'resource.assigned', 'Departure', d.id, { capacity: d.capacity }, { capacity, resourceId: resource.id }); return result;
  });
}
export async function unassignResource(_r: any, args: any, context: any) {
  await authorize(context, 'canManageResources'); const i = args.input;
  return command(context, args.idempotencyKey, 'unassignResource', i, [`departure:${i.departureId}`], async tx => {
    const d = await tx.departure.findUnique({ where: { id: i.departureId }, select: { id: true, status: true, capacity: true, endAt: true } });
    if (!d) throw new Error('Departure not found');
    if (['completed', 'cancelled', 'weather_cancelled'].includes(d.status)) throw new Error('This departure is finished; its resources are kept for the record');
    const removed = await tx.resourceAssignment.deleteMany({ where: { departureId: d.id } });
    if (!removed.count) throw new Error('No resource is assigned to this departure');
    // Capacity is left as it was: shrinking it is a separate, explicit Resize (it cannot go below reservations).
    await audit(tx, context.session.itemId, 'resource.unassigned', 'Departure', d.id, { assignments: removed.count }, null);
    return { id: d.id, removed: removed.count };
  });
}
export async function resizeDeparture(_r: any, args: any, context: any) {
  await authorize(context, 'canManageDepartures'); const i = args.input;
  return command(context, args.idempotencyKey, 'resizeDeparture', i, [`departure:${i.departureId}`], async tx => {
    const o = await departureOccupancy(tx, i.departureId);
    if (!Number.isInteger(i.capacity) || i.capacity < 1 || i.capacity > o.departure.tour.maxParticipants || i.capacity < o.booked + o.held + o.allocated) throw new Error('Capacity must cover reservations and stay within tour maximum');
    const assignments = await tx.resourceAssignment.findMany({ where: { departureId: i.departureId }, include: { resource: true } });
    if (assignments.length && i.capacity > assignments.reduce((n: number,a: any) => n + a.quantity * a.resource.seats,0)) throw new Error('Capacity exceeds resource seats');
    const result = await tx.departure.update({ where: { id: i.departureId }, data: { capacity: i.capacity } });
    await audit(tx, context.session.itemId, 'departure.resized', 'Departure', i.departureId, { capacity: o.departure.capacity }, { capacity: i.capacity });
    // Added seats go to the waitlist first (Gym classCapacity rule).
    if (i.capacity > o.departure.capacity) await promoteWaitlist(tx, i.departureId, context.session.itemId);
    return result;
  });
}
export async function checkInParticipant(_r: any, args: any, context: any) {
  const actor = await authorize(context, 'canCheckIn'); const i = args.input;
  const participant = await context.prisma.participant.findUnique({ where: { id: i.participantId }, include: { booking: true } });
  if (!participant) throw new Error('Participant not found');
  await assertDepartureAccess(context.prisma, actor, participant.booking.departureId);
  return command(context, args.idempotencyKey, 'checkInParticipant', i, [`departure:${participant.booking.departureId}`], async tx => {
    const p = await tx.participant.findUnique({ where: { id: participant.id }, include: { booking: true } });
    if (!['confirmed','checked_in'].includes(p.booking.status)) throw new Error('Booking is not confirmed');
    await tx.participant.update({ where: { id: p.id }, data: { checkInStatus: 'checked_in' } });
    const pending = await tx.participant.count({ where: { bookingId: p.bookingId, checkInStatus: { not: 'checked_in' } } });
    if (!pending) await tx.booking.updateMany({ where: { id: p.bookingId, status: 'confirmed' }, data: { status: 'checked_in' } });
    await audit(tx, context.session.itemId, 'participant.checked_in', 'Participant', p.id, { status: p.checkInStatus }, { status: 'checked_in' });
    return { id: p.id, waiverWarning: p.waiverStatus === 'required' };
  });
}
export async function markNoShow(_r: any, args: any, context: any) {
  const actor = await authorize(context, 'canCheckIn'); const i = args.input;
  const booking = await context.prisma.booking.findUnique({ where: { id: i.bookingId } });
  if (!booking) throw new Error('Booking not found');
  await assertDepartureAccess(context.prisma, actor, booking.departureId);
  return command(context, args.idempotencyKey, 'markNoShow', i, [`departure:${booking.departureId}`], async tx => {
    const change = await tx.booking.updateMany({ where: { id: booking.id, status: 'confirmed' }, data: { status: 'no_show' } });
    if (change.count !== 1) throw new Error('Only confirmed bookings can be marked no show');
    await tx.participant.updateMany({ where: { bookingId: booking.id, checkInStatus: 'pending' }, data: { checkInStatus: 'no_show' } });
    await audit(tx, context.session.itemId, 'booking.no_show', 'Booking', booking.id, { status: 'confirmed' }, { status: 'no_show' }); return { id: booking.id };
  });
}
export async function closeDeparture(_r: any, args: any, context: any) {
  await authorize(context, 'canManageDepartures'); const i = args.input;
  return command(context, args.idempotencyKey, 'closeDeparture', i, [`departure:${i.departureId}`], async tx => {
    const d = await tx.departure.findUnique({ where: { id: i.departureId }, include: { assignedGuides: true } });
    if (!d || !['closed','in_progress'].includes(d.status) || d.endAt > new Date()) throw new Error('Only an ended closed/in-progress departure can complete');
    await tx.departure.update({ where: { id: d.id }, data: { status: 'completed' } });
    // A booking completes only with nothing owed: captured payments cover the net total, or the channel collects.
    const toComplete = await tx.booking.findMany({ where: { departureId: d.id, status: 'checked_in' }, include: { channel: true, payments: { where: { status: { in: ['succeeded', 'partially_refunded', 'refunded'] } } } } });
    for (const b of toComplete) {
      const paid = b.payments.reduce((n: number, p: any) => n + p.amount - (p.refundedAmount || 0), 0);
      if (b.channel?.paymentModel === 'channel_collects' || paid >= b.totalCents - b.refundedCents) await tx.booking.update({ where: { id: b.id }, data: { status: 'completed' } });
    }
    for (const a of d.assignedGuides.filter((a: any) => a.status === 'accepted')) {
      const payout = await tx.guidePayout.create({ data: { guideId: a.guideId, periodStart: d.startAt, periodEnd: d.endAt, totalCents: a.payCents, status: 'draft' } });
      await tx.guideAssignment.update({ where: { id: a.id }, data: { status: 'worked', payoutId: payout.id } });
    }
    await audit(tx, context.session.itemId, 'departure.completed', 'Departure', d.id, { status: d.status }, { status: 'completed' }); return { id: d.id };
  });
}
export async function generateChannelStatement(_r: any, args: any, context: any) {
  await authorize(context, 'canManageChannels'); const i = args.input;
  return command(context, args.idempotencyKey, 'generateChannelStatement', i, [`channel:${i.channelId}`], async tx => {
    const from = new Date(i.from), to = new Date(i.to); if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from) throw new Error('Invalid statement period');
    const channel = await tx.channel.findUnique({ where: { id: i.channelId } }); if (!channel) throw new Error('Channel not found');
    const where = { channelId: channel.id, statementId: null, createdAt: { gte: from, lt: to }, status: { in: ['confirmed','completed','checked_in','no_show','partially_refunded','cancelled'] } };
    const candidates = await tx.booking.findMany({ where, select: { departureId: true } });
    for (const id of [...new Set<string>(candidates.map((b: any) => b.departureId))].sort()) await lockTransactionKey(tx, `departure:${id}`);
    const bookings = await tx.booking.findMany({ where });
    if (!bookings.length) throw new Error('No unstatemented bookings in this period');
    if (bookings.some((b: any) => b.currencyCode !== 'USD')) throw new Error('Mixed or unsupported statement currency');
    const grossCents = bookings.reduce((n: number,b: any) => n + b.totalCents - b.refundedCents,0);
    const commissionCents = bookings.reduce((n: number,b: any) => n + settlement(b.totalCents - b.refundedCents, b.totalCents ? Math.round(b.channelCommissionCents * 10000 / b.totalCents) : 0).commissionCents,0);
    const statement = await tx.channelStatement.create({ data: { statementKey: `${channel.id}:${from.toISOString()}:${to.toISOString()}`, channelId: channel.id, periodStart: from, periodEnd: to, grossCents, commissionCents, netDueCents: channel.paymentModel === 'channel_collects' ? grossCents - commissionCents : -commissionCents, status: 'open' } });
    await tx.booking.updateMany({ where: { id: { in: bookings.map((b: any) => b.id) } }, data: { statementId: statement.id } });
    await audit(tx, context.session.itemId, 'channel.statement_created', 'ChannelStatement', statement.id, null, { grossCents, commissionCents }); return statement;
  });
}

// Offline check-in sync. A guide's device queues taps with no signal and replays them here in one batch. Each tap is decided
// against the booking as it is NOW, in tap order, under the same departure lock as live check-in. Every tap leaves one audit row
// (requestId offline:<actor>:<key>) holding its outcome, so a resent tap returns what happened the first time and never applies twice.
export async function syncOfflineCheckIns(_r: any, args: any, context: any) {
  const actor = await authorize(context, 'canCheckIn'); const i = args.input || {};
  const departureId = String(i.departureId || ''), events: OfflineEvent[] = i.events || [];
  const bad = validateBatch(events); if (bad) throw new Error(bad);
  await assertDepartureAccess(context.prisma, actor, departureId);
  const rid = (k: string) => `offline:${actor.id}:${k}`;
  return command(context, args.idempotencyKey, 'syncOfflineCheckIns', { departureId, keys: events.map((e) => e.key) }, [`departure:${departureId}`], async tx => {
    const now = new Date();
    const prior = await tx.auditEvent.findMany({ where: { requestId: { in: events.map((e) => rid(e.key)) } }, select: { requestId: true, after: true } });
    const stored = new Map(prior.map((a: any) => [a.requestId, a.after?.decision]));
    const fresh = events.filter((e) => !stored.has(rid(e.key)));
    const pids = fresh.filter((e) => e.kind === 'check_in').map((e) => String(e.participantId));
    const bids = fresh.filter((e) => e.kind === 'no_show').map((e) => String(e.bookingId));
    const bookings = fresh.length ? await tx.booking.findMany({ where: { OR: [{ id: { in: bids } }, { participants: { some: { id: { in: pids } } } }] }, select: { id: true, bookingRef: true, status: true, departureId: true, participants: { select: { id: true, fullName: true, checkInStatus: true } } } }) : [];
    const decided = decide(fresh, bookings, departureId, new Set());
    const applied = decided.filter((d: any) => d.outcome === 'applied') as any[];
    const ins = applied.filter((d) => d.kind === 'check_in'), outs = applied.filter((d) => d.kind === 'no_show');
    if (ins.length) await tx.participant.updateMany({ where: { id: { in: ins.map((d) => d.participantId) } }, data: { checkInStatus: 'checked_in' } });
    if (outs.length) {
      await tx.booking.updateMany({ where: { id: { in: outs.map((d) => d.bookingId) }, status: 'confirmed' }, data: { status: 'no_show' } });
      await tx.participant.updateMany({ where: { bookingId: { in: outs.map((d) => d.bookingId) }, checkInStatus: 'pending' }, data: { checkInStatus: 'no_show' } });
    }
    // A booking whose whole party is now in moves to checked_in, as live check-in does.
    const touched = [...new Set(ins.map((d) => d.bookingId))];
    if (touched.length) {
      const pending = await tx.participant.findMany({ where: { bookingId: { in: touched }, checkInStatus: { not: 'checked_in' } }, select: { bookingId: true } });
      const full = touched.filter((id) => !pending.some((p: any) => p.bookingId === id));
      if (full.length) await tx.booking.updateMany({ where: { id: { in: full }, status: 'confirmed' }, data: { status: 'checked_in' } });
    }
    const byKey = new Map(fresh.map((e) => [e.key, e]));
    await tx.auditEvent.createMany({ data: decided.map((d: any) => {
      const e: any = byKey.get(d.key), at = recordedTime(e.recordedAt, now).toISOString();
      const action = d.outcome === 'conflict' ? 'checkin.offline_conflict' : d.outcome === 'already' ? 'checkin.offline_duplicate' : d.kind === 'check_in' ? 'participant.checked_in' : 'booking.no_show';
      const target = d.kind === 'check_in' || e.kind === 'check_in' ? ['Participant', String(e.participantId)] : ['Booking', String(e.bookingId)];
      return { actorId: actor.id, action, targetList: target[0], targetId: target[1], after: { offline: true, recordedAt: at, syncedAt: now.toISOString(), decision: d }, reason: d.reason || '', requestId: rid(d.key) };
    }) });
    const results = events.map((e) => stored.has(rid(e.key)) ? { ...(stored.get(rid(e.key)) as any), replay: true } : decided.find((d) => d.key === e.key));
    return { results, applied: applied.length, conflicts: results.filter((r: any) => r.outcome === 'conflict').length };
  });
}
