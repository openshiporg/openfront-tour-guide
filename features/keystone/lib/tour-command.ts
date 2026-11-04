import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { GraphQLError } from 'graphql';
import { permissions, type Permission } from '../access';
import { getOrCreateIdempotencyAttempt, updateIdempotencyAttempt } from '../utils/idempotency';
export const opaqueToken = () => randomBytes(32).toString('base64url');
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
export const humanCode = (length = 10) => Array.from(randomBytes(length), b => ALPHABET[b % ALPHABET.length]).join('');
const secret = () => { const s = process.env.SESSION_SECRET; if (!s || s.length < 32) throw new Error('SESSION_SECRET of at least 32 characters is required'); return s; };
// Derived links are recomputable by the server only; the participant/booking id alone is never proof.
export const derivedToken = (purpose: string, id: string) => createHmac('sha256', secret()).update(`${purpose}\0${id}`).digest('base64url');
export function assertProof(token: string, hash: string) { const actual = hashToken(token || ''); if (!hash || actual.length !== hash.length || !timingSafeEqual(Buffer.from(actual), Buffer.from(hash))) throw new Error('Booking not found'); }
export async function authorize(context: any, capability: Permission) {
  if (!context.session?.itemId || !permissions[capability]({ session: context.session })) throw new Error('Not authorized');
  const user = await context.prisma.user.findUnique({ where: { id: context.session.itemId }, include: { role: true } });
  if (!user?.role?.[capability]) throw new Error('Not authorized');
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
    // Domain refusals ("Guide is unavailable", "Valid Water Safety certification required") are written for the operator;
    // surface them with a user-facing code. Driver/Prisma failures keep the generic message.
    if (error instanceof GraphQLError || /^Prisma/.test(error?.name || '') || !(error instanceof Error)) throw error;
    throw new GraphQLError(error.message, { extensions: { code: 'KS_USER_INPUT_ERROR' }, originalError: error });
  }
}
async function runCommand(context: any, operation: string, scopedKey: string, params: any, locks: string[], work: (tx: any) => Promise<any>) {
  return context.prisma.$transaction(async (tx: any) => {
    for (const lock of [...new Set([`idempotency:${scopedKey}`, ...locks])].sort()) await lockTransactionKey(tx, lock);
    const { attempt, replay } = await getOrCreateIdempotencyAttempt(tx, { key: scopedKey, requestPath: operation, requestParams: { ...params, actorId: context.session?.itemId || null } });
    if (replay && attempt.recoveryPoint === 'completed') return attempt.responseBody;
    const result = await work(tx);
    await updateIdempotencyAttempt(tx, attempt.id, 'completed', JSON.parse(JSON.stringify(result)), 200);
    return result;
  }, { timeout: 20000 });
}
export async function departureOccupancy(tx: any, departureId: string, excludeHoldId?: string, channelId?: string) {
  const now = new Date();
  const departure = await tx.departure.findUnique({ where: { id: departureId }, include: { tour: true } });
  if (!departure) throw new Error('Departure not found');
  const [bookings, holds, channels] = await Promise.all([
    tx.booking.aggregate({ where: { departureId, status: { in: ['confirmed','checked_in','completed','no_show'] } }, _sum: { seats: true } }),
    tx.inventoryHold.aggregate({ where: { departureId, status: 'active', expiresAt: { gt: now }, ...(excludeHoldId ? { id: { not: excludeHoldId } } : {}) }, _sum: { quantity: true } }),
    departure.startAt.getTime() - now.getTime() > 86400000 ? tx.channel.findMany({ where: { active: true, allocation: { gt: 0 } } }) : [],
  ]);
  let allocated = 0;
  for (const channel of channels) {
    if (channel.id === channelId) continue;
    const sold = await tx.booking.aggregate({ where: { departureId, channelId: channel.id, status: { in: ['confirmed','checked_in','completed','no_show'] } }, _sum: { seats: true } });
    allocated += Math.max(0, channel.allocation - (sold._sum.seats || 0));
  }
  return { departure, booked: bookings._sum.seats || 0, held: holds._sum.quantity || 0, allocated, remaining: Math.max(0, departure.capacity - (bookings._sum.seats || 0) - (holds._sum.quantity || 0) - allocated) };
}
