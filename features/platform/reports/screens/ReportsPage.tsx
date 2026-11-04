import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { money } from '../../lib/format'
import { dayIn, timeIn } from '../../lib/format'
import { getSalesReport, type Group, type Occ, type Totals, type Week } from '../actions/reports'
import { ExportCsv } from '../components/ExportCsv'

const DAY = /^\d{4}-\d{2}-\d{2}$/
const field = 'h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm'
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || ''
const iso = (d: Date) => d.toISOString().slice(0, 10)

function Figures({ t }: { t: Totals }) {
  const rows: [string, string][] = [['Bookings', String(t.bookings)], ['Cancelled', String(t.cancelled)], ['Guests', String(t.guests)], ['Gross', money(t.grossCents)], ['Discounts', money(t.discountCents)], ['Refunds', money(t.refundedCents)], ['Net', money(t.netCents)], ['Channel commission', money(t.commissionCents)]]
  return (
    <dl className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-1 text-sm">
      {rows.map(([k, v]) => (<div key={k} className="flex min-w-0 items-baseline justify-between gap-2"><dt className="min-w-0 text-muted-foreground">{k}</dt><dd className="shrink-0 whitespace-nowrap text-right font-medium tabular-nums">{v}</dd></div>))}
    </dl>
  )
}
const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`
function Occupancy({ o, deps, shown, total }: { o: { total: Occ; byTour: Occ[] }; deps: { id: string; startAt: string; tour: string; capacity: number; seats: number; bps: number }[]; shown: number; total: number }) {
  const bar = (bps: number) => <span className="block h-2 w-full rounded-sm bg-muted" aria-hidden><span className="block h-2 rounded-sm bg-primary" style={{ width: `${Math.max(0, Math.min(100, bps / 100))}%` }} /></span>
  return (
    <section className="space-y-2" aria-label="Occupancy">
      <h2 className="font-mono text-xs uppercase tracking-wide text-muted-foreground">Occupancy</h2>
      <p className="text-sm text-muted-foreground">Seats sold against capacity for running departures that start in this range.</p>
      <ul className="space-y-2">
        {[o.total, ...o.byTour].map((t, i) => (
          <li key={t.name} className="min-w-0 rounded-xl border p-3 text-sm" data-occupancy={i === 0 ? 'total' : 'tour'}>
            <div className="flex min-w-0 items-baseline justify-between gap-2"><p className="min-w-0 break-words font-semibold">{t.name}</p><p className="shrink-0 whitespace-nowrap font-medium tabular-nums">{pct(t.bps)}</p></div>
            {bar(t.bps)}
            <p className="mt-1 text-muted-foreground">{t.seats} of {t.capacity} seats · {t.departures} departure{t.departures === 1 ? '' : 's'}</p>
          </li>
        ))}
      </ul>
      {deps.length > 0 && (
        <details className="rounded-xl border p-3 text-sm"><summary className="cursor-pointer font-medium">Departures ({shown}{total > shown ? ` of ${total}` : ''})</summary>
          <ul className="mt-2 space-y-2">{deps.map((d) => (<li key={d.id} className="flex min-w-0 items-baseline justify-between gap-2" data-occupancy="departure"><span className="min-w-0 break-words">{dayIn(d.startAt)} {timeIn(d.startAt)} · {d.tour}</span><span className="shrink-0 whitespace-nowrap tabular-nums">{d.seats}/{d.capacity} · {pct(d.bps)}</span></li>))}</ul>
        </details>
      )}
    </section>
  )
}
function Trend({ weeks }: { weeks: Week[] }) {
  const max = Math.max(1, ...weeks.map((w) => w.netCents))
  return (
    <section className="space-y-2" aria-label="Weekly trend">
      <h2 className="font-mono text-xs uppercase tracking-wide text-muted-foreground">Weekly trend</h2>
      <ul className="space-y-2">
        {weeks.map((w) => (
          <li key={w.week} className="min-w-0 rounded-xl border p-3 text-sm" data-week={w.week}>
            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2"><p className="whitespace-nowrap font-medium">Week of {dayIn(`${w.week}T12:00:00Z`)}</p><p className="whitespace-nowrap tabular-nums">{w.bookings} booking{w.bookings === 1 ? '' : 's'} · {money(w.netCents)} net</p></div>
            <span className="mt-1 block h-2 w-full rounded-sm bg-muted" aria-hidden><span className="block h-2 rounded-sm bg-primary" style={{ width: `${(w.netCents / max) * 100}%` }} /></span>
          </li>
        ))}
      </ul>
    </section>
  )
}
function Groups({ title, groups }: { title: string; groups: Group[] }) {
  return (
    <section className="space-y-2" aria-label={`By ${title}`}>
      <h2 className="font-mono text-xs uppercase tracking-wide text-muted-foreground">By {title}</h2>
      <ul className="space-y-2">
        {groups.map((g) => (<li key={g.name} className="min-w-0 rounded-xl border p-3" data-group={title}><p className="mb-2 break-words font-semibold">{g.name}</p><Figures t={g} /></li>))}
        {!groups.length && <li className="text-sm text-muted-foreground">No sales in this range.</li>}
      </ul>
    </section>
  )
}

export async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const today = new Date(), back = new Date(today.getTime() - 29 * 86400000)
  const from = DAY.test(one(sp.from)) ? one(sp.from) : iso(back), to = DAY.test(one(sp.to)) ? one(sp.to) : iso(today)
  const basis = one(sp.basis) === 'departure' ? 'departure' : 'booked'
  const report = await getSalesReport(from, to, basis)
  return (
    <PageContainer title="Sales report" breadcrumbs={[{ type: 'link', label: 'Dashboard', href: '/dashboard' }, { type: 'page', label: 'Sales report' }]}>
      <div className="space-y-4 p-4">
        <p className="text-sm text-muted-foreground">Confirmed bookings and later, plus bookings that were paid or resold and then cancelled (for the cancellation rate). Gross is what guests were charged after discounts; net is gross less refunds. Unpaid pending bookings and rebooked originals are not counted.</p>
        <form method="get" className="grid min-w-0 gap-2 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto]">
          <label className="min-w-0 text-sm">From<input type="date" name="from" defaultValue={from} className={field} /></label>
          <label className="min-w-0 text-sm">To<input type="date" name="to" defaultValue={to} className={field} /></label>
          <label className="min-w-0 text-sm">Count by<select name="basis" defaultValue={basis} className={field}><option value="booked">Date booked</option><option value="departure">Departure date</option></select></label>
          <div className="flex items-end"><button type="submit" className="h-9 rounded-md bg-primary px-3 text-sm text-primary-foreground">Run report</button></div>
        </form>
        {!report ? (
          <p role="alert" className="text-sm text-rose-600">The report could not be built. It needs permission to read payments, and a range of 400 days or less.</p>
        ) : (
          <>
            <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground" role="status">{report.from} to {report.to} · {report.basis === 'booked' ? 'by date booked' : 'by departure date'} · {report.timezone}</p>
            <section className="min-w-0 rounded-xl border p-3" aria-label="Totals"><p className="mb-2 font-semibold">Totals</p><Figures t={report.totals} /><p className="mt-2 text-sm text-muted-foreground" data-cancellation>Cancellation rate {pct(report.totals.cancellationBps)} ({report.totals.cancelled} of {report.totals.bookings})</p></section>
            <ExportCsv from={from} to={to} basis={basis} />
            <Trend weeks={report.trend} />
            <Occupancy o={report.occupancy} deps={report.occupancy.departures} shown={report.occupancy.departuresShown} total={report.occupancy.departuresTotal} />
            <Groups title="tour" groups={report.byTour} />
            <Groups title="channel" groups={report.byChannel} />
            <Groups title="source" groups={report.bySource} />
          </>
        )}
      </div>
    </PageContainer>
  )
}
export default ReportsPage
