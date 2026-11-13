import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { GraphQLError } from 'graphql';
import { permissions, type Permission } from '../access';
import { updateIdempotencyAttempt, assertIdempotencyRequest, canonicalIdempotencyParams, idempotencyFingerprint } from '../utils/idempotency';
import { Prisma } from '@prisma/client';
import { constraintRefusal } from './constraint-errors';
export const opaqueToken = () => randomBytes(32).toString('base64url');
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
export const humanCode = (length = 10) => Array.from(randomBytes(length), b => ALPHABET[b % ALPHABET.length]).join('');
const secret = () => { const s = process.env.SESSION_SECRET; if (!s || s.length < 32) throw new Error('SESSION_SECRET of at least 32 characters is required'); return s; };
// Derived links are recomputable by the server only; the participant/booking id alone is never proof.
export const derivedToken = (purpose: string, id: string) => createHmac('sha256', secret()).update(`${purpose}\0${id}`).digest('base64url');
// The guest manage link. Version 0 is the original token (id only), so links already sent keep working; every operator reset bumps the
// version, which changes the HMAC input and so kills every earlier link for that one booking without touching any other booking.
export const manageToken = (bookingId: string, version = 0) => derivedToken('manage', version ? `${bookingId}\0v${version}` : bookingId);
export function assertProof(token: string, hash: string) { const actual = hashToken(token || ''); if (!hash || actual.length !== hash.length || !timingSafeEqual(Buffer.from(actual), Buffer.from(hash))) throw new Error('Booking not found'); }
export async function authorize(context: any, capability: Permission) {
  // A coded GraphQLError so the refusal reaches the person in words (a plain Error is masked as "Unexpected error.").
  if (!context.session?.itemId) throw new GraphQLError('Not authorized: sign in first.', { extensions: { code: 'KS_ACCESS_DENIED' } });
  const denied = () => new GraphQLError('Not authorized: your role cannot do this.', { extensions: { code: 'KS_ACCESS_DENIED' } });
  if (!permissions[capability]({ session: context.session })) throw denied();
  const user = await context.prisma.user.findUnique({ where: { id: context.session.itemId }, include: { role: true } });
  if (!user?.role?.[capability]) throw denied();
  return user;
}
// Gym classCapacity donor: advisory lock and all recounts/writes share the same transaction.
export async function lockTransactionKey(tx: any, key: string) {
  const result = await tx.$queryRaw`SELECT true AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))) AS acquired`;
  if (result instanceof Error) throw result;
}
export async function audit(tx: any, actorId: string | null, action: string, targetList: string, targetId: string, before: any, after: any, reason = '', requestId = '') {
  const result = await tx.auditEvent.create({ data: { actorId, action, targetList, targetId, before: before ?? undefined, after: after ?? undefined, reason, requestId } });
  if (result instanceof Error) throw result;
}
export async function command(context: any, key: string, operation: string, params: any, locks: string[], work: (tx: any) => Promise<any>) {
  if (!key || key.length > 200) throw new Error('Idempotency key required (maximum 200 characters)');
  const scopedKey = `${operation}:${key}`;
  try {
    return await runCommand(context, operation, scopedKey, params, locks, work);
  } catch (error: any) {
    throw userFacingError(error);
  }
}
// Domain refusals ("Guide is unavailable", "Valid Water Safety certification required") are written for the operator;
// surface them with a user-facing code. Driver/Prisma failures keep the generic message.
export function userFacingError(error: any) {
  const refusal = constraintRefusal(error);
  if (refusal) return new GraphQLError(refusal.message, { extensions: { code: refusal.code }, originalError: error });
  if (error instanceof GraphQLError || /^Prisma/.test(error?.name || '') || !(error instanceof Error)) return error;
  return new GraphQLError(error.message, { extensions: { code: 'KS_USER_INPUT_ERROR' }, originalError: error });
}
// All of a command's advisory locks in ONE round trip, taken in sorted order (the same order as taking them one by one).
export async function lockTransactionKeys(tx: any, keys: string[]) {
  const sorted = [...new Set(keys)].sort();
  if (!sorted.length) return;
  const calls = Prisma.join(sorted.map(k => Prisma.sql`pg_advisory_xact_lock(hashtextextended(${k}, 0))`));
  const result = await tx.$queryRaw`SELECT true AS locked FROM (SELECT ${calls}) AS acquired`;
  if (result instanceof Error) throw result;
}
// Insert-or-find in one round trip when the key is new (the common case); the idempotency lock is already held,
// so a conflict means a genuine replay and costs one more read.
async function claimIdempotencyKey(tx: any, key: string, operation: string, params: Record<string, unknown>) {
  const requestParams = { ...canonicalIdempotencyParams(params), _fingerprint: idempotencyFingerprint(params) };
  const id = 'c' + randomBytes(12).toString('hex');
  const rows = await tx.$queryRaw`INSERT INTO "IdempotencyKey" (id, "idempotencyKey", "requestMethod", "requestPath", "requestParams", "recoveryPoint", "lockedAt", "updatedAt")
    VALUES (${id}, ${key}, 'POST', ${operation}, ${JSON.stringify(requestParams)}::jsonb, 'started', now(), now())
    ON CONFLICT ("idempotencyKey") DO NOTHING RETURNING id`;
  if (rows.length) return { attempt: { id } as any, replay: false };
  const existing = await tx.idempotencyKey.findUnique({ where: { idempotencyKey: key } });
  assertIdempotencyRequest(existing, { key, requestPath: operation, requestParams: params });
  return { attempt: existing, replay: true };
}
async function runCommand(context: any, operation: string, scopedKey: string, params: any, locks: string[], work: (tx: any) => Promise<any>) {
  return context.prisma.$transaction(async (tx: any) => {
    await lockTransactionKeys(tx, [`idempotency:${scopedKey}`, ...locks]);
    const { attempt, replay } = await claimIdempotencyKey(tx, scopedKey, operation, { ...params, actorId: context.session?.itemId || null });
    if (replay && attempt.recoveryPoint === 'completed') return attempt.responseBody;
    const result = await work(tx);
    await updateIdempotencyAttempt(tx, attempt.id, 'completed', JSON.parse(JSON.stringify(result)), 200);
    return result;
  }, { timeout: 20000 });
}
// partially_refunded is a legacy status (a partial refund no longer changes it) but old rows still hold seats.
const COUNTED = "'confirmed','checked_in','completed','no_show','partially_refunded'";
// Seats taken, held and reserved for other channels, in ONE statement (it used to be 3 + one per channel).
export async function occupancyNumbers(tx: any, departureId: string, startAt: Date, excludeHoldId?: string, channelId?: string) {
  const now = new Date();
  const reserveChannels = startAt.getTime() - now.getTime() > 86400000;
  const rows = await tx.$queryRawUnsafe(`SELECT
    COALESCE((SELECT SUM(seats) FROM "Booking" WHERE departure = $1 AND status IN (${COUNTED})), 0)::int AS booked,
    COALESCE((SELECT SUM(quantity) FROM "InventoryHold" WHERE departure = $1 AND status = 'active' AND "expiresAt" > $2 AND ($3::text IS NULL OR id <> $3)), 0)::int AS held,
    COALESCE((SELECT SUM(GREATEST(0, c.allocation - COALESCE(s.sold, 0))) FROM "Channel" c
      LEFT JOIN (SELECT channel, SUM(seats) AS sold FROM "Booking" WHERE departure = $1 AND status IN (${COUNTED}) GROUP BY channel) s ON s.channel = c.id
      WHERE $4::boolean AND c.active AND c.allocation > 0 AND ($5::text IS NULL OR c.id <> $5)), 0)::int AS allocated,
    d.status, d.capacity, d."bookingCutoffMinutes" AS cutoff,
    (SELECT COUNT(*)::int FROM "InventoryHold" WHERE departure = $1 AND status = 'active' AND "expiresAt" <= $2) AS stale
    FROM "Departure" d WHERE d.id = $1`,
    departureId, now, excludeHoldId ?? null, reserveChannels, channelId ?? null);
  return rows[0] as { booked: number; held: number; allocated: number; status: string; capacity: number; cutoff: number | null; stale: number };
}
export async function departureOccupancy(tx: any, departureId: string, excludeHoldId?: string, channelId?: string) {
  const departure = await tx.departure.findUnique({ where: { id: departureId }, include: { tour: true } });
  if (!departure) throw new Error('Departure not found');
  const { booked, held, allocated } = await occupancyNumbers(tx, departureId, departure.startAt, excludeHoldId, channelId);
  return { departure, booked, held, allocated, remaining: Math.max(0, departure.capacity - booked - held - allocated) };
}
