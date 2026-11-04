import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { money } from '../../lib/format'
import { getSalesReport, type Group, type Totals } from '../actions/reports'
import { ExportCsv } from '../components/ExportCsv'

const DAY = /^\d{4}-\d{2}-\d{2}$/
const field = 'h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm'
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || ''
const iso = (d: Date) => d.toISOString().slice(0, 10)

function Figures({ t }: { t: Totals }) {
  const rows: [string, string][] = [['Bookings', String(t.bookings)], ['Guests', String(t.guests)], ['Gross', money(t.grossCents)], ['Discounts', money(t.discountCents)], ['Refunds', money(t.refundedCents)], ['Net', money(t.netCents)], ['Channel commission', money(t.commissionCents)]]
  return (
    <dl className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-1 text-sm">
      {rows.map(([k, v]) => (<div key={k} className="flex min-w-0 items-baseline justify-between gap-2"><dt className="min-w-0 text-muted-foreground">{k}</dt><dd className="shrink-0 whitespace-nowrap text-right font-medium tabular-nums">{v}</dd></div>))}
    </dl>
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
        <p className="text-sm text-muted-foreground">Confirmed bookings and later. Gross is what guests were charged after discounts; net is gross less refunds. Pending and cancelled bookings are not counted.</p>
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
            <section className="min-w-0 rounded-xl border p-3" aria-label="Totals"><p className="mb-2 font-semibold">Totals</p><Figures t={report.totals} /></section>
            <ExportCsv from={from} to={to} basis={basis} />
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
