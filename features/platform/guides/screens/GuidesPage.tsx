import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { StatusLabel } from '../../components/StatusLabel'
import { dayIn, money, timeIn } from '../../lib/format'
import { getGuides } from '../actions/guides'
import { getBookingOptions } from '../../bookings/actions/bookings'
import { GuideAssignments } from '../components/GuideAssignments'
import { getSettlements } from '../../channels/actions/settlement'
import { SettlementRows } from '../../channels/components/SettlementActions'

export async function GuidesPage() {
  const [guides, { departures }, settlements] = await Promise.all([getGuides(), getBookingOptions(), getSettlements()])
  const soon = Date.now() + 30 * 86400000
  return (
    <PageContainer title="Guides" breadcrumbs={[{ type: 'link', label: 'Dashboard', href: '/dashboard' }, { type: 'page', label: 'Guides' }]}>
      <GuideAssignments guides={guides} departures={departures} />
      <ul className="grid min-w-0 grid-cols-1 gap-3 p-4 md:grid-cols-2">
        {guides.map((g) => (
          <li key={g.id} className="min-w-0 rounded-xl border p-4">
            <div className="flex items-start justify-between gap-2"><h3 className="truncate text-base font-semibold">{g.name}</h3><StatusLabel status={g.status} /></div>
            <p className="text-sm text-muted-foreground">{(g.languages || []).join(', ')} · {money(g.payRateCents)} {g.payRateType === 'hourly' ? 'per hour' : 'per tour'}</p>
            <ul className="mt-2 space-y-1">
              {g.certifications.map((c: any) => {
                const at = c.expiresAt ? new Date(c.expiresAt).getTime() : null
                const expired = at !== null && at < Date.now(), expiring = at !== null && !expired && at < soon
                return <li key={c.id} className="text-sm">{c.name} <span className={`font-mono text-xs uppercase tracking-wide ${expired ? 'text-rose-700' : expiring ? 'text-amber-700' : 'text-muted-foreground'}`}>{at === null ? 'no expiry' : `${expired ? 'expired' : expiring ? 'expires soon' : 'valid until'} ${new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(at))}`}</span></li>
              })}
            </ul>
            {g.assignments.length > 0 && <ul className="mt-2 space-y-1 border-t pt-2">{g.assignments.map((a: any) => <li key={a.id} className="flex items-center justify-between gap-2 text-sm"><span className="truncate">{a.departure?.tour?.name} · {dayIn(a.departure.startAt)} {timeIn(a.departure.startAt)}</span><StatusLabel status={a.status} /></li>)}</ul>}
          </li>
        ))}
      </ul>
      <SettlementRows kind="payout" rows={settlements.guidePayouts} />
    </PageContainer>
  )
}
export default GuidesPage
