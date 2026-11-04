'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { StatusLabel } from '../../components/StatusLabel'
import { dayIn, money, timeIn } from '../../lib/format'
import { refundAction, requestApprovalAction } from '../actions/bookings'

import { STATUSES } from '../statuses'

export function BookingsClient({ rows, counts, active, thresholdCents }: { rows: any[]; counts: Record<string, number>; active: string | null; thresholdCents: number }) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [amount, setAmount] = React.useState('')
  const [reason, setReason] = React.useState('')
  const refund = async (b: any, cancel: boolean) => {
    setError(null); setNotice(null)
    const cents = Math.round(Number(amount || (b.totalCents - b.refundedCents) / 100) * 100)
    try {
      const r = await refundAction(b.id, cents, reason, cancel)
      if (r.success) { setAmount(''); setReason(''); setNotice(`Refunded ${money(cents, b.currencyCode)} on ${b.bookingRef}`); router.refresh(); return }
      if (/over the approval threshold/.test(r.error || '')) {
        // Over the threshold: file (or find) the approval request for this exact booking, amount and reason; no ids to paste.
        const req = await requestApprovalAction(b.id, cents, reason.trim())
        if (req.success) setNotice(`Approval requested for ${money(cents, b.currencyCode)} on ${b.bookingRef}. Another manager approves it under Refund approvals, then press Refund again.`)
        else setError(req.error || 'Could not request approval')
        router.refresh(); return
      }
      setError(r.error || 'Refund failed')
    } catch { setError('Refund failed') }
  }
  return (
    <div className="space-y-3 p-4">
      <div className="overflow-x-auto"><div role="tablist" className="inline-flex gap-1 rounded-lg bg-muted p-1">
        {[null, ...STATUSES].map((s) => (
          <Link key={s || 'all'} role="tab" aria-selected={active === s} href={s ? `/dashboard/platform/bookings?status=${s}` : '/dashboard/platform/bookings'} className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm ${active === s ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>
            {s ? s.replaceAll('_', ' ') : 'all'} <span className="font-mono">{counts[s || 'all'] ?? 0}</span>
          </Link>
        ))}
      </div></div>
      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
      {notice && <p role="status" className="font-mono text-xs uppercase tracking-wide text-emerald-700">{notice}</p>}
      <ul className="space-y-2">
        {rows.map((b) => (
          <li key={b.id} className="rounded-xl border p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0"><p className="truncate text-sm font-semibold">{b.guestName} <span className="font-mono text-muted-foreground">{b.bookingRef}</span></p><p className="truncate text-sm text-muted-foreground">{b.departure?.tour?.name} · {b.departure && `${dayIn(b.departure.startAt)} ${timeIn(b.departure.startAt)}`}</p></div>
              <StatusLabel status={b.status} />
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-mono">{money(b.totalCents, b.currencyCode)}{b.refundedCents ? ` (−${money(b.refundedCents, b.currencyCode)})` : ''} · {b.seats} seats · {b.source}</span>
              {['confirmed', 'checked_in', 'completed', 'no_show', 'partially_refunded'].includes(b.status) && (
                <Popover>
                  <PopoverTrigger asChild><Button size="sm" variant="outline">Refund</Button></PopoverTrigger>
                  <PopoverContent className="w-72 space-y-2">
                    <p className="text-sm text-muted-foreground">Refunds over {money(thresholdCents, 'USD')} need another manager's approval.</p>
                    <Input inputMode="decimal" placeholder={`Amount (max ${((b.totalCents - b.refundedCents) / 100).toFixed(2)})`} value={amount} onChange={(e) => setAmount(e.target.value)} />
                    <Input placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
                    <Button size="sm" className="w-full" disabled={!reason.trim()} onClick={() => refund(b, false)}>Refund</Button>
                    <Button size="sm" variant="outline" className="w-full" disabled={!reason.trim()} onClick={() => refund(b, true)}>Refund and cancel</Button>
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </li>
        ))}
        {!rows.length && <li className="text-sm text-muted-foreground">No bookings.</li>}
      </ul>
    </div>
  )
}
