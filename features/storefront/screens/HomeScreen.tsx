import Link from 'next/link'
import { getTours } from '../lib/data'
import { money, hoursText } from '../lib/format'

export async function HomeScreen() {
  const tours = await getTours()
  return (
    <ul className="space-y-4">
      {tours.map((t) => {
        const from = Math.min(...t.ticketTypes.map((x: any) => x.priceCents))
        return (
          <li key={t.id} className="rounded-xl border p-4">
            <h2 className="text-lg font-semibold"><Link href={`/tours/${t.slug}`}>{t.name}</Link></h2>
            <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
            <p className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm"><span>{hoursText(t.durationMinutes)} · from {money(from)}</span><Link href={`/tours/${t.slug}`} className="rounded-md border px-3 py-1.5">Choose a date</Link></p>
          </li>
        )
      })}
      {!tours.length && <li className="text-sm text-muted-foreground">No tours on sale.</li>}
    </ul>
  )
}
