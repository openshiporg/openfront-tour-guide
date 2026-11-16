import { BookingView } from '../components/BookingView'

export function LookupScreen() {
  return <div className="space-y-4 rounded-3xl bg-[#f6f6f4] p-5 sm:p-8"><h1 className="text-3xl font-extrabold tracking-tight">Find your booking</h1><BookingView bookingRef="" initialEmail="" /></div>
}
