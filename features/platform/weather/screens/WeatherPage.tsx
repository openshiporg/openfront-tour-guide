import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { getRefundThreshold } from '../../bookings/actions/bookings'
import { getWeatherCancellations } from '../actions/weather'
import { WeatherChoices } from '../components/WeatherChoices'

export async function WeatherPage() {
  const [departures, threshold] = await Promise.all([getWeatherCancellations(), getRefundThreshold()])
  return (
    <PageContainer title="Weather cancellations" breadcrumbs={[{ type: 'link', label: 'Dashboard', href: '/dashboard' }, { type: 'page', label: 'Weather cancellations' }]}>
      <WeatherChoices departures={departures} thresholdCents={threshold} />
    </PageContainer>
  )
}
export default WeatherPage
