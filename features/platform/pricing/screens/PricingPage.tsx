import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { getPricingBoard } from '../actions/pricing'
import { PricingClient } from '../components/PricingClient'

export async function PricingPage() {
  const board = await getPricingBoard()
  return (
    <PageContainer title="Seasonal pricing" breadcrumbs={[{ type: 'link', label: 'Dashboard', href: '/dashboard' }, { type: 'page', label: 'Seasonal pricing' }]}>
      <div className="space-y-3 p-4">
        <p className="text-sm text-muted-foreground">A rule changes the ticket price for departures that start in its dates and on its weekdays, in the tour&apos;s timezone. A rule for one ticket type beats a rule for the whole tour; the newest rule wins a tie. Bookings already made keep the price they were sold at.</p>
        <PricingClient board={board} />
      </div>
    </PageContainer>
  )
}
export default PricingPage
