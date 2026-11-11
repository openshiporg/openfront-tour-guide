import { notFound } from 'next/navigation'
import { bookingRefExists } from '../lib/data'
import { BookingView } from '../components/BookingView'

export async function ConfirmationScreen({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: Promise<{ email?: string }> }) {
  const { ref } = await params
  const { email } = await searchParams
  if (!(await bookingRefExists(ref))) notFound()
  return <BookingView bookingRef={ref} initialEmail={email || ''} />
}
