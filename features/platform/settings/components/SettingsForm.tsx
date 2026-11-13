'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { saveOperatorSettings, type OperatorSettings } from '../actions/settings'

const field = 'h-11 w-full min-w-0 rounded-md border bg-background px-3 text-sm'

export function SettingsForm({ settings }: { settings: OperatorSettings }) {
  const router = useRouter()
  const [v, setV] = React.useState({ name: settings.name, timezone: settings.timezone, address: settings.address, tax: String(settings.taxBps / 100), threshold: (settings.refundApprovalThresholdCents / 100).toFixed(2), hours: String(settings.waitlistOfferHours) })
  const [busy, setBusy] = React.useState(false), [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null)
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value })
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null)
    try {
      const r = await saveOperatorSettings(settings.id, { name: v.name.trim(), timezone: v.timezone.trim(), address: v.address.trim(), taxBps: Math.round(Number(v.tax) * 100), refundApprovalThresholdCents: Math.round(Number(v.threshold) * 100), waitlistOfferHours: Math.round(Number(v.hours)) })
      setMsg(r.success ? { ok: true, text: 'Settings saved' } : { ok: false, text: r.error }); if (r.success) router.refresh()
    } catch { setMsg({ ok: false, text: 'Could not save the settings' }) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={submit} className="grid min-w-0 gap-3 md:max-w-xl">
      <label className="grid gap-1 text-sm">Operator name<input className={field} required value={v.name} onChange={set('name')} /></label>
      <label className="grid gap-1 text-sm">Timezone<input className={field} required value={v.timezone} onChange={set('timezone')} /></label>
      <label className="grid gap-1 text-sm">Address<input className={field} value={v.address} onChange={set('address')} /></label>
      <label className="grid gap-1 text-sm">Tax rate (%)<input className={field} inputMode="decimal" required value={v.tax} onChange={set('tax')} /></label>
      <label className="grid gap-1 text-sm">Refunds above this amount need a second manager ({settings.currencyCode})<input className={field} inputMode="decimal" required value={v.threshold} onChange={set('threshold')} /></label>
      <label className="grid gap-1 text-sm">Waitlist offer window (hours)<input className={field} inputMode="numeric" required value={v.hours} onChange={set('hours')} /></label>
      <div className="flex flex-wrap items-center gap-3"><Button className="h-11" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</Button>{msg && <p role={msg.ok ? 'status' : 'alert'} className={`break-words text-sm ${msg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{msg.text}</p>}</div>
    </form>
  )
}
