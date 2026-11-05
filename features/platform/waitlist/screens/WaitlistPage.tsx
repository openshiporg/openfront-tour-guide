import Link from 'next/link'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { getWaitlist, getWaitlistDepartures } from '../actions/waitlist'
import { WaitlistClient } from '../components/WaitlistClient'

export async function WaitlistPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams
  const all = status === 'all'
  const [rows, departures] = await Promise.all([getWaitlist(all ? 'all' : 'open'), getWaitlistDepartures()])
  return (
    <PageContainer title="Waitlist" breadcrumbs={[{ type: 'link', label: 'Dashboard', href: '/dashboard' }, { type: 'page', label: 'Waitlist' }]}>
      <div className="space-y-3 p-4">
        <p className="text-sm text-muted-foreground">Guests waiting for a full departure. Freed seats are held for the next party that fits, in order; the guest books them from their link, or you book them here for cash.</p>
        <div role="tablist" className="inline-flex gap-1 rounded-lg bg-muted p-1">
          <Link role="tab" aria-selected={!all} href="/dashboard/platform/waitlist" className={`rounded-md px-3 py-1.5 text-sm ${!all ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>Open</Link>
          <Link role="tab" aria-selected={all} href="/dashboard/platform/waitlist?status=all" className={`rounded-md px-3 py-1.5 text-sm ${all ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>All</Link>
        </div>
        <WaitlistClient rows={rows} departures={departures} />
      </div>
    </PageContainer>
  )
}
export default WaitlistPage
