'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { holdSeats } from '../lib/data'
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
          {slots.map((d) => <Button key={d.id} variant={departureId === d.id ? 'default' : 'outline'} disabled={d.remaining < 1} onClick={() => setDepartureId(d.id)}>{when(d.startAt).split(', ').pop()} · {d.remaining} left</Button>)}
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
          <Input placeholder="Promo code" value={promo} onChange={(e) => setPromo(e.target.value.toUpperCase())} />
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <Button className="w-full" disabled={busy || !chosen.length} onClick={reserve}>Hold seats · {money(total)}</Button>
        </section>
      )}
    </div>
  )
}
