'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { money } from '../../lib/format'
import { approveRefundAction } from '../actions/bookings'

type Row = { id: string; amount: number; reason: string; status: string; expiresAt: string; requestedBy?: { id: string; name: string } | null; approvedBy?: { name: string } | null; booking: { bookingRef: string; guestName: string; currencyCode: string } | null }

export function RefundApprovals({ rows, me }: { rows: Row[]; me: string | null }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState<string | null>(null)
  const [message, setMessage] = React.useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  if (!rows.length) return null
  const approve = async (r: Row) => {
    setBusy(r.id); setMessage(null)
    try {
      const result = await approveRefundAction(r.id)
      if (result.success) { setMessage({ kind: 'ok', text: `Approved ${r.booking?.bookingRef || ''}. ${r.requestedBy?.name || 'The requester'} can now issue the refund.` }); router.refresh() }
      else setMessage({ kind: 'error', text: result.error || 'Could not approve' })
    } catch { setMessage({ kind: 'error', text: 'Could not approve' }) } finally { setBusy(null) }
  }
  return (
    <section className="space-y-2 rounded-xl border p-3" aria-label="Refund approvals">
      <h2 className="text-sm font-semibold">Refund approvals</h2>
      {message && <p role={message.kind === 'ok' ? 'status' : 'alert'} className={message.kind === 'ok' ? 'font-mono text-xs uppercase tracking-wide text-emerald-700' : 'text-sm text-rose-600'}>{message.text}</p>}
      <ul className="space-y-2">
        {rows.map((r) => {
          const own = r.requestedBy?.id === me
          return (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <div className="min-w-0">
                <p className="truncate"><span className="font-mono">{r.booking?.bookingRef || 'Booking'}</span> · {r.booking?.guestName} · <span className="font-mono">{money(r.amount, r.booking?.currencyCode || 'USD')}</span></p>
                <p className="truncate text-muted-foreground">{r.reason} · requested by {own ? 'you' : r.requestedBy?.name}</p>
              </div>
              {r.status === 'approved'
                ? <span className="font-mono text-xs uppercase tracking-wide text-emerald-700">Approved{r.approvedBy?.name ? ` by ${r.approvedBy.name}` : ''}</span>
                : own
                  ? <span className="font-mono text-xs uppercase tracking-wide text-amber-700">Waiting for another manager</span>
                  : <Button size="sm" disabled={busy === r.id} onClick={() => approve(r)}>Approve refund</Button>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
