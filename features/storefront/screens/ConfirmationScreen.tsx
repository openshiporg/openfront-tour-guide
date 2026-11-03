import { cookies } from 'next/headers'
import { BookingView } from '../components/BookingView'

export async function ConfirmationScreen({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: Promise<{ email?: string }> }) {
  const { ref } = await params
  const { email } = await searchParams
  return <BookingView bookingRef={ref} initialEmail={email || ''} />
}
