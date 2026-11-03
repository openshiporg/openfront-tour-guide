import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { BookingsClient, STATUSES } from '../components/BookingsClient'
import { getBookings, getStatusCounts } from '../actions/bookings'

export async function BookingsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams
  const active = status && STATUSES.includes(status) ? status : null
  const [{ bookings }, counts] = await Promise.all([getBookings(active), getStatusCounts(STATUSES)])
  return (
    <PageContainer title="Bookings" breadcrumbs={[{ type: 'link', label: 'Dashboard', href: '/dashboard' }, { type: 'page', label: 'Bookings' }]}>
      <BookingsClient rows={bookings} counts={counts} active={active} />
    </PageContainer>
  )
}
export default BookingsPage
