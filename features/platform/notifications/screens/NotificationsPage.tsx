import Link from 'next/link'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { StatusLabel } from '../../components/StatusLabel'
import { dayIn, timeIn } from '../../lib/format'
import { getGuestNotifications, getNotificationDepartures } from '../actions/notifications'

const KIND: Record<string, string> = { booking_confirmation: 'Booking confirmation', day_before_reminder: 'Day-before reminder', weather_cancellation: 'Weather cancellation', waitlist_offer: 'Waitlist offer' }
const field = 'h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm'
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || ''
const dayStart = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T00:00:00-05:00`).toISOString() : '')

// Read-only: what was queued for each guest (or held back by their preference) and why. Nothing here sends.
export async function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const status = one(sp.status) || 'all', departure = one(sp.departure), from = one(sp.from), to = one(sp.to)
  const toNext = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? dayStart(new Date(new Date(`${to}T12:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10)) : ''
  const [rows, departures] = await Promise.all([
    getGuestNotifications({ status, departureId: departure, from: dayStart(from), to: toNext }),
    getNotificationDepartures(),
  ])
  return (
    <PageContainer title="Guest notifications" breadcrumbs={[{ type: 'link', label: 'Dashboard', href: '/dashboard' }, { type: 'page', label: 'Guest notifications' }]}>
      <div className="space-y-4 p-4">
        <p className="text-sm text-muted-foreground">Messages queued for guests, and the ones held back because the guest opted out. Nothing is sent from here.</p>
        <form method="get" className="grid min-w-0 gap-2 sm:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
          <label className="min-w-0 text-sm">Status<select name="status" defaultValue={status} className={field}><option value="all">All</option><option value="queued">Queued</option><option value="suppressed">Suppressed</option></select></label>
          <label className="min-w-0 text-sm">Departure<select name="departure" defaultValue={departure} className={field}><option value="">Any departure</option>{departures.map((d) => <option key={d.id} value={d.id}>{dayIn(d.startAt)} {timeIn(d.startAt)} · {d.tourName}</option>)}</select></label>
          <label className="min-w-0 text-sm">Departing from<input type="date" name="from" defaultValue={from} className={field} /></label>
          <label className="min-w-0 text-sm">Departing to<input type="date" name="to" defaultValue={to} className={field} /></label>
          <div className="flex items-end gap-2"><button type="submit" className="h-9 rounded-md bg-primary px-3 text-sm text-primary-foreground">Filter</button><Link href="/dashboard/platform/notifications" className="inline-flex h-9 items-center px-2 text-sm underline">Clear</Link></div>
        </form>
        <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground" role="status">{rows.length} record{rows.length === 1 ? '' : 's'}{rows.length === 100 ? ' (latest 100)' : ''}</p>
        <ul className="space-y-2">
          {rows.map((n) => (
            <li key={n.id} className="min-w-0 rounded-xl border p-3 text-sm" data-notification={n.status}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 truncate font-semibold">{KIND[n.kind] || n.kind}</p>
                <StatusLabel status={n.status} />
              </div>
              <p className="mt-1 break-words text-muted-foreground">{n.to || 'No address'} · {n.bookingRef}</p>
              <p className="text-muted-foreground">{n.tourName}{n.departureStartAt ? ` · ${dayIn(n.departureStartAt)} ${timeIn(n.departureStartAt)}` : ''}</p>
              <p className="break-words">{n.subject}</p>
              {n.reason && <p className="break-words text-amber-700">Held back: {n.reason}</p>}
              <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">{dayIn(n.createdAt)} {timeIn(n.createdAt)}</p>
            </li>
          ))}
          {!rows.length && <li className="text-sm text-muted-foreground">No notification records match.</li>}
        </ul>
      </div>
    </PageContainer>
  )
}
export default NotificationsPage
