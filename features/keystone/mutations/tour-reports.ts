import { authorize, audit, userFacingError } from '../lib/tour-command';
import { zonedStart } from '../lib/tour-schedule';
import { COUNTED_STATUSES, commissionFor, salesCsv, summarize, type ReportRow } from '../lib/tour-reports';

const MAX_ROWS = 20000, MAX_DAYS = 400;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const plusDay = (d: string, n: number) => new Date(new Date(`${d}T12:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

// Read model shared by the page and the CSV: one pass over the same bookings, so both sum to the same totals.
// Counted = confirmed or later (pending payments and cancelled bookings are not sales). A rebooked weather booking is closed
// as cancelled and its replacement is counted, so the sale is not counted twice.
async function buildRows(context: any, input: any) {
  const from = String(input?.from || ''), to = String(input?.to || '');
  if (!DAY.test(from) || !DAY.test(to)) throw new Error('Choose a start and end date');
  if (to < from) throw new Error('The end date is before the start date');
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > MAX_DAYS) throw new Error('Choose a range of 400 days or less');
  const basis = input?.basis === 'departure' ? 'departure' : 'booked';
  const settings = await context.prisma.storeSettings.findFirst({ select: { timezone: true } });
  const tz = settings?.timezone || 'America/New_York';
  const start = zonedStart(from, '00:00', tz), end = zonedStart(plusDay(to, 1), '00:00', tz);
  const range = { gte: start, lt: end };
  const where: any = { status: { in: COUNTED_STATUSES }, ...(basis === 'booked' ? { createdAt: range } : { departure: { startAt: range } }) };
  const found = await context.prisma.booking.findMany({
    where, orderBy: [{ createdAt: 'asc' }, { bookingRef: 'asc' }], take: MAX_ROWS + 1,
    select: { bookingRef: true, createdAt: true, status: true, source: true, seats: true, totalCents: true, discountCents: true, refundedCents: true, channelCommissionCents: true, channelId: true, channel: { select: { name: true } }, tourSnapshot: true, departure: { select: { startAt: true, tour: { select: { name: true } } } } },
  });
  if (found.length > MAX_ROWS) throw new Error('Too many bookings in that range; choose a shorter range');
  const rows: ReportRow[] = found.map((b: any) => {
    const total = b.totalCents || 0, refunded = Math.min(b.refundedCents || 0, total);
    return {
      ref: b.bookingRef, bookedAt: b.createdAt.toISOString().slice(0, 10), departureAt: b.departure?.startAt ? b.departure.startAt.toISOString().slice(0, 16).replace('T', ' ') + 'Z' : '',
      tour: b.departure?.tour?.name || b.tourSnapshot?.name || 'Unknown tour', channel: b.channel?.name || 'Direct', source: b.source || 'online', status: b.status,
      guests: b.seats || 0, grossCents: total, discountCents: b.discountCents || 0, refundedCents: refunded,
      commissionCents: commissionFor({ totalCents: total, refundedCents: refunded, channelCommissionCents: b.channelCommissionCents || 0, hasChannel: !!b.channelId }),
    };
  });
  return { rows, from, to, basis, tz };
}
// Money is read-only here but sensitive, so it needs the payments-read permission, not just booking access.
export async function salesReport(_r: any, args: any, context: any) {
  await authorize(context, 'canReadPayments');
  try {
    const { rows, from, to, basis, tz } = await buildRows(context, args);
    return { from, to, basis, timezone: tz, ...summarize(rows) };
  } catch (e) { throw userFacingError(e); }
}
// Server-built CSV. Each export is audited (who, range, row count, totals), so a download of sales data leaves a record.
export async function exportSalesCsv(_r: any, args: any, context: any) {
  const user = await authorize(context, 'canReadPayments');
  try {
    const { rows, from, to, basis } = await buildRows(context, args.input);
    const csv = salesCsv(rows); const t = summarize(rows).totals;
    await audit(context.prisma, user.id, 'report.sales_exported', 'Report', `sales:${from}:${to}:${basis}`, null, { from, to, basis, rows: rows.length, ...t }, 'Sales CSV export');
    return { filename: `sales-${from}-to-${to}.csv`, csv, rows: rows.length, totals: t };
  } catch (e) { throw userFacingError(e); }
}
