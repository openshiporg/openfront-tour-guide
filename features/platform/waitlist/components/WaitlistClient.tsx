'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { StatusLabel } from '../../components/StatusLabel'
import { dayIn, money, timeIn } from '../../lib/format'
import { addToWaitlistAction, bookWaitlistOfferAction, withdrawWaitlistAction } from '../actions/waitlist'

type Msg = { kind: 'ok' | 'error'; text: string } | null

function AddCaller({ departures, onDone }: { departures: any[]; onDone: (m: Msg, link?: string) => void }) {
  const [departureId, setDeparture] = React.useState(''), [ticketId, setTicket] = React.useState(''), [qty, setQty] = React.useState('1')
  const [name, setName] = React.useState(''), [email, setEmail] = React.useState(''), [phone, setPhone] = React.useState(''), [busy, setBusy] = React.useState(false)
  const attempt = React.useRef<{ key: string; fp: string } | null>(null)
  const d = departures.find((x) => x.id === departureId)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true)
    const input = { departureId, tickets: [{ id: ticketId, qty: Number(qty) }], lead: { name, email, phone } }
    const fp = JSON.stringify(input)
    if (!attempt.current || attempt.current.fp !== fp) attempt.current = { key: crypto.randomUUID(), fp }
    try {
      const r: any = await addToWaitlistAction(input, attempt.current.key)
      if (r.success) { attempt.current = null; setName(''); setEmail(''); setPhone(''); onDone({ kind: 'ok', text: `${r.entry.seats} seat${r.entry.seats === 1 ? '' : 's'} added at position ${r.entry.position}` }, `${window.location.origin}${r.entry.link}`) }
      else onDone({ kind: 'error', text: r.error || 'Could not add to the waitlist' })
    } catch { onDone({ kind: 'error', text: 'Could not add to the waitlist. Press Add again: the same request is safe to repeat.' }) } finally { setBusy(false) }
  }
  return (
    <details className="rounded-xl border p-3"><summary className="cursor-pointer text-sm font-medium">Add a phone caller</summary>
      <form onSubmit={submit} className="mt-3 grid min-w-0 gap-3 md:grid-cols-2">
        <Select value={departureId} onValueChange={(v) => { setDeparture(v); setTicket('') }}><SelectTrigger className="w-full min-w-0"><SelectValue placeholder="Departure" /></SelectTrigger><SelectContent>{departures.map((x) => <SelectItem key={x.id} value={x.id}>{x.tour.name} · {dayIn(x.startAt)} {timeIn(x.startAt)} · {x.remaining} left</SelectItem>)}</SelectContent></Select>
        <Select value={ticketId} onValueChange={setTicket}><SelectTrigger className="w-full min-w-0"><SelectValue placeholder="Ticket type" /></SelectTrigger><SelectContent>{d?.tour.ticketTypes.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name} · {money(t.priceCents)}</SelectItem>)}</SelectContent></Select>
        <Input aria-label="Party size" inputMode="numeric" placeholder="Party size" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))} />
        <Input aria-label="Guest name" placeholder="Guest name" required value={name} onChange={(e) => setName(e.target.value)} />
        <Input aria-label="Guest email" placeholder="Guest email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input aria-label="Guest phone" placeholder="Guest phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Button disabled={busy || !ticketId || !(Number(qty) > 0)}>{busy ? 'Adding…' : 'Add to waitlist'}</Button>
      </form>
    </details>
  )
}

function BookOffer({ row, onDone }: { row: any; onDone: (m: Msg) => void }) {
  const router = useRouter()
  const [names, setNames] = React.useState(''), [busy, setBusy] = React.useState(false), [open, setOpen] = React.useState(false)
  const attempt = React.useRef<{ key: string; fp: string } | null>(null)
  const list = names.split('\n').map((n) => n.trim()).filter(Boolean)
  const book = async () => {
    setBusy(true)
    const fp = JSON.stringify(list)
    if (!attempt.current || attempt.current.fp !== fp) attempt.current = { key: crypto.randomUUID(), fp }
    try {
      const r: any = await bookWaitlistOfferAction(row.id, list, attempt.current.key)
      if (r.success) { setOpen(false); onDone({ kind: 'ok', text: `Booked ${r.booking.bookingRef} · ${money(r.booking.totalCents, r.booking.currencyCode)} cash` }); router.refresh() }
      else onDone({ kind: 'error', text: r.error || 'Could not book the offer' })
    } catch { onDone({ kind: 'error', text: 'Could not confirm. Press Book again: the same request is safe to repeat.' }) } finally { setBusy(false) }
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><Button size="sm">Book for cash</Button></PopoverTrigger>
      <PopoverContent className="w-72 space-y-2">
        <p className="text-sm text-muted-foreground">Books the {row.seats} held seat{row.seats === 1 ? '' : 's'} at the held price. Cash collected in person.</p>
        <label className="block text-sm">Participants (one per line)<textarea aria-label="Participants" className="mt-1 w-full rounded-md border bg-background p-2 text-sm" rows={Math.min(6, row.seats + 1)} value={names} onChange={(e) => setNames(e.target.value)} /></label>
        <Button size="sm" className="w-full" disabled={busy || list.length !== row.seats} onClick={book}>{busy ? 'Booking…' : `Book ${row.seats} seat${row.seats === 1 ? '' : 's'}`}</Button>
      </PopoverContent>
    </Popover>
  )
}

