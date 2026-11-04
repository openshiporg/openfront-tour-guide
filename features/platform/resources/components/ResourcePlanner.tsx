'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { dayIn, timeIn } from '../../lib/format'
import { assignResourceAction, unassignResourceAction } from '../actions/resources'

type Resource = { id: string; name: string; kind: string; seats: number; quantity: number; status: string }
type Departure = { id: string; startAt: string; endAt: string; capacity: number; tourName: string; kind: string; assignment: { quantity: number; resource: Resource | null } | null }

export function ResourcePlanner({ resources, departures }: { resources: Resource[]; departures: Departure[] }) {
  const router = useRouter()
  const [pick, setPick] = React.useState<Record<string, string>>({})
  const [qty, setQty] = React.useState<Record<string, string>>({})
  const [busy, setBusy] = React.useState<string | null>(null)
  const [shown, setShown] = React.useState(12)
  const [editing, setEditing] = React.useState<Record<string, boolean>>({})
  const [onlyMissing, setOnlyMissing] = React.useState(false)
  // Chronological, like the calendar; the toggle narrows it to departures still needing a resource.
  const ordered = React.useMemo(() => departures.filter((d) => !onlyMissing || !d.assignment).sort((a, b) => a.startAt.localeCompare(b.startAt)), [departures, onlyMissing])
  const missing = departures.filter((d) => !d.assignment).length
  const [message, setMessage] = React.useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const act = async (id: string, work: () => Promise<{ success: boolean; error?: string }>, done: string) => {
    setBusy(id); setMessage(null)
    try { const r = await work(); if (r.success) { setMessage({ kind: 'ok', text: done }); setEditing((e) => ({ ...e, [id]: false })); setPick((x) => ({ ...x, [id]: '' })); router.refresh() } else setMessage({ kind: 'error', text: r.error || 'Could not save' }) }
    catch { setMessage({ kind: 'error', text: 'Could not save' }) } finally { setBusy(null) }
  }
  if (!departures.length) return <p className="p-4 text-sm text-muted-foreground">No upcoming departures need a vehicle, boat or equipment.</p>
  return (
    <section className="min-w-0 space-y-3 p-4 pb-24" aria-label="Resource assignment">
      <h2 className="font-semibold">Assign vehicles, boats and equipment</h2>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">{missing} of {departures.length} departures need a resource</p>
        <Button size="sm" variant={onlyMissing ? 'default' : 'outline'} aria-pressed={onlyMissing} onClick={() => { setOnlyMissing(!onlyMissing); setShown(12) }}>Only needing a resource</Button>
      </div>
      {message && <p role={message.kind === 'ok' ? 'status' : 'alert'} className={message.kind === 'ok' ? 'font-mono text-xs uppercase tracking-wide text-emerald-700' : 'text-sm text-rose-600'}>{message.text}</p>}
      <ul className="space-y-2">
        {ordered.slice(0, shown).map((d) => {
          const options = resources.filter((r) => r.kind === d.kind && r.status === 'active')
          const chosen = options.find((r) => r.id === pick[d.id])
          const q = Number(qty[d.id] || 1)
          return (
            <li key={d.id} className="min-w-0 rounded-xl border p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0"><p className="truncate font-semibold">{d.tourName}</p><p className="text-muted-foreground">{dayIn(d.startAt)} · {timeIn(d.startAt)} – {timeIn(d.endAt)} · needs {d.kind}</p></div>
                {d.assignment?.resource
                  ? <span className="font-mono text-xs uppercase tracking-wide text-emerald-700">{d.assignment.resource.name} × {d.assignment.quantity} · {d.capacity} seats</span>
                  : <span className="font-mono text-xs uppercase tracking-wide text-amber-700">No {d.kind} assigned</span>}
              </div>
              {d.assignment && !editing[d.id] ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing({ ...editing, [d.id]: true })}>Change</Button>
                  <Button size="sm" variant="outline" disabled={busy === d.id} onClick={() => act(d.id, () => unassignResourceAction(d.id), 'Resource removed')}>Remove</Button>
                </div>
              ) : (
                <div className="mt-2 grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_5rem_auto_auto]">
                  <Select value={pick[d.id] || ''} onValueChange={(v) => setPick({ ...pick, [d.id]: v })}>
                    <SelectTrigger aria-label={`Resource for ${d.tourName}`}><SelectValue placeholder={options.length ? `Choose ${d.kind}` : `No active ${d.kind}`} /></SelectTrigger>
                    <SelectContent>{options.map((r) => <SelectItem key={r.id} value={r.id}>{r.name} ({r.seats} seats, {r.quantity} available)</SelectItem>)}</SelectContent>
                  </Select>
                  <Input aria-label="Quantity" inputMode="numeric" value={qty[d.id] ?? '1'} onChange={(e) => setQty({ ...qty, [d.id]: e.target.value })} />
                  {/* Standard primary button; it only looks disabled while no resource is chosen. */}
                  <Button size="sm" disabled={busy === d.id || !chosen || !Number.isInteger(q) || q < 1} onClick={() => act(d.id, () => assignResourceAction(d.id, chosen!.id, q), `${chosen!.name} assigned`)}>{d.assignment ? 'Replace' : 'Assign'}</Button>
                  {d.assignment && <Button size="sm" variant="ghost" onClick={() => setEditing({ ...editing, [d.id]: false })}>Cancel</Button>}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {shown < ordered.length && <Button variant="outline" size="sm" onClick={() => setShown(shown + 12)}>Show more ({ordered.length - shown} left)</Button>}
    </section>
  )
}
