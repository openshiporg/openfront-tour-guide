'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { generateDeparturesAction } from '../../today/actions/today'

// Departures come from each active tour's schedule; already-created dates are skipped.
export function GenerateDepartures() {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null)
  const run = async () => {
    setBusy(true); setMessage(null)
    try {
      const r: any = await generateDeparturesAction()
      if (!r.success) setMessage({ ok: false, text: r.error || 'Could not put dates on sale' })
      else { const n = r.data?.generateDepartures?.created ?? 0; setMessage({ ok: true, text: n ? `${n} new departure${n === 1 ? '' : 's'} on sale` : 'Every scheduled date in the next 60 days is already on sale' }); router.refresh() }
    } catch { setMessage({ ok: false, text: 'Could not put dates on sale' }) } finally { setBusy(false) }
  }
  return (
    <>
      <Button size="sm" disabled={busy} onClick={run}>Put next 60 days on sale</Button>
      {message && <p role={message.ok ? 'status' : 'alert'} className={message.ok ? 'self-center font-mono text-xs uppercase tracking-wide text-emerald-700' : 'self-center text-sm text-rose-600'}>{message.text}</p>}
    </>
  )
}
