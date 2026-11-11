import { notFound, redirect } from 'next/navigation'
import { getHold } from '../lib/data'
import { CheckoutForm } from '../components/CheckoutForm'

export async function CheckoutScreen({ params }: { params: Promise<{ holdId: string }> }) {
  const { holdId } = await params
  const hold = await getHold(holdId)
  if (!hold) notFound()
  if (hold.bookingRef && hold.status === 'converted') redirect(`/bookings/${hold.bookingRef}`)
  return <CheckoutForm holdId={holdId} hold={hold} publishableKey={process.env.NEXT_PUBLIC_STRIPE_KEY || ''} />
}
