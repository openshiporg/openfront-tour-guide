import { authorize, humanCode, hashToken, derivedToken, audit } from '../lib/tour-command';
import { expandSchedule, departureData } from '../lib/tour-schedule';
import { assignGuide, respondToAssignment, assignResource, checkInParticipant } from './tour-operations';
import { createChannelBooking, refreshDepartureStatus } from './tour-checkout';
import { weatherCancelDeparture } from './tour-weather';
import { permissionNames } from '../access';

const ENTITIES = ['settings', 'paymentProvider', 'role', 'meetingPoint', 'cancellationPolicy', 'waiver', 'promoCode', 'channel', 'resource', 'guide', 'tour'] as const;

// Seed-only boundary: allow-listed entities, idempotent by natural key, canManageOnboarding required.
export async function ensureTourOnboardingRecord(_r: any, { entity, data }: { entity: string; data: any }, context: any) {
  await authorize(context, 'canManageOnboarding');
  if (!ENTITIES.includes(entity as any) || !data || typeof data !== 'object') throw new Error('Unsupported setup record');
  const p = context.prisma;
  const ensure = async (model: string, where: any, create: any) => (await p[model].findFirst({ where })) || p[model].create({ data: create });
  switch (entity) {
    case 'settings': { const row = await ensure('storeSettings', { settingsKey: 'operator' }, { ...data, settingsKey: 'operator' }); return { id: row.id }; }
    case 'paymentProvider': {
      const row = await ensure('paymentProvider', { code: data.code }, { name: data.name, code: data.code, isInstalled: true, credentials: {}, createPaymentFunction: 'stripe', capturePaymentFunction: 'stripe', refundPaymentFunction: 'stripe', getPaymentStatusFunction: 'stripe', generatePaymentLinkFunction: 'stripe', handleWebhookFunction: 'stripe' });
      return { id: row.id };
    }
    case 'role': {
      for (const key of data.permissions) if (!permissionNames.includes(key)) throw new Error('Unknown permission');
      const row = await ensure('role', { name: data.name }, { name: data.name, ...Object.fromEntries(data.permissions.map((k: string) => [k, true])) });
      return { id: row.id };
    }
    case 'meetingPoint': { const row = await ensure('meetingPoint', { name: data.name }, data); return { id: row.id }; }
    case 'cancellationPolicy': { const row = await ensure('cancellationPolicy', { name: data.name }, data); return { id: row.id }; }
    case 'waiver': {
      const body = [{ type: 'paragraph', children: [{ text: data.text }] }];
      const row = await ensure('waiverTemplate', { name: data.name, version: data.version }, { name: data.name, version: data.version, body, bodyHash: hashToken(JSON.stringify(body)), status: 'published' });
      return { id: row.id };
    }
    case 'promoCode': { const row = await ensure('promoCode', { code: data.code }, { ...data, status: 'active' }); return { id: row.id }; }
    case 'channel': { const row = await ensure('channel', { name: data.name }, data); return { id: row.id }; }
    case 'resource': { const row = await ensure('resource', { name: data.name }, { ...data, status: 'active' }); return { id: row.id }; }
    case 'guide': {
      let row = await p.guide.findFirst({ where: { name: data.name } });
      if (!row) {
        row = await p.guide.create({ data: { name: data.name, languages: data.languages, payRateType: data.payRateType, payRateCents: data.payRateCents, status: 'active', bio: data.bio || '' } });
        for (const cert of data.certs) await p.guideCertification.create({ data: { guideId: row.id, name: cert, expiresAt: data.expiringCert === cert ? new Date(Date.now() + 20 * 86400000) : new Date(Date.now() + 700 * 86400000) } });
      }
      return { id: row.id };
    }
    case 'tour': {
      let tour = await p.tour.findUnique({ where: { slug: data.slug } });
      if (!tour) {
        tour = await p.tour.create({ data: {
          name: data.name, slug: data.slug, kind: data.kind, description: data.description, durationMinutes: data.durationMinutes, minParticipants: data.minParticipants, maxParticipants: data.maxParticipants, guideRatio: data.guideRatio,
          requiresResourceKind: data.resource, minAge: data.minAge || 0, status: 'active', timezone: 'America/New_York', requiredCertifications: data.certs || [],
          meetingPointId: data.meetingPointId, cancellationPolicyId: data.policyId, requiresWaiverId: data.waiverId || undefined, highlights: [],
          ticketTypes: { create: data.tickets.map((t: any) => ({ name: t.name, priceCents: t.priceCents, seatsUsed: t.seatsUsed || 1, minAge: t.minAge, maxAge: t.maxAge })) },
          addOns: { create: (data.addOns || []).map((a: any) => ({ name: a.name, priceCents: a.priceCents, perPerson: a.perPerson })) },
        } });
        await p.schedule.create({ data: { name: `${data.name} schedule`, tourId: tour.id, rrule: data.rrule, startTimes: data.startTimes } });
      }
      return { id: tour.id };
    }
  }
}

