'use client'

import React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cancelBooking, lookup } from '../lib/data'
import { money, when } from '../lib/format'

const STATUS: Record<string, string> = { confirmed: 'Booking confirmed', pending_payment: 'Waiting for payment', cancelled: 'Cancelled', checked_in: 'Checked in', completed: 'Completed', no_show: 'Marked as no-show', partially_refunded: 'Partly refunded', refunded: 'Refunded' }

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
    <div className="max-w-xl space-y-4">
      {!booking && (
        <div className="space-y-3">
          {bookingRef && <><h1 className="text-2xl font-extrabold tracking-tight">Booking {bookingRef}</h1><p className="text-sm text-[#0b2e1f]/75">Enter the email used to book to open it.</p></>}
          <Input aria-label="Booking code" placeholder="Booking code" value={ref} onChange={(e) => setRef(e.target.value.toUpperCase())} />
          <Input aria-label="Email used to book" type="email" autoComplete="email" placeholder="Email used to book" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button className="h-11" onClick={find} disabled={!ref || !email}>Find booking</Button>
        </div>
      )}
      {error && <p className="text-sm text-rose-700">{error}</p>}
      {booking && (
        <section className="space-y-3">
          <header><p className="text-sm font-semibold" data-booking-status={booking.status}>{STATUS[booking.status] || booking.status.replaceAll('_', ' ')}</p><h1 className="mt-1 text-2xl font-extrabold tracking-tight">{booking.tourName}</h1><p className="mt-1 text-sm">{when(booking.startAt, booking.timezone)}</p></header>
          <p className="text-sm">Booking code <span className="font-semibold">{booking.bookingRef}</span> · {booking.seats} {booking.seats === 1 ? 'seat' : 'seats'} · {money(booking.totalCents, booking.currencyCode)}</p>
          {booking.meetingPoint && <p className="text-sm"><span className="font-medium">Meet at: </span>{booking.meetingPoint.name}, {booking.meetingPoint.address}. {booking.meetingPoint.instructions}{booking.meetingPoint.mapLink && <> <a className="underline underline-offset-4" href={booking.meetingPoint.mapLink} target="_blank" rel="noreferrer">Open map</a></>}</p>}
          <ul className="space-y-1 text-sm">{booking.lines.map((l: any, i: number) => <li key={i}>{l.qty} × {l.name}</li>)}</ul>
          {booking.participants?.length > 0 && <div><h2 className="text-base font-bold">Guests</h2><ul className="space-y-1 text-sm">{booking.participants.map((p: any) => <li key={p.participantId}>{p.fullName}{p.waiverStatus === 'signed' ? ' · waiver signed' : ''}{p.checkInStatus === 'checked_in' ? ' · checked in' : ''}</li>)}</ul></div>}
          {booking.waivers.length > 0 && <div><h2 className="text-base font-bold">Waivers</h2><ul className="space-y-1 text-sm">{booking.waivers.map((w: any) => <li key={w.participantId}><Link className="underline" href={`/waiver/${w.token}`}>Sign for {w.fullName}</Link></li>)}</ul></div>}
          {booking.status === 'confirmed' && booking.manageToken && <p className="border-t pt-3 text-sm"><Link className="inline-flex min-h-11 items-center underline" href={`/manage#${booking.bookingRef}.${booking.manageToken}`}>Change the date or cancel under the policy</Link></p>}
          {booking.status === 'confirmed' && <div className="space-y-2 border-t pt-3"><p className="text-sm">Refund if cancelled now: <span className="font-mono">{money(booking.refundIfCancelledCents, booking.currencyCode)}</span></p><Button className="h-11" variant="outline" onClick={cancel}>Cancel booking</Button></div>}
        </section>
      )}
    </div>
  )
}
