'use client'

import React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cancelBooking, lookup } from '../lib/data'
import { money, when } from '../lib/format'

export function BookingView({ bookingRef, initialEmail }: { bookingRef: string; initialEmail: string }) {
  const [ref, setRef] = React.useState(bookingRef)
  const [email, setEmail] = React.useState(initialEmail)
  const [booking, setBooking] = React.useState<any>(null)
  const [error, setError] = React.useState('')
  const find = async () => { setError(''); const r = await lookup(ref.trim(), email.trim()); if (r.ok) setBooking(r.booking); else setError(r.error) }
  const cancel = async () => { setError(''); const r = await cancelBooking(ref.trim(), email.trim(), crypto.randomUUID()); if (!r.ok) return setError(r.error); await find() }
  React.useEffect(() => {
    const saved = initialEmail || sessionStorage.getItem('tg_email') || ''
    if (bookingRef && saved) { setEmail(saved); void lookup(bookingRef, saved).then((r) => { if (r.ok) setBooking(r.booking) }) }
  }, [])
  return (
    <div className="space-y-4">
      {!booking && (
        <div className="space-y-3">
          {bookingRef && <h1 className="text-xl font-semibold">Your booking {bookingRef}</h1>}
          <Input placeholder="Booking code" value={ref} onChange={(e) => setRef(e.target.value.toUpperCase())} />
          <Input type="email" placeholder="Email used to book" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button className="h-11" onClick={find} disabled={!ref || !email}>Find booking</Button>
        </div>
      )}
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {booking && (
        <section className="space-y-3">
          <header className="flex flex-wrap items-start justify-between gap-2"><div><h1 className="text-xl font-semibold">{booking.tourName}</h1><p className="text-sm text-muted-foreground">{when(booking.startAt, booking.timezone)}</p></div><p className="font-mono text-sm uppercase tracking-wide">{booking.status.replaceAll('_', ' ')}</p></header>
          <p className="text-sm">Booking code <span className="font-mono font-semibold">{booking.bookingRef}</span> · {booking.seats} seats · {money(booking.totalCents, booking.currencyCode)}</p>
          {booking.meetingPoint && <p className="text-sm"><span className="font-medium">Meet at: </span>{booking.meetingPoint.name}, {booking.meetingPoint.address}. {booking.meetingPoint.instructions}</p>}
          <ul className="space-y-1 text-sm">{booking.lines.map((l: any, i: number) => <li key={i}>{l.qty} × {l.name}</li>)}</ul>
          {booking.waivers.length > 0 && <div><h2 className="text-base font-semibold">Waivers</h2><ul className="space-y-1 text-sm">{booking.waivers.map((w: any) => <li key={w.participantId}><Link className="underline" href={`/waiver/${w.token}`}>Sign for {w.fullName}</Link></li>)}</ul></div>}
          {booking.status === 'confirmed' && booking.manageToken && <p className="border-t pt-3 text-sm"><Link className="underline" href={`/manage#${booking.bookingRef}.${booking.manageToken}`}>Change the date or cancel under the policy</Link></p>}
          {booking.status === 'confirmed' && <div className="space-y-2 border-t pt-3"><p className="text-sm">Refund if cancelled now: <span className="font-mono">{money(booking.refundIfCancelledCents, booking.currencyCode)}</span></p><Button className="h-11" variant="outline" onClick={cancel}>Cancel booking</Button></div>}
        </section>
      )}
    </div>
  )
}
