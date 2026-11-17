import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { TodayClient } from '../components/TodayClient'
import { DailyCheck } from '../components/DailyCheck'
import { getDepartures } from '../actions/today'
import { zonedStart } from '@/features/keystone/lib/tour-schedule'
import { dayKey } from '../../lib/format'
import { loadOperatorZone } from '@/features/platform/lib/operator-zone'

export async function TodayPage() {
  const zone = await loadOperatorZone()
  const today = dayKey(new Date())
  const from = zonedStart(today, '00:00', zone)
  const tomorrow = new Date(from.getTime() + 25 * 3600000)
  const to = zonedStart(dayKey(tomorrow), '00:00', zone)
  const departures = await getDepartures(from.toISOString(), to.toISOString())
  return (
    <PageContainer title="Today" breadcrumbs={[{ type: 'link', label: 'Dashboard', href: '/dashboard' }, { type: 'page', label: 'Today' }]}>
      <DailyCheck />
      <TodayClient departures={departures} />
    </PageContainer>
  )
}
export default TodayPage
