import { notFound } from 'next/navigation'
import { getTours, getAvailability } from '../lib/data'
import { hoursText, kindText, lines } from '../lib/format'
import { describePolicy } from '../../keystone/lib/tour-self-service'
import { TourPicker } from '../components/TourPicker'
import { TourPhoto } from '../components/TourPhoto'

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null
  return <div><h2 className="text-base font-bold">{title}</h2><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[#0b2e1f]/85">{items.map((x) => <li key={x}>{x}</li>)}</ul></div>
}

export async function TourScreen({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const tour = (await getTours()).find((t) => t.slug === slug)
  if (!tour) notFound()
  const from = new Date()
  const departures = await getAvailability(tour.id, from.toISOString(), new Date(from.getTime() + 60 * 86400000).toISOString())
  const mp = tour.meetingPoint
  const policy = tour.cancellationPolicy ? describePolicy(tour.cancellationPolicy.rules) : []
  const facts = [
    ['Length', tour.durationDays > 1 ? `${tour.durationDays} days` : hoursText(tour.durationMinutes)],
    tour.minAge > 0 && ['Minimum age', String(tour.minAge)],
    tour.fitnessLevel && ['Fitness', tour.fitnessLevel],
    tour.requiresWaiverId && ['Waiver', 'Each guest signs one after booking'],
  ].filter(Boolean) as string[][]
  return (
    <div className="px-5 pb-8 pt-2 sm:pt-6">
      <p className="text-sm text-[#0b2e1f]/65">{kindText[tour.kind] || 'Tour'}</p>
      <h1 className="mt-1 max-w-3xl text-3xl font-extrabold tracking-tight sm:text-4xl">{tour.name}</h1>
      <div className="mt-6 grid gap-8 lg:grid-cols-[3fr_2fr] lg:gap-10">
        <div className="min-w-0 space-y-7">
          <TourPhoto tour={tour} eager className="aspect-[3/2] w-full rounded-2xl" />
          {tour.description && <p className="max-w-prose text-base">{tour.description}</p>}
          <a href="#book" className="inline-flex min-h-11 items-center rounded-xl bg-[#0f4a2f] px-5 text-sm font-semibold text-white lg:hidden">See times and book</a>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-y border-[#0b2e1f]/15 py-4 text-sm sm:grid-cols-3">
            {facts.map(([k, v]) => <div key={k}><dt className="text-[#0b2e1f]/65">{k}</dt><dd className="font-semibold">{v}</dd></div>)}
          </dl>
          <List title="Highlights" items={lines(tour.highlights)} />
          <List title="Included" items={lines(tour.inclusions)} />
          <List title="Not included" items={lines(tour.exclusions)} />
          {tour.whatToBring && <div><h2 className="text-base font-bold">What to bring</h2><p className="mt-2 max-w-prose whitespace-pre-line text-sm text-[#0b2e1f]/85">{tour.whatToBring}</p></div>}
          {mp && (
            <div>
              <h2 className="text-base font-bold">Where to meet</h2>
              <p className="mt-2 text-sm"><span className="font-semibold">{mp.name}</span>{mp.address ? `, ${mp.address}` : ''}</p>
              {mp.instructions && <p className="mt-1 text-sm text-[#0b2e1f]/85">{mp.instructions}</p>}
              {mp.mapLink && <a href={mp.mapLink} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">Open map</a>}
            </div>
          )}
          {policy.length > 0 && (
            <div>
              <h2 className="text-base font-bold">Cancelling</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[#0b2e1f]/85">
                {policy.map((p) => <li key={p}>{p}</li>)}
                {tour.cancellationPolicy.weatherFullRefund && <li>Full refund if we cancel for weather</li>}
              </ul>
            </div>
          )}
        </div>
        <aside id="book" className="scroll-mt-4 lg:sticky lg:top-6 lg:self-start"><div className="rounded-2xl border border-[#0b2e1f]/15 bg-white p-5"><TourPicker tour={tour} departures={departures} /></div></aside>
      </div>
    </div>
  )
}
