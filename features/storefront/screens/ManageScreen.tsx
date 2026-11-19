import { ManageBooking } from '../components/ManageBooking'

// The proof lives in the URL fragment, which browsers never send to a server, so this page renders no booking data itself.
export function ManageScreen() {
  return <div className="mx-auto max-w-2xl px-5 pb-8 pt-2 sm:pt-6"><ManageBooking /></div>
}
