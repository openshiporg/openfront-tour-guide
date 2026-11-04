import { ManageBooking } from '../components/ManageBooking'

// The proof lives in the URL fragment, which browsers never send to a server, so this page renders no booking data itself.
export function ManageScreen() {
  return <ManageBooking />
}
