import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { getCanRefund, getRefundThreshold } from '../../bookings/actions/bookings'
import { getWeatherCancellations } from '../actions/weather'
import { WeatherChoices } from '../components/WeatherChoices'

export async function WeatherPage() {
  const [departures, threshold, canRefund] = await Promise.all([getWeatherCancellations(), getRefundThreshold(), getCanRefund()])
  return (
    <PageContainer title="Weather cancellations" breadcrumbs={[{ type: 'link', label: 'Dashboard', href: '/dashboard' }, { type: 'page', label: 'Weather cancellations' }]}>
      <WeatherChoices departures={departures} thresholdCents={threshold} canRefund={canRefund} />
    </PageContainer>
  )
}
export default WeatherPage
