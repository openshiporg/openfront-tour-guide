'use client'

import React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { manage, manageCancel, manageReschedule } from '../lib/data'
import { money, when } from '../lib/format'
import { parseManageHash } from '../../keystone/lib/tour-self-service'
import { ChangeParty } from './ChangeParty'

export function ManageBooking() {
  const [link, setLink] = React.useState<{ bookingRef: string; token: string } | null | undefined>(undefined)
  const [b, setB] = React.useState<any>(null)
  const [error, setError] = React.useState('')
  const [note, setNote] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [pick, setPick] = React.useState('')
  const [confirmCancel, setConfirmCancel] = React.useState(false)
  // One key per intent, kept until the intent succeeds, so a retry after a timeout replays instead of repeating.
  const keys = React.useRef<Record<string, string>>({})
  const keyFor = (k: string) => (keys.current[k] ||= crypto.randomUUID())

  const load = React.useCallback(async (l: { bookingRef: string; token: string }) => {
    const r = await manage(l.bookingRef, l.token)
    if (r.ok) { setB(r.booking); setError('') } else setError('We could not open this booking. Check that you used the full link from your confirmation.')
  }, [])
  // Read the fragment on load and whenever it changes (a guest pasting a different link into the same tab does not reload the page).
  React.useEffect(() => {
    const read = () => { const l = parseManageHash(window.location.hash); setLink(l); setB(null); setError(''); setNote(''); setPick(''); setConfirmCancel(false); keys.current = {}; if (l) void load(l) }
    read()
    window.addEventListener('hashchange', read)
    return () => window.removeEventListener('hashchange', read)
  }, [load])

  if (link === undefined) return <p className="text-sm text-muted-foreground">Loading…</p>
  if (link === null) return <div className="space-y-3"><h1 className="text-xl font-semibold">Manage your booking</h1><p className="text-sm">This page needs the private link from your confirmation. You can also <Link className="underline" href="/lookup">find your booking</Link> with its code and email.</p></div>
  if (!b) return error ? <p className="text-sm text-rose-600" role="alert">{error}</p> : <p className="text-sm text-muted-foreground">Loading…</p>

  const run = async (f: () => Promise<any>, done: (r: any) => void) => {
    setBusy(true); setError(''); setNote('')
    try { const r = await f(); if (!r.ok) setError(r.error); else done(r.result) } finally { setBusy(false) }
  }
  const cancel = () => run(() => manageCancel(link.bookingRef, link.token, keyFor("cancel")), async (r) => {
    setConfirmCancel(false); setNote(r.refundCents > 0 ? `Cancelled. ${money(r.refundCents, b.currencyCode)} has been refunded.` : 'Cancelled. This booking was past the refund window, so nothing is refunded.'); await load(link)
  })
  const move = () => run(() => manageReschedule(link.bookingRef, link.token, pick, keyFor('move:' + pick)), async (r) => {
    setPick(''); keys.current = {}; setNote(`Moved to ${when(r.startAt, b.timezone)}. Your booking code and this link stay the same.`); await load(link)
  })
  const closes = b.changesCloseAt ? when(b.changesCloseAt, b.timezone) : ''

  return (
    <div className="space-y-4">
      <header className="space-y-1"><h1 className="text-xl font-semibold">{b.tourName}</h1><p className="text-sm text-muted-foreground">{when(b.startAt, b.timezone)}</p></header>
      <p className="text-sm">Booking <span className="font-mono font-semibold">{b.bookingRef}</span> · {b.seats} seats · {money(b.totalCents, b.currencyCode)} · <span className="font-mono uppercase">{b.status}</span></p>
      {b.meetingPoint && <p className="text-sm"><span className="font-medium">Meet at: </span>{b.meetingPoint.name}, {b.meetingPoint.address}</p>}
      <ul className="space-y-1 text-sm">{b.lines.map((l: any, i: number) => <li key={i}>{l.qty} × {l.name}</li>)}</ul>
      {note && <p className="text-sm text-emerald-700" role="status">{note}</p>}
      {error && <p className="text-sm text-rose-600" role="alert">{error}</p>}
      <section className="space-y-1 border-t pt-3" aria-label="Cancellation policy"><h2 className="text-base font-semibold">Cancellation policy</h2><ul className="list-disc space-y-1 pl-5 text-sm">{b.policy.map((p: string) => <li key={p}>{p}</li>)}</ul></section>
      {!b.canChange && b.reason && <p className="border-t pt-3 text-sm" data-reason>{b.reason}</p>}
      {b.canChange && (
        <>
          <p className="text-sm text-muted-foreground">You can change or cancel online until {closes}.</p>
          <section className="space-y-2 border-t pt-3" aria-label="Reschedule">
            <h2 className="text-base font-semibold">Move to another departure</h2>
            {b.options.length === 0 ? <p className="text-sm text-muted-foreground">No other departure of this tour has room for your party at the same price.</p> : (
              <>
                <p className="text-sm text-muted-foreground">Same tour, same price. Pick a new time:</p>
                <ul className="space-y-2">{b.options.map((o: any) => (
                  <li key={o.id}><label className="flex min-w-0 cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm has-[:checked]:border-foreground"><input type="radio" name="departure" value={o.id} checked={pick === o.id} onChange={() => setPick(o.id)} /><span className="min-w-0 break-words">{when(o.startAt, b.timezone)}</span></label></li>
                ))}</ul>
                <Button onClick={move} disabled={!pick || busy}>Move my booking</Button>
              </>
            )}
          </section>
          <ChangeParty key={`${b.seats}:${b.totalCents}`} link={link} booking={b} onDone={async (n) => { await load(link); setNote(n) }} />
          <section className="space-y-2 border-t pt-3" aria-label="Cancel">
            <h2 className="text-base font-semibold">Cancel</h2>
            <p className="text-sm">If you cancel now you will be refunded <span className="font-mono">{money(b.refundIfCancelledCents, b.currencyCode)}</span> of {money(b.totalCents - b.refundedCents, b.currencyCode)}.</p>
            {!confirmCancel ? <Button variant="outline" onClick={() => setConfirmCancel(true)}>Cancel booking</Button> : (
              <div className="flex flex-wrap gap-2"><Button variant="destructive" onClick={cancel} disabled={busy}>Yes, cancel and refund {money(b.refundIfCancelledCents, b.currencyCode)}</Button><Button variant="outline" onClick={() => setConfirmCancel(false)} disabled={busy}>Keep my booking</Button></div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
