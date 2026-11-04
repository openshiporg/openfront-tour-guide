'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { StatusLabel } from '../../components/StatusLabel'
import { dayIn, money } from '../../lib/format'
import { transitionSettlement, generateStatement } from '../actions/settlement'

export function SettlementRows({ kind, rows }: { kind: 'payout' | 'statement'; rows: any[] }) {
  const router = useRouter(), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [references, setReferences] = useState<Record<string,string>>({})
  async function transition(row: any, status: string) {
    setBusy(true); setMessage('')
    try { const r = await transitionSettlement(kind, { id: row.id, status, reference: references[row.id] }); if (!r.success) setMessage(r.error || 'Settlement failed'); else { setMessage('Saved'); router.refresh() } } catch { setMessage('Settlement failed') } finally { setBusy(false) }
  }
  return <section className="space-y-3 p-4"><h2 className="font-semibold">{kind === 'payout' ? 'Guide payouts' : 'Channel statements'}</h2><p className="text-sm text-muted-foreground">Manual payment recording only. No funds are transferred.</p>{message && <p role="status" className="text-sm">{message}</p>}
    {rows.map(row => <article key={row.id} className="space-y-2 rounded-xl border p-3">
      <div className="flex flex-wrap justify-between gap-2"><h3 className="text-sm font-semibold">{row.guide?.name || row.channel?.name}</h3><StatusLabel status={row.status} /></div>
      <p className="text-sm">{dayIn(row.periodStart)} – {dayIn(row.periodEnd)}</p>
      {kind === 'statement' && <p className="text-sm">Gross {money(row.grossCents, row.currencyCode)} · Commission {money(row.commissionCents, row.currencyCode)}</p>}
      <p className="text-sm font-mono">{kind === 'payout' ? money(row.totalCents, row.currencyCode) : `${row.netDueCents < 0 ? 'PAY CHANNEL' : 'RECEIVE'} ${money(Math.abs(row.netDueCents), row.currencyCode)}`}</p>
      {['draft','open'].includes(row.status) && <Button size="sm" disabled={busy} onClick={() => transition(row, kind === 'payout' ? 'approved' : 'invoiced')}>{kind === 'payout' ? 'Approve payout' : 'Mark invoiced'}</Button>}
      {['approved','invoiced'].includes(row.status) && <div className="flex flex-wrap gap-2"><Input className="min-w-0 flex-1" aria-label="Payment reference" placeholder="Payment receipt/reference" maxLength={200} value={references[row.id] || ''} onChange={e => setReferences({ ...references, [row.id]: e.target.value })} /><Button size="sm" disabled={busy || !references[row.id]?.trim()} onClick={() => transition(row, 'paid')}>Record paid</Button></div>}
      {row.reference && <p className="break-words text-sm">{row.reference}</p>}
    </article>)}{!rows.length && <p className="text-sm">No {kind === 'payout' ? 'payouts' : 'statements'}.</p>}
  </section>
}
export function GenerateStatement({ channels }: { channels: any[] }) {
  const [channelId, setChannel] = useState(''), [month, setMonth] = useState(new Date().toISOString().slice(0,7)), [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
  const router = useRouter()
  async function generate() {
    setBusy(true); setMessage('')
    try {
      if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Use YYYY-MM')
      const from = new Date(`${month}-01T00:00:00Z`), to = new Date(from); to.setUTCMonth(to.getUTCMonth()+1)
      const r = await generateStatement({ channelId, from: from.toISOString(), to: to.toISOString() }); setMessage(r.success ? 'Statement generated' : r.error || 'Generation failed'); if (r.success) router.refresh()
    } catch { setMessage('Valid month required (YYYY-MM)') } finally { setBusy(false) }
  }
  return <section className="space-y-3 p-4"><h2 className="font-semibold">Generate statement</h2><div className="flex flex-wrap gap-2"><Select value={channelId} onValueChange={setChannel}><SelectTrigger className="w-full md:w-64"><SelectValue placeholder="Channel" /></SelectTrigger><SelectContent>{channels.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select><Input className="w-40" aria-label="Statement month UTC" placeholder="YYYY-MM (UTC)" value={month} onChange={e => setMonth(e.target.value)} /><Button disabled={busy || !channelId} onClick={generate}>Generate</Button></div>{message && <p role="status" className="text-sm">{message}</p>}</section>
}
