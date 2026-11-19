import { BookingView } from '../components/BookingView'

export function LookupScreen() {
  return <div className="mx-auto max-w-2xl space-y-4 px-5 pb-8 pt-2 sm:pt-6"><h1 className="text-3xl font-extrabold tracking-tight">Find your booking</h1><BookingView bookingRef="" initialEmail="" /></div>
}
