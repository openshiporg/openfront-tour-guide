'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createOperatorBooking } from '../actions/bookings'
import { dayIn, timeIn, money } from '../../lib/format'

export function OperatorBooking({ departures, channels }: { departures: any[]; channels: any[] }) {
  const router = useRouter()
  const [departureId, setDeparture] = useState(''), [ticketId, setTicket] = useState(''), [source, setSource] = useState('phone'), [channelId, setChannel] = useState('')
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [phone, setPhone] = useState(''), [names, setNames] = useState(''), [ages, setAges] = useState('')
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  const departure = departures.find(d => d.id === departureId)
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMessage('')
    const people = names.split('\n').map(n => n.trim()).filter(Boolean), ageValues = ages.split(',')
    try {
      const result = await createOperatorBooking({ departureId, source, channelId: source === 'reseller' ? channelId : undefined, paymentMethod: 'cash', tickets: [{ id: ticketId, qty: people.length }], lead: { name, email, phone }, participants: people.map((fullName, index) => ({ ticketTypeId: ticketId, fullName, ...(ageValues[index]?.trim() ? { age: Number(ageValues[index]) } : {}) })) })
      if (!result.success) setMessage(result.error || 'Booking failed')
      else { setMessage(`Confirmed ${(result.data as any)?.createChannelBooking?.bookingRef}`); setNames(''); router.refresh() }
    } catch { setMessage('Booking failed') } finally { setBusy(false) }
  }
  return <details className="rounded-xl border p-3"><summary className="cursor-pointer text-sm font-medium">Phone / walk-up booking</summary>
    <form onSubmit={submit} className="mt-3 grid min-w-0 gap-3 md:grid-cols-2">
      <Select value={departureId} onValueChange={v => { setDeparture(v); setTicket('') }}><SelectTrigger className="w-full min-w-0"><SelectValue placeholder="Departure" /></SelectTrigger><SelectContent>{departures.map(d => <SelectItem key={d.id} value={d.id}>{d.tour.name} · {dayIn(d.startAt)} {timeIn(d.startAt)}</SelectItem>)}</SelectContent></Select>
      <Select value={ticketId} onValueChange={setTicket}><SelectTrigger><SelectValue placeholder="Ticket type" /></SelectTrigger><SelectContent>{departure?.tour.ticketTypes.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name} · {money(t.priceCents)}</SelectItem>)}</SelectContent></Select>
      <Select value={source} onValueChange={setSource}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['phone', 'walk_up', 'reseller'].map(s => <SelectItem key={s} value={s}>{s.replaceAll('_', ' ')}</SelectItem>)}</SelectContent></Select>
      {source === 'reseller' && <Select value={channelId} onValueChange={setChannel}><SelectTrigger><SelectValue placeholder="Channel" /></SelectTrigger><SelectContent>{channels.map(c => <SelectItem key={c.id} value={c.id}>{c.name} · {c.paymentModel.replaceAll('_', ' ')}</SelectItem>)}</SelectContent></Select>}
      <Input aria-label="Lead name" placeholder="Lead name" required value={name} onChange={e => setName(e.target.value)} />
      <Input aria-label="Lead email" placeholder="Lead email" type="email" required value={email} onChange={e => setEmail(e.target.value)} />
      <Input aria-label="Lead phone" placeholder="Lead phone" value={phone} onChange={e => setPhone(e.target.value)} />
      <Input aria-label="Participant ages" placeholder="Ages, comma separated" value={ages} onChange={e => setAges(e.target.value)} />
      <label className="text-sm">Participants (one per line)<textarea className="mt-1 w-full rounded-md border bg-background p-2 text-sm" required value={names} onChange={e => setNames(e.target.value)} /></label>
      <div className="space-y-2"><p className="text-sm">Cash collected in person. Channel-collected bookings are invoiced to the reseller. No card charge is made.</p><Button disabled={busy || !ticketId || (source === 'reseller' && !channelId)}>{busy ? 'Booking…' : 'Confirm booking'}</Button></div>
      {message && <p role="status" className="break-words text-sm md:col-span-2">{message}</p>}
    </form>
  </details>
}
