import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { StatusLabel } from '../../components/StatusLabel'
import { dayIn, money, timeIn } from '../../lib/format'
import { getGuides } from '../actions/guides'

export async function GuidesPage() {
  const guides = await getGuides()
  const soon = Date.now() + 30 * 86400000
  return (
    <PageContainer title="Guides" breadcrumbs={[{ type: 'link', label: 'Dashboard', href: '/dashboard' }, { type: 'page', label: 'Guides' }]}>
      <ul className="grid gap-3 p-4 md:grid-cols-2">
        {guides.map((g) => (
          <li key={g.id} className="rounded-xl border p-4">
            <div className="flex items-start justify-between gap-2"><h3 className="truncate text-base font-semibold">{g.name}</h3><StatusLabel status={g.status} /></div>
            <p className="text-sm text-muted-foreground">{(g.languages || []).join(', ')} · {money(g.payRateCents)} {g.payRateType === 'hourly' ? 'per hour' : 'per tour'}</p>
            <ul className="mt-2 space-y-1">
              {g.certifications.map((c: any) => <li key={c.id} className="text-sm">{c.name} <span className={`font-mono ${c.expiresAt && new Date(c.expiresAt).getTime() < soon ? 'text-amber-700' : 'text-muted-foreground'}`}>{c.expiresAt ? `expires ${dayIn(c.expiresAt)}` : 'no expiry'}</span></li>)}
            </ul>
            {g.assignments.length > 0 && <ul className="mt-2 space-y-1 border-t pt-2">{g.assignments.map((a: any) => <li key={a.id} className="flex items-center justify-between gap-2 text-sm"><span className="truncate">{a.departure?.tour?.name} · {dayIn(a.departure.startAt)} {timeIn(a.departure.startAt)}</span><StatusLabel status={a.status} /></li>)}</ul>}
          </li>
        ))}
      </ul>
    </PageContainer>
  )
}
export default GuidesPage
