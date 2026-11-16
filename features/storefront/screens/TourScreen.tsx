import { notFound } from 'next/navigation'
import { getTours, getAvailability } from '../lib/data'
import { TourPicker } from '../components/TourPicker'

export async function TourScreen({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const tour = (await getTours()).find((t) => t.slug === slug)
  if (!tour) notFound()
  const from = new Date()
  const departures = await getAvailability(tour.id, from.toISOString(), new Date(from.getTime() + 60 * 86400000).toISOString())
  return (
    <div className="space-y-3">
      <section className="rounded-3xl bg-[#f6f6f4] p-5 sm:p-8">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#0f4a2f]">{String(tour.kind || 'Guided tour').replaceAll('_', ' ')}</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">{tour.name}</h1>
        <p className="mt-3 max-w-2xl text-sm">{tour.description}</p>
      </section>
      <section className="rounded-3xl bg-[#f6f6f4] p-5 sm:p-6">
      <dl className="grid gap-1 text-sm">
        {tour.meetingPoint && <div><dt className="inline font-medium">Meeting point: </dt><dd className="inline">{tour.meetingPoint.name}, {tour.meetingPoint.address}</dd></div>}
        {tour.minAge > 0 && <div><dt className="inline font-medium">Minimum age: </dt><dd className="inline">{tour.minAge}</dd></div>}
        {tour.requiresWaiverId && <div><dt className="inline font-medium">Waiver: </dt><dd className="inline">each guest signs after booking</dd></div>}
      </dl>
      </section>
      <section className="rounded-3xl bg-[#f6f6f4] p-5 sm:p-6"><TourPicker tour={tour} departures={departures} /></section>
    </div>
  )
}
