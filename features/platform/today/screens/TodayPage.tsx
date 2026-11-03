import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { TodayClient } from '../components/TodayClient'
import { getDepartures } from '../actions/today'
import { zonedStart } from '@/features/keystone/lib/tour-schedule'
import { dayKey } from '../../lib/format'

export async function TodayPage() {
  const today = dayKey(new Date())
  const from = zonedStart(today, '00:00', 'America/New_York')
  const tomorrow = new Date(from.getTime() + 25 * 3600000)
  const to = zonedStart(dayKey(tomorrow), '00:00', 'America/New_York')
  const departures = await getDepartures(from.toISOString(), to.toISOString())
  return (
    <PageContainer title="Today" breadcrumbs={[{ type: 'link', label: 'Dashboard', href: '/dashboard' }, { type: 'page', label: 'Today' }]}>
      <TodayClient departures={departures} />
    </PageContainer>
  )
}
export default TodayPage
