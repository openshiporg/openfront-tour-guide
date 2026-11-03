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
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{tour.name}</h1>
      <p className="text-sm text-muted-foreground">{tour.description}</p>
      <dl className="grid gap-1 text-sm">
        {tour.meetingPoint && <div><dt className="inline font-medium">Meeting point: </dt><dd className="inline">{tour.meetingPoint.name}, {tour.meetingPoint.address}</dd></div>}
        {tour.minAge > 0 && <div><dt className="inline font-medium">Minimum age: </dt><dd className="inline">{tour.minAge}</dd></div>}
        {tour.requiresWaiverId && <div><dt className="inline font-medium">Waiver: </dt><dd className="inline">each guest signs after booking</dd></div>}
      </dl>
      <TourPicker tour={tour} departures={departures} />
    </div>
  )
}
