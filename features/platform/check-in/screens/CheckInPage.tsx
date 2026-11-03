import Link from 'next/link'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { zonedStart } from '@/features/keystone/lib/tour-schedule'
import { getDepartures } from '../../today/actions/today'
import { getManifest } from '../actions/checkIn'
import { ManifestClient } from '../components/ManifestClient'
import { StatusLabel } from '../../components/StatusLabel'
import { dayKey, timeIn } from '../../lib/format'

export async function CheckInPage({ searchParams }: { searchParams: Promise<{ departure?: string }> }) {
  const { departure } = await searchParams
  const crumbs = [{ type: 'link' as const, label: 'Dashboard', href: '/dashboard' }, { type: 'page' as const, label: 'Check-in' }]
  if (departure) {
    const manifest = await getManifest(departure)
    return (
      <PageContainer title="Check-in" breadcrumbs={crumbs}>
        {manifest ? (
          <>
            <div className="px-4 pt-4"><h2 className="text-lg font-semibold">{manifest.departure.tourName}</h2><p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">{timeIn(manifest.departure.startAt)} · {manifest.departure.meetingPoint}<StatusLabel status={manifest.departure.status} /></p></div>
            <ManifestClient manifest={manifest} />
          </>
        ) : <p className="p-4 text-sm text-muted-foreground">Manifest not available.</p>}
      </PageContainer>
    )
  }
  const from = zonedStart(dayKey(new Date()), '00:00', 'America/New_York')
  const rows = await getDepartures(from.toISOString(), new Date(from.getTime() + 26 * 3600000).toISOString())
  return (
    <PageContainer title="Check-in" breadcrumbs={crumbs}>
      <ul className="space-y-2 p-4">
        {rows.map((d) => <li key={d.id}><Link href={`/dashboard/platform/check-in?departure=${d.id}`} className="block rounded-xl border p-3 hover:bg-muted"><span className="block truncate text-sm font-medium">{d.tourName}</span><span className="block text-sm text-muted-foreground">{timeIn(d.startAt)} · <span className="font-mono">{d.booked}/{d.capacity}</span></span></Link></li>)}
        {!rows.length && <li className="text-sm text-muted-foreground">No departures today.</li>}
      </ul>
    </PageContainer>
  )
}
export default CheckInPage
