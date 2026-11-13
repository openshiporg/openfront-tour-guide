import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { BookingsClient } from '../components/BookingsClient'
import { STATUSES } from '../statuses'
import { getBookings, getStatusCounts, getBookingOptions, getRefundApprovals, getRefundThreshold, getCanRefund } from '../actions/bookings'
import { RefundApprovals } from '../components/RefundApprovals'
import { OperatorBooking } from '../components/OperatorBooking'

export async function BookingsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams
  const active = status && STATUSES.includes(status) ? status : null
  const [{ bookings }, counts, options, approvals, threshold, canRefund] = await Promise.all([getBookings(active), getStatusCounts(STATUSES), getBookingOptions(), getRefundApprovals(), getRefundThreshold(), getCanRefund()])
  return (
    <PageContainer title="Bookings" breadcrumbs={[{ type: 'link', label: 'Dashboard', href: '/dashboard' }, { type: 'page', label: 'Bookings' }]}>
      <div className="p-4 pb-0"><OperatorBooking {...options} /></div>
      <div className="p-4 pb-0"><RefundApprovals rows={approvals.rows} me={approvals.me} /></div>
      <BookingsClient rows={bookings} counts={counts} active={active} thresholdCents={threshold} canRefund={canRefund} />
    </PageContainer>
  )
}
export default BookingsPage
