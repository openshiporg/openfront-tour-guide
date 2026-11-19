import Link from 'next/link'
import { getOperatorName, getTours } from '../lib/data'
import { money, hoursText, kindText } from '../lib/format'
import { TourPhoto } from '../components/TourPhoto'

function meetingPoints(tours: any[]) {
  const m = new Map<string, { name: string; address: string; instructions: string; mapLink: string; tours: any[] }>()
  for (const t of tours) {
    const mp = t.meetingPoint
    if (!mp?.name) continue
    const e = m.get(mp.name) || { name: mp.name, address: mp.address || '', instructions: mp.instructions || '', mapLink: mp.mapLink || '', tours: [] as any[] }
    e.tours.push(t)
    m.set(mp.name, e)
  }
  return [...m.values()]
}
const fromPrice = (t: any) => (t.ticketTypes.length ? money(Math.min(...t.ticketTypes.map((x: any) => x.priceCents)), t.ticketTypes[0].currencyCode) : '')
const length = (t: any) => (t.durationDays > 1 ? `${t.durationDays} days` : hoursText(t.durationMinutes))

export async function HomeScreen() {
  const [tours, name] = await Promise.all([getTours(), getOperatorName()])
  const [lead, ...rest] = tours
  const points = meetingPoints(tours)
  return (
    <div className="space-y-12 px-5 pb-8 pt-4 sm:space-y-16 sm:pt-8">
      <section>
        <h1 className="max-w-2xl text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">Book a tour with {name}</h1>
        <p className="mt-4 max-w-xl text-base text-[#0b2e1f]/75">
          {tours.length ? `${tours.length} ${tours.length === 1 ? 'tour is' : 'tours are'} on sale. Pick one, choose a time and book your seats online.` : 'No tours are on sale right now.'} Already booked? <Link href="/lookup" className="underline underline-offset-4">Find your booking</Link>.
        </p>
      </section>

      {lead && (
        <section id="tours" className="scroll-mt-6">
          <Link href={`/tours/${lead.slug}`} className="group grid gap-5 sm:grid-cols-[3fr_2fr] sm:items-end sm:gap-8">
            <TourPhoto tour={lead} eager className="aspect-[3/2] w-full rounded-2xl" />
            <div className="sm:pb-2">
              <p className="text-sm text-[#0b2e1f]/65">{kindText[lead.kind] || 'Tour'} · {length(lead)}</p>
              <h2 className="mt-1 text-2xl font-extrabold tracking-tight group-hover:underline group-hover:underline-offset-4 sm:text-3xl">{lead.name}</h2>
              {lead.description && <p className="mt-2 text-[#0b2e1f]/75">{lead.description}</p>}
              <p className="mt-4 font-semibold">From {fromPrice(lead)} a person</p>
              <span className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-[#0f4a2f] px-5 text-sm font-semibold text-white">See times and book</span>
            </div>
          </Link>

          {rest.length > 0 && (
            <ul className="mt-10 grid gap-x-6 gap-y-10 sm:mt-12 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((t) => (
                <li key={t.id}>
                  <Link href={`/tours/${t.slug}`} className="group block">
                    <TourPhoto tour={t} className="aspect-[3/2] w-full rounded-xl" />
                    <h3 className="mt-3 text-lg font-bold leading-snug tracking-tight group-hover:underline group-hover:underline-offset-4">{t.name}</h3>
                    {t.description && <p className="mt-1 text-sm text-[#0b2e1f]/75">{t.description}</p>}
                    <p className="mt-2 text-sm"><span className="text-[#0b2e1f]/65">{length(t)} · </span><span className="font-semibold">from {fromPrice(t)}</span></p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {points.length > 0 && (
        <section>
          <h2 className="text-2xl font-extrabold tracking-tight">Where tours start</h2>
          <dl className="mt-4 divide-y divide-[#0b2e1f]/15 border-y border-[#0b2e1f]/15">
            {points.map((p) => (
              <div key={p.name} className="grid gap-x-8 gap-y-1 py-4 sm:grid-cols-[2fr_3fr]">
                <dt>
                  <span className="block font-bold">{p.name}</span>
                  <span className="block text-sm text-[#0b2e1f]/75">{p.address}</span>
                  {p.mapLink && <a href={p.mapLink} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">Open map</a>}
                </dt>
                <dd className="text-sm">
                  {p.instructions && <p className="text-[#0b2e1f]/75">{p.instructions}</p>}
                  <p className="mt-1 flex flex-wrap gap-x-4">{p.tours.map((t) => <Link key={t.id} href={`/tours/${t.slug}`} className="inline-flex min-h-11 items-center underline underline-offset-4 sm:min-h-0 sm:py-1">{t.name}</Link>)}</p>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  )
}
