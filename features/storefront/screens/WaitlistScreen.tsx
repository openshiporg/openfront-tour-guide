import { WaitlistEntryView } from '../components/WaitlistEntryView'

// The proof lives in the URL fragment, which browsers never send to a server, so this page renders no waitlist data itself.
export function WaitlistScreen() {
  return <div className="mx-auto max-w-2xl px-5 pb-8 pt-2 sm:pt-6"><WaitlistEntryView /></div>
}
