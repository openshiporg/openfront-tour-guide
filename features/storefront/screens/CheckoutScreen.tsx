import { notFound, redirect } from 'next/navigation'
import { getHold, getTours } from '../lib/data'
import { CheckoutForm } from '../components/CheckoutForm'
import { TourPhoto } from '../components/TourPhoto'

export async function CheckoutScreen({ params }: { params: Promise<{ holdId: string }> }) {
  const { holdId } = await params
  const hold = await getHold(holdId)
  if (!hold) notFound()
  if (hold.bookingRef && hold.status === 'converted') redirect(`/bookings/${hold.bookingRef}`)
  const tour = (await getTours()).find((t) => t.id === hold.quote?.tour?.id)
  // Tours that travel by vehicle can collect guests on the way; the guide's pickup sheet groups by this.
  const pickup = ['vehicle_day_trip', 'multi_day'].includes(tour?.kind)
  return <div className="mx-auto max-w-2xl px-5 pb-8 pt-2 sm:pt-6"><CheckoutForm holdId={holdId} hold={hold} pickup={pickup} photo={tour ? <TourPhoto tour={tour} eager className="size-20 shrink-0 rounded-xl sm:size-24" /> : null} publishableKey={process.env.NEXT_PUBLIC_STRIPE_KEY || ''} /></div>
}
