import Link from 'next/link'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { dayIn, dayKey, timeIn } from '../../lib/format'
import { getDayPickupSheet } from '../actions/guideDay'
import { PrintButton } from '../components/PrintButton'

const PRINT_CSS = `@media print { [data-slot="sidebar"], [data-slot="sidebar-gap"], [data-sidebar], header, .no-print { display: none !important } [data-slot="sidebar-wrapper"] { display: block !important } .print-sheet { padding: 0 !important; color: #000 } .print-sheet li { break-inside: avoid } .print-departure { break-after: page } .print-departure:last-child { break-after: auto } }`
const shift = (day: string, by: number) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + by); return d.toISOString().slice(0, 10) }

export async function DayPickupPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const { day: asked } = await searchParams
  const day = /^\d{4}-\d{2}-\d{2}$/.test(asked || '') ? (asked as string) : dayKey(new Date())
  const sheet = await getDayPickupSheet(day)
  const crumbs = [{ type: 'link' as const, label: 'Dashboard', href: '/dashboard' }, { type: 'page' as const, label: 'Pickup sheet for the day' }]
  return (
    <PageContainer title="Pickup sheet for the day" breadcrumbs={crumbs}>
      <style>{PRINT_CSS}</style>
      <div className="space-y-4 p-4 print-sheet">
        <div className="no-print flex flex-wrap items-center gap-2">
          <Link href={`/dashboard/platform/pickup-day?day=${shift(day, -1)}`} className="inline-flex h-9 items-center rounded-md border px-3 text-sm">Previous day</Link>
          <Link href={`/dashboard/platform/pickup-day?day=${shift(day, 1)}`} className="inline-flex h-9 items-center rounded-md border px-3 text-sm">Next day</Link>
          <PrintButton />
        </div>
        {!sheet ? <p role="alert" className="text-sm text-rose-600">The pickup sheet could not be loaded.</p> : (
          <>
            <div><h2 className="text-lg font-semibold">{dayIn(`${day}T12:00:00Z`)}</h2><p className="text-sm text-muted-foreground" data-day-total>{sheet.departures.length} departure{sheet.departures.length === 1 ? '' : 's'} · {sheet.totalGuests} guest{sheet.totalGuests === 1 ? '' : 's'}</p></div>
            {sheet.departures.map((d) => (
              <section key={d.id} className="print-departure space-y-3 border-t pt-3" aria-label={`${timeIn(d.startAt)} ${d.tourName}`} data-departure={d.id}>
                <div className="min-w-0"><h3 className="break-words text-base font-semibold">{timeIn(d.startAt)} · {d.tourName}</h3><p className="text-sm text-muted-foreground">{d.totalGuests} guest{d.totalGuests === 1 ? '' : 's'}{d.guides.length ? ` · Guides: ${d.guides.join(', ')}` : ''}</p>
                  {d.meetingPoint && <p className="break-words text-sm text-muted-foreground">Meeting point: {d.meetingPoint.name}, {d.meetingPoint.address}</p>}</div>
                {d.stops.map((s) => (
                  <div key={s.name} className="space-y-2" data-stop={s.name}>
                    <h4 className="break-words font-mono text-xs uppercase tracking-wide">{s.name} · {s.guests} guest{s.guests === 1 ? '' : 's'}</h4>
                    <ul className="space-y-2">
                      {s.bookings.map((b) => (
                        <li key={b.bookingRef} className="min-w-0 rounded-xl border p-3 text-sm">
                          <p className="break-words font-semibold">{b.leadName} · party of {b.partySize}</p>
                          <p className="break-words text-muted-foreground">{b.bookingRef}{b.phone ? ` · ${b.phone}` : ''}</p>
                          {b.names.length > 0 && <p className="break-words">{b.names.join(', ')}</p>}
                          {b.notes && <p className="break-words">Notes: {b.notes}</p>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {!d.stops.length && <p className="text-sm text-muted-foreground">No confirmed bookings on this departure.</p>}
              </section>
            ))}
            {!sheet.departures.length && <p className="text-sm text-muted-foreground">No departures on this day{'' }.</p>}
          </>
        )}
      </div>
    </PageContainer>
  )
}
export default DayPickupPage
