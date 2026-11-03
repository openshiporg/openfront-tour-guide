import Link from 'next/link'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { Button } from '@/components/ui/button'
import { getDepartures } from '../../today/actions/today'
import { zonedStart } from '@/features/keystone/lib/tour-schedule'
import { StatusLabel } from '../../components/StatusLabel'
import { dayIn, dayKey, timeIn } from '../../lib/format'

export async function CalendarPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { week } = await searchParams
  const offset = Number.isInteger(Number(week)) ? Math.max(-8, Math.min(12, Number(week))) : 0
  const base = new Date(Date.now() + offset * 7 * 86400000)
  const days = Array.from({ length: 7 }, (_, i) => new Date(base.getTime() + i * 86400000))
  const from = zonedStart(dayKey(days[0]), '00:00', 'America/New_York')
  const to = zonedStart(dayKey(new Date(days[6].getTime() + 26 * 3600000)), '00:00', 'America/New_York')
  const departures = await getDepartures(from.toISOString(), to.toISOString())
  const nav = (n: number) => `/dashboard/platform/calendar?week=${n}`
  return (
    <PageContainer title="Calendar" breadcrumbs={[{ type: 'link', label: 'Dashboard', href: '/dashboard' }, { type: 'page', label: 'Calendar' }]}>
      <div className="space-y-3 p-4">
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline"><Link href={nav(offset - 1)}>Previous</Link></Button>
          <Button asChild size="sm" variant="outline"><Link href={nav(0)}>This week</Link></Button>
          <Button asChild size="sm" variant="outline"><Link href={nav(offset + 1)}>Next</Link></Button>
        </div>
        <div className="grid gap-3 md:grid-cols-7">
          {days.map((day) => {
            const key = dayKey(day)
            const rows = departures.filter((d) => dayKey(d.startAt) === key)
            return (
              <section key={key} className="min-w-0 rounded-xl border p-3">
                <h3 className="text-sm font-semibold">{dayIn(day)}</h3>
                <ul className="mt-2 space-y-2">
                  {rows.map((d) => (
                    <li key={d.id}>
                      <Link href={`/dashboard/platform/check-in?departure=${d.id}`} className="block rounded-lg border p-2 hover:bg-muted">
                        <span className="block truncate text-sm font-medium">{d.tourName}</span>
                        <span className="block text-sm text-muted-foreground">{timeIn(d.startAt)} · <span className="font-mono">{d.booked}/{d.capacity}</span></span>
                        <StatusLabel status={d.status} />
                      </Link>
                    </li>
                  ))}
                  {!rows.length && <li className="text-sm text-muted-foreground">None</li>}
                </ul>
              </section>
            )
          })}
        </div>
      </div>
    </PageContainer>
  )
}
export default CalendarPage
