'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { sweepDeparturesAction } from '../actions/today'

// Lapses stale holds, flags tomorrow's departures under their minimum, closes sales at cutoff and offers freed seats to the waitlist.
export function DailyCheck() {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null)
  const run = async () => {
    setBusy(true); setMessage(null)
    try {
      const r: any = await sweepDeparturesAction()
      if (!r.success) setMessage({ ok: false, text: r.error || 'Could not run the daily check' })
      else { const s = r.data?.sweepDepartures || {}; setMessage({ ok: true, text: `Checked: ${s.tasks ?? 0} minimum alerts · ${s.closed ?? 0} closed at cutoff · ${s.waitlistOffers ?? 0} waitlist offers · ${s.lapsedHolds ?? 0} lapsed holds` }); router.refresh() }
    } catch { setMessage({ ok: false, text: 'Could not run the daily check' }) } finally { setBusy(false) }
  }
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 pt-4">
      <Button size="sm" variant="outline" disabled={busy} onClick={run}>Run daily check</Button>
      {message && <p role={message.ok ? 'status' : 'alert'} className={message.ok ? 'font-mono text-xs uppercase tracking-wide text-emerald-700' : 'text-sm text-rose-600'}>{message.text}</p>}
    </div>
  )
}
