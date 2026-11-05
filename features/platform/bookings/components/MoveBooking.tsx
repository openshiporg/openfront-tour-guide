'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { dayIn, timeIn } from '../../lib/format'
import { getMoveOptionsAction, moveBookingAction } from '../actions/bookings'

type Option = { id: string; startAt: string; remaining: number }

// Phone change of date: same tour, same price, room for the party. The booking, payment, participants and guest link stay.
export function MoveBooking({ booking, onDone }: { booking: { id: string; bookingRef: string }; onDone: (msg: { kind: 'ok' | 'error'; text: string }) => void }) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [options, setOptions] = React.useState<Option[] | null>(null)
  const [target, setTarget] = React.useState<string | null>(null)
  const [reason, setReason] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  // One key per (booking, target, reason): a retry after a timeout replays the same move instead of failing as "already changed".
  const key = React.useMemo(() => `move:${booking.id}:${target}:${reason.trim()}:${Math.random().toString(36).slice(2)}`, [booking.id, target, reason])
  const load = async () => {
    setOptions(null); setTarget(null)
    const r = await getMoveOptionsAction(booking.id)
    setOptions(r?.canMove ? r.options : [])
  }
  const move = async () => {
    if (!target) return
    setBusy(true)
    try {
      const r: any = await moveBookingAction(booking.id, target, reason.trim(), key)
      if (r.success) { setOpen(false); setReason(''); onDone({ kind: 'ok', text: `Moved ${booking.bookingRef} to ${dayIn(r.startAt)} ${timeIn(r.startAt)}` }); router.refresh() }
      else onDone({ kind: 'error', text: r.error || 'Could not move the booking' })
    } catch { onDone({ kind: 'error', text: 'Could not move the booking' }) } finally { setBusy(false) }
  }
  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) load() }}>
      <PopoverTrigger asChild><Button size="sm" variant="outline">Move</Button></PopoverTrigger>
      <PopoverContent className="w-72 space-y-2">
        <p className="text-sm text-muted-foreground">Same tour, same price. The booking code, payment and guest link stay.</p>
        {options === null && <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">Loading departures</p>}
        {options && !options.length && <p className="text-sm">No departure at the same price has room.</p>}
        {options && options.length > 0 && (
          <div role="listbox" aria-label="Departures" className="max-h-48 space-y-1 overflow-y-auto">
            {options.map((o) => (
              <button key={o.id} type="button" role="option" aria-selected={target === o.id} onClick={() => setTarget(o.id)}
                className={`flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left text-sm ${target === o.id ? 'border-foreground bg-muted' : ''}`}>
                <span>{dayIn(o.startAt)} {timeIn(o.startAt)}</span><span className="font-mono text-xs">{o.remaining} left</span>
              </button>
            ))}
          </div>
        )}
        <Input placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        <Button size="sm" className="w-full" disabled={!target || !reason.trim() || busy} onClick={move}>{busy ? 'Moving…' : 'Move booking'}</Button>
      </PopoverContent>
    </Popover>
  )
}
