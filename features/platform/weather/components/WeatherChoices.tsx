'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { StatusLabel } from '../../components/StatusLabel'
import { dayIn, money, timeIn } from '../../lib/format'
import { refundAction, requestApprovalAction } from '../../bookings/actions/bookings'
import { weatherRebookAction } from '../actions/weather'

const field = 'h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm'

// One row per guest still waiting for a choice. Rebook moves them to another departure of the same tour at the price they paid.
// Full refund uses the normal refund path, so a refund over the threshold files an approval request and waits for a second manager.
export function WeatherChoices({ departures, thresholdCents }: { departures: any[]; thresholdCents: number }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState<string | null>(null)
  const [pick, setPick] = React.useState<Record<string, string>>({})
  const [message, setMessage] = React.useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const rebook = async (b: any) => {
    setBusy(b.id); setMessage(null)
    try { const r: any = await weatherRebookAction(b.id, pick[b.id]); if (r.success) { setMessage({ kind: 'ok', text: `${b.guestName} rebooked as ${r.data.rebookWeatherBooking.bookingRef}` }); router.refresh() } else setMessage({ kind: 'error', text: r.error || 'Could not rebook' }) }
    catch { setMessage({ kind: 'error', text: 'Could not rebook' }) } finally { setBusy(null) }
  }
  const refund = async (b: any, d: any) => {
    setBusy(b.id); setMessage(null)
    const reason = `Weather cancellation: ${d.reason || 'weather'}`.slice(0, 500)
    try {
      const r: any = await refundAction(b.id, b.balanceCents, reason, true)
      if (r.success) { setMessage({ kind: 'ok', text: `Refunded ${money(b.balanceCents, b.currencyCode)} to ${b.guestName} (${b.bookingRef})` }); router.refresh(); return }
      if (/over the approval threshold/.test(r.error || '')) {
        const req: any = await requestApprovalAction(b.id, b.balanceCents, reason)
        setMessage(req.success ? { kind: 'ok', text: `Approval requested for ${money(b.balanceCents, b.currencyCode)} on ${b.bookingRef}. Another manager approves it under Bookings, then press Full refund again.` } : { kind: 'error', text: req.error || 'Could not request approval' })
        return
      }
      setMessage({ kind: 'error', text: r.error || 'Refund failed' })
    } catch { setMessage({ kind: 'error', text: 'Refund failed' }) } finally { setBusy(null) }
  }
  if (!departures.length) return <p className="p-4 text-sm text-muted-foreground">No weather-cancelled departures. Cancel one from Today with Weather cancel.</p>
  return (
    <div className="space-y-4 p-4">
      <p className="text-sm text-muted-foreground">Contact each guest yourself. Rebooking needs a same-tour departure at the price they paid; a full refund over {money(thresholdCents, 'USD')} needs another manager&apos;s approval.</p>
      {message && <p role={message.kind === 'ok' ? 'status' : 'alert'} className={message.kind === 'ok' ? 'font-mono text-xs uppercase tracking-wide text-emerald-700' : 'text-sm text-rose-600'}>{message.text}</p>}
      {departures.map((d) => (
        <section key={d.id} className="min-w-0 space-y-2" aria-label={`${d.tourName} weather cancellation`}>
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="min-w-0 truncate font-semibold">{d.tourName} · {dayIn(d.startAt)} {timeIn(d.startAt)}</h2><StatusLabel status="weather_cancelled" /></div>
          <p className="break-words text-sm text-muted-foreground">Reason: {d.reason || 'not recorded'} · {d.bookings.length} waiting · {d.resolved} resolved</p>
          <ul className="space-y-2">
            {d.bookings.map((b: any) => (
              <li key={b.id} className="min-w-0 rounded-xl border p-3 text-sm" data-booking={b.bookingRef}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0"><p className="truncate font-semibold">{b.guestName}</p><p className="break-words text-muted-foreground">{b.bookingRef} · {b.seats} seat{b.seats === 1 ? '' : 's'} · {money(b.balanceCents, b.currencyCode)}</p></div>
                </div>
                <div className="mt-2 grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                  {b.canRebook ? (
                    <select aria-label={`Rebook ${b.guestName} to`} className={field} value={pick[b.id] || ''} onChange={(e) => setPick({ ...pick, [b.id]: e.target.value })}>
                      <option value="">{b.options.length ? 'Rebook to…' : 'No departure with room'}</option>
                      {b.options.map((o: any) => <option key={o.id} value={o.id}>{dayIn(o.startAt)} {timeIn(o.startAt)} · {o.remaining} left</option>)}
                    </select>
                  ) : <p className="text-muted-foreground">Reseller booking: refund, or re-plan with the reseller.</p>}
                  {b.canRebook && <Button size="sm" disabled={busy === b.id || !pick[b.id]} onClick={() => rebook(b)}>Rebook</Button>}
                  <Button size="sm" variant="outline" disabled={busy === b.id} onClick={() => refund(b, d)}>Full refund</Button>
                </div>
              </li>
            ))}
            {!d.bookings.length && <li className="text-sm text-muted-foreground">Every guest on this departure has been rebooked or refunded.</li>}
          </ul>
        </section>
      ))}
    </div>
  )
}
