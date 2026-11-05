'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { claimWaitlistOffer, leaveWaitlist, waitlistStatus } from '../lib/data'
import { when } from '../lib/format'
import { parseWaitlistHash } from '../../keystone/lib/tour-waitlist'

const STATE: Record<string, string> = { waiting: 'Waiting', offered: 'Seats held for you', converted: 'Booked', expired: 'Closed', withdrawn: 'Left the waitlist' }

export function WaitlistEntryView() {
  const router = useRouter()
  const [link, setLink] = React.useState<{ entryId: string; token: string } | null | undefined>(undefined)
  const [e, setE] = React.useState<any>(null)
  const [error, setError] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [confirmLeave, setConfirmLeave] = React.useState(false)
  const leaveKey = React.useRef(crypto.randomUUID())
  const load = React.useCallback(async (l: { entryId: string; token: string }) => {
    const r = await waitlistStatus(l.entryId, l.token)
    if (r.ok) { setE(r.entry); setError('') } else setError('We could not open this waitlist entry. Check that you used the full link.')
  }, [])
  React.useEffect(() => {
    const read = () => { const l = parseWaitlistHash(window.location.hash); setLink(l); setE(null); setError(''); if (l) void load(l) }
    read(); window.addEventListener('hashchange', read)
    return () => window.removeEventListener('hashchange', read)
  }, [load])

  if (link === undefined) return <p className="text-sm text-muted-foreground">Loading…</p>
  if (link === null) return <div className="space-y-3"><h1 className="text-xl font-semibold">Your waitlist place</h1><p className="text-sm">This page needs the private link you got when you joined the waitlist. <Link className="underline" href="/">See tours</Link>.</p></div>
  if (!e) return error ? <p className="text-sm text-rose-600" role="alert">{error}</p> : <p className="text-sm text-muted-foreground">Loading…</p>

  const book = async () => {
    setBusy(true); setError('')
    try { const r = await claimWaitlistOffer(link.entryId, link.token); if (r.ok) router.push(`/checkout/${r.result.holdId}`); else { setError(r.error); await load(link) } } finally { setBusy(false) }
  }
  const leave = async () => {
    setBusy(true); setError('')
    try { const r = await leaveWaitlist(link.entryId, link.token, leaveKey.current); if (r.ok) { setConfirmLeave(false); await load(link) } else setError(r.error) } finally { setBusy(false) }
  }
  const open = e.status === 'waiting' || e.status === 'offered'
  return (
    <div className="space-y-4">
      <header className="space-y-1"><h1 className="text-xl font-semibold">{e.tourName}</h1><p className="text-sm text-muted-foreground">{when(e.startAt, e.timezone)}</p></header>
      <p className="font-mono text-xs uppercase tracking-wide" role="status">{STATE[e.status] || e.status}{e.status === 'waiting' && e.position ? ` · position ${e.position}` : ''}</p>
      <p className="text-sm">{e.guestName} · party of {e.seats}</p>
      {error && <p className="text-sm text-rose-600" role="alert">{error}</p>}
      {e.status === 'waiting' && <p className="text-sm">When seats free up they are held for the next party on the list that fits. Come back to this link, or watch for our message.</p>}
      {e.status === 'offered' && (
        <section className="space-y-2 border-t pt-3" aria-label="Offer">
          <p className="text-sm">{e.seats} seat{e.seats === 1 ? ' is' : 's are'} held for you until <span className="font-semibold">{when(e.offerExpiresAt, e.timezone)}</span>. After that they go to the next guest.</p>
          <Button className="w-full" onClick={book} disabled={busy}>{busy ? 'Opening checkout…' : 'Book these seats'}</Button>
        </section>
      )}
      {e.status === 'converted' && <p className="text-sm">Booked as <Link className="font-mono underline" href={`/bookings/${e.bookingRef}`}>{e.bookingRef}</Link>.</p>}
      {e.status === 'expired' && <p className="text-sm">{e.note || 'This waitlist entry is closed.'} <Link className="underline" href={`/tours/${e.tourSlug}`}>See other times</Link>.</p>}
      {open && (
        <section className="space-y-2 border-t pt-3" aria-label="Leave">
          {!confirmLeave ? <Button variant="outline" onClick={() => setConfirmLeave(true)}>Leave the waitlist</Button> : (
            <div className="flex flex-wrap gap-2"><Button variant="destructive" onClick={leave} disabled={busy}>Yes, leave{e.status === 'offered' ? ' and release the seats' : ''}</Button><Button variant="outline" onClick={() => setConfirmLeave(false)} disabled={busy}>Stay on it</Button></div>
          )}
        </section>
      )}
    </div>
  )
}
