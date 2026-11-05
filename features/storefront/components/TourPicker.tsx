'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { holdSeats, joinWaitlist } from '../lib/data'
import { dayOf, money, when } from '../lib/format'

export function TourPicker({ tour, departures }: { tour: any; departures: any[] }) {
  const router = useRouter()
  const days = React.useMemo(() => new Set(departures.map((d) => dayOf(d.startAt))), [departures])
  const [day, setDay] = React.useState<Date | undefined>()
  const [departureId, setDepartureId] = React.useState<string>('')
  const [qty, setQty] = React.useState<Record<string, number>>({})
  const [addOns, setAddOns] = React.useState<Record<string, number>>({})
  const [promo, setPromo] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const key = React.useRef(crypto.randomUUID())
  const slots = day ? departures.filter((d) => dayOf(d.startAt) === new Intl.DateTimeFormat('en-CA').format(day)) : []
  const selected = departures.find((d) => d.id === departureId)
  const chosen = tour.ticketTypes.filter((t: any) => (qty[t.id] || 0) > 0)
  const total = chosen.reduce((n: number, t: any) => n + t.priceCents * qty[t.id], 0) + tour.addOns.reduce((n: number, a: any) => n + a.priceCents * (addOns[a.id] || 0), 0)

  const reserve = async () => {
    setBusy(true); setError(null)
    const r = await holdSeats({ departureId, tickets: chosen.map((t: any) => ({ id: t.id, qty: qty[t.id] })), addOns: Object.entries(addOns).filter(([, q]) => q > 0).map(([id, q]) => ({ id, qty: q })), promoCode: promo || undefined }, key.current)
    setBusy(false)
    if (!r.ok) { key.current = crypto.randomUUID(); return setError(r.error) }
    router.push(`/checkout/${r.hold.holdId}`)
  }
  // Party larger than what is left (or the departure is full): offer the waitlist instead of a hold.
  const party = chosen.reduce((n: number, t: any) => n + qty[t.id], 0)
  const waitlist = !!selected && party > 0 && party > selected.remaining
  const [lead, setLead] = React.useState({ name: '', email: '', phone: '' })
  const [joined, setJoined] = React.useState<{ link: string; position: number } | null>(null)
  const join = async () => {
    setBusy(true); setError(null)
    const r = await joinWaitlist({ departureId, tickets: chosen.map((t: any) => ({ id: t.id, qty: qty[t.id] })), lead }, key.current)
    setBusy(false)
    if (!r.ok) { key.current = crypto.randomUUID(); return setError(r.error) }
    setJoined({ link: `${window.location.origin}${r.entry.link}`, position: r.entry.position })
  }
  const step = (set: typeof setQty, id: string, delta: number) => set((s) => ({ ...s, [id]: Math.max(0, (s[id] || 0) + delta) }))

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h2 className="text-base font-semibold">Date</h2>
        <Popover>
          <PopoverTrigger asChild><Button variant="outline">{day ? day.toDateString() : 'Choose a date'}</Button></PopoverTrigger>
          <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={day} onSelect={(d) => { setDay(d); setDepartureId('') }} disabled={(d) => !days.has(new Intl.DateTimeFormat('en-CA').format(d))} /></PopoverContent>
        </Popover>
        <div className="flex flex-wrap gap-2">
          {slots.map((d) => <Button key={d.id} variant={departureId === d.id ? 'default' : 'outline'} onClick={() => { setDepartureId(d.id); setJoined(null) }}>{when(d.startAt).split(', ').pop()} · {d.remaining > 0 ? `${d.remaining} left` : 'full, waitlist'}</Button>)}
        </div>
      </section>
      {selected && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Tickets</h2>
          {tour.ticketTypes.map((t: any) => (
            <div key={t.id} className="flex items-center justify-between gap-2"><span className="text-sm">{t.name} · {money(t.priceCents)}</span><span className="flex items-center gap-2"><Button size="sm" variant="outline" aria-label={`Fewer ${t.name}`} onClick={() => step(setQty, t.id, -1)}>−</Button><span className="w-6 text-center font-mono">{qty[t.id] || 0}</span><Button size="sm" variant="outline" aria-label={`More ${t.name}`} onClick={() => step(setQty, t.id, 1)}>+</Button></span></div>
          ))}
          {tour.addOns.length > 0 && <h2 className="pt-2 text-base font-semibold">Add-ons</h2>}
          {tour.addOns.map((a: any) => (
            <div key={a.id} className="flex items-center justify-between gap-2"><span className="text-sm">{a.name} · {money(a.priceCents)}</span><span className="flex items-center gap-2"><Button size="sm" variant="outline" aria-label={`Fewer ${a.name}`} onClick={() => step(setAddOns, a.id, -1)}>−</Button><span className="w-6 text-center font-mono">{addOns[a.id] || 0}</span><Button size="sm" variant="outline" aria-label={`More ${a.name}`} onClick={() => step(setAddOns, a.id, 1)}>+</Button></span></div>
          ))}
          {!waitlist && <Input placeholder="Promo code" value={promo} onChange={(e) => setPromo(e.target.value.toUpperCase())} />}
          {error && <p className="text-sm text-rose-600" role="alert">{error}</p>}
          {!waitlist && <Button className="w-full" disabled={busy || !chosen.length} onClick={reserve}>Hold seats · {money(total)}</Button>}
          {waitlist && !joined && (
            <div className="space-y-2 border-t pt-3" aria-label="Waitlist">
              <h2 className="text-base font-semibold">Join the waitlist</h2>
              <p className="text-sm">{selected.remaining > 0 ? `Only ${selected.remaining} seat${selected.remaining === 1 ? '' : 's'} left for a party of ${party}.` : 'This departure is full.'} If seats free up they are held for the next party on the list, in order, and you get a link to book them. Nothing is charged now.</p>
              <Input aria-label="Your name" placeholder="Your name" value={lead.name} onChange={(e) => setLead({ ...lead, name: e.target.value })} />
              <Input aria-label="Email" type="email" placeholder="Email" value={lead.email} onChange={(e) => setLead({ ...lead, email: e.target.value })} />
              <Input aria-label="Phone" placeholder="Phone (optional)" value={lead.phone} onChange={(e) => setLead({ ...lead, phone: e.target.value })} />
              <Button className="w-full" disabled={busy || !lead.name.trim() || !lead.email.includes('@')} onClick={join}>{busy ? 'Joining…' : `Join the waitlist for ${party}`}</Button>
            </div>
          )}
          {joined && (
            <div className="space-y-2 border-t pt-3" role="status" data-waitlist-joined>
              <p className="font-mono text-xs uppercase tracking-wide text-emerald-700">On the waitlist · position {joined.position}</p>
              <p className="text-sm">Keep this private link. It shows your place and, when seats are held for you, lets you book them:</p>
              <p className="break-all font-mono text-sm"><a className="underline" href={joined.link}>{joined.link}</a></p>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
