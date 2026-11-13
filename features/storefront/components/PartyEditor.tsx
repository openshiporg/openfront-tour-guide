'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export type PartyPerson = { id: string; fullName: string; ticket?: string; checkedIn?: boolean }
export type PartyTicket = { id: string; name: string; unitPriceCents: number }
export type PartyDraft = { keep: string[]; add: { ticketTypeId: string; fullName: string; age?: number | null }[] }

// Who stays (checkboxes) and who is added (ticket, name, age). Shared by the guest manage page and the dashboard. The parent prices
// the draft; this only edits it. A checked-in guest cannot be removed.
export function PartyEditor({ people, tickets, money, onChange }: { people: PartyPerson[]; tickets: PartyTicket[]; money: (c: number) => string; onChange: (d: PartyDraft) => void }) {
  const [keep, setKeep] = React.useState<string[]>(people.map((p) => p.id))
  const [add, setAdd] = React.useState<{ ticketTypeId: string; fullName: string; age: string }[]>([])
  React.useEffect(() => {
    onChange({ keep, add: add.filter((a) => a.fullName.trim()).map((a) => ({ ticketTypeId: a.ticketTypeId, fullName: a.fullName.trim(), age: a.age.trim() ? Number(a.age) : null })) })
  }, [keep, add]) // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (id: string) => setKeep((k) => (k.includes(id) ? k.filter((x) => x !== id) : [...k, id]))
  const set = (i: number, patch: Partial<{ ticketTypeId: string; fullName: string; age: string }>) => setAdd((a) => a.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  return (
    <div className="space-y-3">
      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">Who is coming</legend>
        {people.map((p) => (
          <label key={p.id} className="flex min-w-0 items-center gap-3 rounded-lg border px-3 py-2 text-sm">
            <input type="checkbox" checked={keep.includes(p.id)} disabled={p.checkedIn} onChange={() => toggle(p.id)} aria-label={`Keep ${p.fullName}`} />
            <span className="min-w-0 flex-1 truncate">{p.fullName}</span>
            {p.ticket && <span className="shrink-0 text-muted-foreground">{p.ticket}</span>}
            {p.checkedIn && <span className="shrink-0 font-mono text-xs uppercase tracking-wide">checked in</span>}
          </label>
        ))}
      </fieldset>
      {add.map((a, i) => (
        <div key={i} className="space-y-2 rounded-lg border p-3" data-added-person>
          <select aria-label="Ticket" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={a.ticketTypeId} onChange={(e) => set(i, { ticketTypeId: e.target.value })}>
            {tickets.map((t) => <option key={t.id} value={t.id}>{t.name} · {money(t.unitPriceCents)}</option>)}
          </select>
          <div className="grid grid-cols-[1fr_5rem] gap-2">
            <Input placeholder="Full name" value={a.fullName} onChange={(e) => set(i, { fullName: e.target.value })} />
            <Input inputMode="numeric" placeholder="Age" value={a.age} onChange={(e) => set(i, { age: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
          </div>
          <button type="button" className="h-11 text-sm underline" onClick={() => setAdd((x) => x.filter((_, j) => j !== i))}>Remove this person</button>
        </div>
      ))}
      {tickets.length > 0 && <Button className="h-11" type="button" variant="outline" onClick={() => setAdd((x) => [...x, { ticketTypeId: tickets[0].id, fullName: '', age: '' }])}>Add a person</Button>}
    </div>
  )
}

// One line per money outcome of a priced change.
export function PartyQuoteSummary({ q, money }: { q: any; money: (c: number) => string }) {
  return (
    <div className="space-y-1 rounded-lg border p-3 text-sm" data-party-quote>
      <p>{q.seatsBefore} → {q.seats} {q.seats === 1 ? 'person' : 'people'} · new total <span className="font-mono">{money(q.newTotalCents)}</span></p>
      {q.collectCents > 0 && <p>To pay now: <span className="font-mono font-semibold">{money(q.collectCents)}</span></p>}
      {q.refundCents > 0 && <p>To refund: <span className="font-mono font-semibold">{money(q.refundCents)}</span></p>}
      {q.keptCents > 0 && <p className="text-muted-foreground">{money(q.keptCents)} of the removed amount is kept under the cancellation policy.</p>}
      {q.collectCents === 0 && q.refundCents === 0 && q.keptCents === 0 && <p className="text-muted-foreground">No price difference.</p>}
      {!q.roomForAdded && <p className="text-rose-600">This departure does not have room for the people added.</p>}
    </div>
  )
}
