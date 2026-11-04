'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { exportSalesCsvAction } from '../actions/reports'

export function ExportCsv({ from, to, basis }: { from: string; to: string; basis: string }) {
  const [busy, setBusy] = React.useState(false)
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null)
  const run = async () => {
    setBusy(true); setMsg(null)
    try {
      const r = await exportSalesCsvAction(from, to, basis)
      if (!r.success) { setMsg({ ok: false, text: r.error }); return }
      const url = URL.createObjectURL(new Blob([r.csv], { type: 'text/csv;charset=utf-8' }))
      const a = document.createElement('a'); a.href = url; a.download = r.filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
      setMsg({ ok: true, text: `Downloaded ${r.filename} (${r.rows} bookings). This export is logged.` })
    } catch { setMsg({ ok: false, text: 'Could not build the export' }) } finally { setBusy(false) }
  }
  return (
    <div className="space-y-2">
      <Button variant="outline" disabled={busy} onClick={run}>{busy ? 'Building CSV…' : 'Download CSV'}</Button>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'break-words font-mono text-xs uppercase tracking-wide text-emerald-700' : 'break-words text-sm text-rose-600'}>{msg.text}</p>}
    </div>
  )
}
