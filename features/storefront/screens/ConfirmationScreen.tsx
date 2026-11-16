import { notFound } from 'next/navigation'
import { bookingRefExists } from '../lib/data'
import { BookingView } from '../components/BookingView'

export async function ConfirmationScreen({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: Promise<{ email?: string }> }) {
  const { ref } = await params
  const { email } = await searchParams
  if (!(await bookingRefExists(ref))) notFound()
  return <div className="rounded-3xl bg-[#f6f6f4] p-5 sm:p-8"><BookingView bookingRef={ref} initialEmail={email || ''} /></div>
}
