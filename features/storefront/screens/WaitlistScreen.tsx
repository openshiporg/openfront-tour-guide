import { WaitlistEntryView } from '../components/WaitlistEntryView'

// The proof lives in the URL fragment, which browsers never send to a server, so this page renders no waitlist data itself.
export function WaitlistScreen() {
  return <div className="p-5 sm:p-8"><WaitlistEntryView /></div>
}
