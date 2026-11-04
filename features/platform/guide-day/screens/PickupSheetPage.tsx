import Link from 'next/link'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { dayIn, timeIn } from '../../lib/format'
import { getPickupSheet } from '../actions/guideDay'
import { PrintButton } from '../components/PrintButton'

// Print: hide the app chrome (sidebar, header, floating pager and the controls) and leave the sheet in black on white.
const PRINT_CSS = `@media print { [data-slot="sidebar"], [data-slot="sidebar-gap"], [data-sidebar], header, .no-print { display: none !important } [data-slot="sidebar-wrapper"] { display: block !important } .print-sheet { padding: 0 !important; color: #000 } .print-sheet li { break-inside: avoid } }`

export async function PickupSheetPage({ searchParams }: { searchParams: Promise<{ departure?: string }> }) {
  const { departure } = await searchParams
  const sheet = departure ? await getPickupSheet(departure) : null
  const crumbs = [{ type: 'link' as const, label: 'Dashboard', href: '/dashboard' }, { type: 'page' as const, label: 'Pickup sheet' }]
  return (
    <PageContainer title="Pickup sheet" breadcrumbs={crumbs}>
      <style>{PRINT_CSS}</style>
      {!sheet ? <p className="p-4 text-sm text-muted-foreground">Pickup sheet not available. Open it from My departures or the check-in list.</p> : (
        <div className="print-sheet space-y-4 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0"><h2 className="break-words text-lg font-semibold">{sheet.departure.tourName}</h2><p className="text-sm text-muted-foreground">{dayIn(sheet.departure.startAt)} · {timeIn(sheet.departure.startAt)} · {sheet.totalGuests} guest{sheet.totalGuests === 1 ? '' : 's'}</p>
              {sheet.departure.guides.length > 0 && <p className="break-words text-sm text-muted-foreground">Guides: {sheet.departure.guides.join(', ')}</p>}
              {sheet.departure.meetingPoint && <p className="break-words text-sm text-muted-foreground">Meeting point: {sheet.departure.meetingPoint.name}, {sheet.departure.meetingPoint.address}</p>}</div>
            <div className="no-print flex gap-2"><PrintButton /><Link href={`/dashboard/platform/check-in?departure=${sheet.departure.id}`} className="inline-flex h-9 items-center rounded-md border px-3 text-sm">Manifest</Link></div>
          </div>
          {sheet.stops.map((s) => (
            <section key={s.name} className="space-y-2" aria-label={s.name} data-stop={s.name}>
              <h3 className="break-words font-mono text-xs uppercase tracking-wide">{s.name} · {s.guests} guest{s.guests === 1 ? '' : 's'}</h3>
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
            </section>
          ))}
          {!sheet.stops.length && <p className="text-sm text-muted-foreground">No confirmed bookings on this departure.</p>}
        </div>
      )}
    </PageContainer>
  )
}
export default PickupSheetPage