function Withdraw({ row, onDone }: { row: any; onDone: (m: Msg) => void }) {
  const router = useRouter()
  const [reason, setReason] = React.useState(''), [busy, setBusy] = React.useState(false), [open, setOpen] = React.useState(false)
  const go = async () => {
    setBusy(true)
    try {
      const r: any = await withdrawWaitlistAction(row.id, reason.trim())
      if (r.success) { setOpen(false); setReason(''); onDone({ kind: 'ok', text: `Removed ${row.guestName} from the waitlist` }); router.refresh() }
      else onDone({ kind: 'error', text: r.error || 'Could not remove' })
    } finally { setBusy(false) }
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><Button size="sm" variant="outline">Remove</Button></PopoverTrigger>
      <PopoverContent className="w-72 space-y-2">
        <p className="text-sm text-muted-foreground">{row.status === 'offered' ? 'The held seats are released to the next party.' : 'The guest leaves the waitlist.'}</p>
        <Input placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        <Button size="sm" className="w-full" disabled={busy || !reason.trim()} onClick={go}>{busy ? 'Removing…' : 'Remove from waitlist'}</Button>
      </PopoverContent>
    </Popover>
  )
}

export function WaitlistClient({ rows, departures }: { rows: any[]; departures: any[] }) {
  const [msg, setMsg] = React.useState<Msg>(null)
  const [link, setLink] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState<string | null>(null)
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); setCopied(text) } catch { setCopied(null) } }
  const done = (m: Msg, l?: string) => { setMsg(m); setLink(l || null); setCopied(null) }
  const groups = rows.reduce((acc: Record<string, any[]>, r) => { (acc[r.departureId] ||= []).push(r); return acc }, {})
  return (
    <div className="space-y-3">
      <AddCaller departures={departures} onDone={done} />
      {msg && <p role={msg.kind === 'ok' ? 'status' : 'alert'} className={msg.kind === 'ok' ? 'font-mono text-xs uppercase tracking-wide text-emerald-700' : 'text-sm text-rose-600'}>{msg.text}</p>}
      {link && (
        <div className="space-y-2 rounded-xl border p-3 text-sm" data-waitlist-link>
          <p>Give the guest this private link. It shows their place and lets them book when seats are held:</p>
          <p className="break-all font-mono">{link}</p>
          <Button size="sm" variant="outline" onClick={() => copy(link)}>{copied === link ? 'Copied' : 'Copy link'}</Button>
        </div>
      )}
      {Object.entries(groups).map(([depId, list]) => (
        <section key={depId} className="space-y-2" aria-label={`${list[0].tourName} ${dayIn(list[0].startAt)}`}>
          <h2 className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold"><span className="min-w-0">{list[0].tourName} · {dayIn(list[0].startAt)} {timeIn(list[0].startAt)}</span><StatusLabel status={list[0].departureStatus} /></h2>
          <ul className="space-y-2">
            {list.map((r: any) => (
              <li key={r.id} className="min-w-0 rounded-xl border p-3 text-sm" data-waitlist={r.status}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 break-words font-semibold">{r.position ? `${r.position}. ` : ''}{r.guestName} <span className="font-normal text-muted-foreground">· party of {r.seats} · {r.source}</span></p>
                  <StatusLabel status={r.status} />
                </div>
                <p className="mt-1 break-words text-muted-foreground">{r.guestEmail}{r.guestPhone ? ` · ${r.guestPhone}` : ''}</p>
                {r.status === 'offered' && r.offerExpiresAt && <p>Seats held until {dayIn(r.offerExpiresAt)} {timeIn(r.offerExpiresAt)}</p>}
                {r.bookingRef && <p>Booked as <span className="font-mono">{r.bookingRef}</span></p>}
                {r.note && <p className="break-words text-muted-foreground">{r.note}</p>}
                {r.link && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {r.status === 'offered' && <BookOffer row={r} onDone={done} />}
                    <Button size="sm" variant="outline" onClick={() => copy(`${window.location.origin}${r.link}`)}>{copied?.endsWith(r.link) ? 'Copied' : 'Copy guest link'}</Button>
                    <Withdraw row={r} onDone={done} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {!rows.length && <p className="text-sm text-muted-foreground">Nobody is waiting.</p>}
    </div>
  )
}