const rand = (seed: number) => { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; };

// Operational activity: future departures with staffing and bookings, plus completed history and a weather cancellation.
export async function seedTourActivity(_r: any, { template, seed }: { template: string; seed: any }, context: any) {
  const user = await authorize(context, 'canManageOnboarding');
  const p = context.prisma; const full = template === 'full';
  const tours = await p.tour.findMany({ where: { status: 'active' }, include: { schedules: true, ticketTypes: true } });
  const wanted = full ? tours : tours.filter((t: any) => seed.tours.find((x: any) => x.slug === t.slug)?.minimal);
  const now = new Date(); const horizon = new Date(now.getTime() + (full ? 21 : 3) * 86400000);
  let created = 0;
  for (const tour of wanted) for (const schedule of tour.schedules) {
    const starts = expandSchedule(schedule, tour, now, horizon).slice(0, full ? 400 : 3);
    for (const startAt of starts) {
      const key = `${tour.id}:${startAt.toISOString()}`;
      if (!await p.departure.findUnique({ where: { departureKey: key } })) { await p.departure.create({ data: departureData(schedule, tour, startAt, key) }); created++; }
    }
  }
  const departures = await p.departure.findMany({ where: { startAt: { gt: now }, status: { in: ['on_sale', 'confirmed', 'min_not_met', 'full'] } }, include: { tour: true }, orderBy: { startAt: 'asc' }, take: 400 });
  if (!full) return { departures: created, bookings: 0 };
  const guides = await p.guide.findMany({ orderBy: { name: 'asc' } }); const resources = await p.resource.findMany();
  let gi = 0;
  const idem = (s: string) => `seed:${s}`;
  for (const d of departures.slice(0, 60)) {
    try { const kind = d.tour.requiresResourceKind; const r = resources.find((x: any) => x.kind === kind); if (r) await assignResource(null, { input: { departureId: d.id, resourceId: r.id, quantity: kind === 'kayak' ? 8 : 1 }, idempotencyKey: idem(`res:${d.id}`) }, context); } catch { /* an unfit resource leaves the departure unassigned */ }
    for (let k = 0; k < 2; k++) {
      const guide = guides[(gi++) % guides.length];
      try {
        const offer: any = await assignGuide(null, { input: { departureId: d.id, guideId: guide.id, role: k === 0 ? 'lead' : 'assistant' }, idempotencyKey: idem(`guide:${d.id}:${guide.id}`) }, context);
        if (k === 0 || d.startAt.getTime() % 3 === 0) await respondToAssignment(null, { input: { assignmentId: offer.id, status: 'accepted' }, idempotencyKey: idem(`accept:${offer.id}`) }, { ...context, session: { ...context.session, itemId: user.id } });
      } catch { /* certification, availability and overlap rules intentionally skip a guide */ }
    }
  }
  const next = rand(7); let bookings = 0; const sources = ['phone', 'walk_up', 'reseller', 'phone', 'walk_up'];
  const channels = await p.channel.findMany(); const names: string[] = seed.guestNames;
  const sellable = departures.filter((d: any) => d.tour.slug !== 'private-ghost-tour' || next() > 0.5);
  for (let n = 0; bookings < (seed.bookingTarget || 60) && n < 400; n++) {
    const d = sellable[Math.floor(next() * Math.min(sellable.length, 90))]; if (!d) break;
    const tickets = await p.ticketType.findMany({ where: { tourId: d.tourId } });
    const t = tickets[Math.floor(next() * tickets.length)]; const qty = 1 + Math.floor(next() * 3);
    const name = names[Math.floor(next() * names.length)]; const source = sources[Math.floor(next() * sources.length)];
    const channel = source === 'reseller' ? channels[Math.floor(next() * channels.length)] : null;
    try {
      await createChannelBooking(null, { idempotencyKey: idem(`booking:${n}`), input: { departureId: d.id, source, channelId: channel?.id, paymentMethod: 'cash', tickets: [{ id: t.id, qty }], lead: { name, email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@guests.example`, phone: '843-555-0100' }, participants: Array.from({ length: qty }, (_, i) => ({ ticketTypeId: t.id, fullName: i === 0 ? name : `${name.split(' ')[0]} Guest ${i}`, age: t.minAge ? Math.max(t.minAge, 30) : 35 })) } }, context);
      bookings++;
    } catch { /* full departure or sold-out add-on: try another */ }
  }
  // Check some participants in on the nearest departures.
  const soon = await p.participant.findMany({ where: { booking: { status: 'confirmed', departure: { startAt: { lt: new Date(now.getTime() + 36 * 3600000) } } } }, take: 6 });
  for (const part of soon) { try { await checkInParticipant(null, { input: { participantId: part.id }, idempotencyKey: idem(`ci:${part.id}`) }, context); } catch { /* ignored */ } }
  // Weather cancellation with refunds.
  const target = departures.find((d: any) => d.tour.slug === 'dolphin-boat' && d.startAt.getTime() - now.getTime() > 5 * 86400000);
  if (target) {
    for (let i = 0; i < 3; i++) {
      const t = (await p.ticketType.findMany({ where: { tourId: target.tourId } }))[0];
      try { await createChannelBooking(null, { idempotencyKey: idem(`weather:${i}`), input: { departureId: target.id, source: 'phone', paymentMethod: 'cash', tickets: [{ id: t.id, qty: 2 }], lead: { name: names[i], email: `weather${i}@guests.example` }, participants: [0, 1].map(k => ({ ticketTypeId: t.id, fullName: `${names[i]} ${k}`, age: 30 })) } }, context); } catch { /* ignored */ }
    }
    // The same command operators use: a required reason, the audit trail and one weather notice per booking (honouring preferences).
    await weatherCancelDeparture(null, { input: { departureId: target.id, reason: 'Small-craft advisory: sustained 25 kt winds forecast on the harbor' }, idempotencyKey: idem('weather-cancel') }, context);
  }
  // Completed history: past departures with check-ins and draft guide payouts.
  const history = tours.slice(0, 4);
  for (let h = 0; h < history.length; h++) {
    const tour = history[h]; const startAt = new Date(now.getTime() - (h + 2) * 86400000); startAt.setMinutes(0, 0, 0);
    const key = `history:${tour.id}:${startAt.toISOString()}`; if (await p.departure.findUnique({ where: { departureKey: key } })) continue;
    const dep = await p.departure.create({ data: { departureKey: key, tourId: tour.id, startAt, endAt: new Date(startAt.getTime() + tour.durationMinutes * 60000), capacity: tour.maxParticipants, status: 'completed' } });
    const guide = guides[h % guides.length];
    const payout = await p.guidePayout.create({ data: { guideId: guide.id, periodStart: dep.startAt, periodEnd: dep.endAt, totalCents: guide.payRateCents, status: 'draft' } });
    await p.guideAssignment.create({ data: { departureId: dep.id, guideId: guide.id, role: 'lead', status: 'worked', payCents: guide.payRateCents, payoutId: payout.id } });
    const ticket = tour.ticketTypes[0];
    for (let b = 0; b < 2; b++) {
      const total = ticket.priceCents * 2;
      const booking = await p.booking.create({ data: { bookingRef: `TG-${humanCode(8)}`, departureId: dep.id, guestName: names[(h * 2 + b) % names.length], guestEmail: `past${h}${b}@guests.example`, status: 'completed', source: 'phone', subtotalCents: total, totalCents: total, seats: 2 * ticket.seatsUsed, policySnapshot: { rules: [] }, tourSnapshot: { name: tour.name, timezone: tour.timezone }, lines: { create: [{ name: ticket.name, unitPriceCents: ticket.priceCents, qty: 2, seatsUsed: ticket.seatsUsed, kind: 'ticket', totalCents: total, catalogId: ticket.id }] } } });
      for (let k = 0; k < 2; k++) await p.participant.create({ data: { bookingId: booking.id, fullName: `${booking.guestName} ${k}`, waiverStatus: 'not_required', checkInStatus: 'checked_in', ticketTypeSnapshot: { name: ticket.name } } });
      await p.payment.create({ data: { idempotencyKey: `seed-history:${booking.id}`, amount: total, status: 'succeeded', paymentMethod: 'cash', orderId: booking.id, processedAt: startAt, notes: 'Collected by operator' } });
    }
  }
  await p.$transaction((tx: any) => audit(tx, user.id, 'onboarding.activity_seeded', 'Departure', 'seed', null, { bookings }));
  return { departures: created, bookings };
}
