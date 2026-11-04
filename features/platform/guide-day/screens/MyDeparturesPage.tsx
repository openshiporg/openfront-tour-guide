import Link from 'next/link'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { StatusLabel } from '../../components/StatusLabel'
import { dayIn, timeIn } from '../../lib/format'
import { getMyDepartures } from '../actions/guideDay'

export async function MyDeparturesPage() {
  const data = await getMyDepartures(14)
  const crumbs = [{ type: 'link' as const, label: 'Dashboard', href: '/dashboard' }, { type: 'page' as const, label: 'My departures' }]
  const days = new Map<string, NonNullable<typeof data>['departures']>()
  for (const d of data?.departures || []) { const k = dayIn(d.startAt); days.set(k, [...(days.get(k) || []), d]) }
  return (
    <PageContainer title="My departures" breadcrumbs={crumbs}>
      <div className="space-y-4 p-4">
        {!data ? <p role="alert" className="text-sm text-rose-600">Your schedule could not be loaded.</p>
          : !data.guide ? <p className="text-sm text-muted-foreground">Your login is not linked to a guide profile yet, so there is no schedule to show. Ask an operations manager to link it on the Guides page.</p>
          : <>
            <p><Link href="/dashboard/platform/pickup-day" className="inline-flex h-9 items-center rounded-md border px-3 text-sm">Pickup sheet for the day</Link></p>
            <p className="text-sm text-muted-foreground">{data.guide.name}: departures you have accepted in the next 14 days. Offers you have not answered are on the Guides page.</p>
            {[...days.entries()].map(([day, rows]) => (
              <section key={day} className="space-y-2" aria-label={day}>
                <h2 className="font-mono text-xs uppercase tracking-wide text-muted-foreground">{day}</h2>
                <ul className="space-y-2">
                  {rows.map((d) => (
                    <li key={d.id} className="min-w-0 rounded-xl border p-3 text-sm" data-my-departure={d.id}>
                      <div className="flex flex-wrap items-center justify-between gap-2"><p className="min-w-0 break-words font-semibold">{timeIn(d.startAt)} · {d.tourName}</p><StatusLabel status={d.status} /></div>
                      <p className="mt-1 break-words text-muted-foreground">{d.role} · {d.guests} guest{d.guests === 1 ? '' : 's'} in {d.bookings} booking{d.bookings === 1 ? '' : 's'}{d.meetingPoint ? ` · ${d.meetingPoint}` : ''}</p>
                      {d.waiverGaps > 0 && <p className="font-mono text-xs uppercase tracking-wide text-amber-700">{d.waiverGaps} waiver{d.waiverGaps === 1 ? '' : 's'} missing</p>}
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Link href={`/dashboard/platform/check-in?departure=${d.id}`} className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm text-primary-foreground">Manifest</Link>
                        <Link href={`/dashboard/platform/pickup?departure=${d.id}`} className="inline-flex h-9 items-center rounded-md border px-3 text-sm">Pickup sheet</Link>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {!data.departures.length && <p className="text-sm text-muted-foreground">Nothing accepted in the next 14 days.</p>}
          </>}
      </div>
    </PageContainer>
  )
}
export default MyDeparturesPage
