import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { platformQuery } from '../../lib/gql'
import { money, dayIn } from '../../lib/format'

type Row = { guestName: string; guestEmail: string; guestPhone: string; status: string; totalCents: number; refundedCents: number; currencyCode: string; createdAt: string }

// Guests are the people on bookings (they book without an account), so this groups the latest bookings by email.
export async function CustomersPage() {
  const data = await platformQuery<{ bookings: Row[] }>(`query{ bookings(take:500, orderBy:[{createdAt:desc}]){ guestName guestEmail guestPhone status totalCents refundedCents currencyCode createdAt } }`)
  const guests = new Map<string, { name: string; email: string; phone: string; bookings: number; paidCents: number; currency: string; last: string }>()
  for (const b of data?.bookings || []) {
    const key = (b.guestEmail || b.guestName).toLowerCase()
    const g = guests.get(key) || { name: b.guestName, email: b.guestEmail, phone: b.guestPhone, bookings: 0, paidCents: 0, currency: b.currencyCode, last: b.createdAt }
    g.bookings += 1
    if (b.status === 'confirmed' || b.status === 'completed') g.paidCents += (b.totalCents || 0) - (b.refundedCents || 0)
    guests.set(key, g)
  }
  const rows = [...guests.values()]
  return (
    <PageContainer title="Customers" breadcrumbs={[{ type: 'link', label: 'Dashboard', href: '/dashboard' }, { type: 'page', label: 'Customers' }]}>
      <div className="space-y-3 p-4">
        <p className="text-sm text-muted-foreground">Guests from the latest 500 bookings, newest first. Open Bookings to act on one.</p>
        <ul className="space-y-2">
          {rows.map((g) => (
            <li key={g.email || g.name} className="min-w-0 rounded-xl border p-3 text-sm" data-guest={g.email}>
              <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="min-w-0 break-words font-semibold">{g.name}</p><p className="whitespace-nowrap tabular-nums">{money(g.paidCents, g.currency)}</p></div>
              <p className="break-words text-muted-foreground">{[g.email, g.phone].filter(Boolean).join(' · ')}</p>
              <p className="text-muted-foreground">{g.bookings} booking{g.bookings === 1 ? '' : 's'} · last {dayIn(g.last)}</p>
            </li>
          ))}
          {!rows.length && <li className="text-sm text-muted-foreground">No guests yet.</li>}
        </ul>
      </div>
    </PageContainer>
  )
}
export default CustomersPage
