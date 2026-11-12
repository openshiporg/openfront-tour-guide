'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { money } from '../../lib/format'
import { removePricingRuleAction, savePricingRuleAction, type Rule, type TourRow } from '../actions/pricing'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const field = 'h-11 w-full min-w-0 rounded-md border bg-background px-3 text-sm'
type Msg = { kind: 'ok' | 'error'; text: string } | null
const pct = (bps: number) => `${bps > 0 ? '+' : ''}${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`
const cents = (v: string) => Math.round(Number(v.replace(/[^0-9.]/g, '')) * 100)
const dayText = (d: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${d}T12:00:00Z`))

function describe(r: Rule, tour: TourRow | undefined) {
  const ticket = r.ticketTypeId ? tour?.ticketTypes.find((t) => t.id === r.ticketTypeId)?.name || 'One ticket type' : 'Every ticket type'
  const price = r.overridePriceCents !== null ? `Price ${money(r.overridePriceCents, r.currencyCode)}` : `Price ${pct(r.adjustBps || 0)}`
  const when = r.from || r.to ? `${r.from ? dayText(r.from) : 'Any time'} to ${r.to ? dayText(r.to) : 'no end'}` : 'All dates'
  const days = r.weekdays.length ? r.weekdays.map((d) => DAYS[d]).join(', ') : 'Every day'
  return { ticket, price, when, days }
}

function RuleForm({ tour, rule, onDone, onCancel }: { tour: TourRow; rule: Rule | null; onDone: (m: Msg) => void; onCancel: () => void }) {
  const router = useRouter()
  const [name, setName] = React.useState(rule?.name || ''), [ticket, setTicket] = React.useState(rule?.ticketTypeId || '')
  const [mode, setMode] = React.useState<'percent' | 'fixed'>(rule && rule.overridePriceCents !== null ? 'fixed' : 'percent')
  const [amount, setAmount] = React.useState(rule ? (rule.overridePriceCents !== null ? (rule.overridePriceCents / 100).toFixed(2) : String((rule.adjustBps || 0) / 100)) : '')
  const [from, setFrom] = React.useState(rule?.from || ''), [to, setTo] = React.useState(rule?.to || '')
  const [days, setDays] = React.useState<number[]>(rule?.weekdays || []), [busy, setBusy] = React.useState(false), [error, setError] = React.useState('')
  const attempt = React.useRef<{ key: string; fp: string } | null>(null)
  const parsed = amount.trim() !== '' && Number.isFinite(Number(amount.replace(/[^0-9.\-]/g, '')))
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError('')
    const input = { id: rule?.id, tourId: tour.id, ticketTypeId: ticket || null, name: name.trim(), from: from || null, to: to || null, weekdays: days, ...(mode === 'fixed' ? { overridePriceCents: cents(amount) } : { adjustBps: Math.round(Number(amount.replace(/[^0-9.\-]/g, '')) * 100) }) }
    const fp = JSON.stringify(input)
    if (!attempt.current || attempt.current.fp !== fp) attempt.current = { key: crypto.randomUUID(), fp }
    try {
      const r = await savePricingRuleAction(input, attempt.current.key)
      if (r.success) { attempt.current = null; onDone({ kind: 'ok', text: `${name.trim()} saved` }); router.refresh() }
      else setError(r.error)
    } catch { setError('Could not save. Press Save again: the same request is safe to repeat.') } finally { setBusy(false) }
  }
  return (
    <form onSubmit={submit} className="mt-3 grid min-w-0 gap-3 rounded-xl border p-3 md:grid-cols-2" aria-label={rule ? `Edit ${rule.name}` : `New rule for ${tour.name}`}>
      <label className="min-w-0 text-sm md:col-span-2">Rule name<input className={field} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. Summer weekends" /></label>
      <label className="min-w-0 text-sm">Applies to<select className={field} value={ticket} onChange={(e) => setTicket(e.target.value)}><option value="">Every ticket type</option>{tour.ticketTypes.map((t) => <option key={t.id} value={t.id}>{t.name} ({money(t.priceCents, t.currencyCode)})</option>)}</select></label>
      <label className="min-w-0 text-sm">Change type<select className={field} value={mode} onChange={(e) => { setMode(e.target.value as 'percent' | 'fixed'); setAmount('') }}><option value="percent">Percent up or down</option><option value="fixed">Fixed price per ticket</option></select></label>
      <label className="min-w-0 text-sm">{mode === 'fixed' ? 'Price per ticket' : 'Percent change (negative lowers the price)'}<input className={field} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={mode === 'fixed' ? 'e.g. 65.00' : 'e.g. 15 or -20'} /></label>
      <div className="hidden md:block" />
      <label className="min-w-0 text-sm">First day<input type="date" className={field} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
      <label className="min-w-0 text-sm">Last day<input type="date" className={field} value={to} onChange={(e) => setTo(e.target.value)} /></label>
      <fieldset className="min-w-0 md:col-span-2"><legend className="text-sm">Weekdays (none picked means every day)</legend>
        <div className="mt-1 grid grid-cols-4 gap-2 sm:grid-cols-7">
          {DAYS.map((d, i) => { const on = days.includes(i); return <button key={d} type="button" aria-pressed={on} onClick={() => setDays(on ? days.filter((x) => x !== i) : [...days, i])} className={`h-11 rounded-md border text-sm ${on ? 'bg-primary text-primary-foreground' : 'bg-background'}`}>{d}</button> })}
        </div>
      </fieldset>
      {error && <p role="alert" className="break-words text-sm text-rose-600 md:col-span-2">{error}</p>}
      <div className="flex flex-wrap gap-2 md:col-span-2"><Button type="submit" className="h-11" disabled={busy || !name.trim() || !parsed}>{busy ? 'Saving…' : 'Save rule'}</Button><Button type="button" variant="outline" className="h-11" onClick={onCancel}>Cancel</Button></div>
    </form>
  )
}

function Remove({ rule, onDone }: { rule: Rule; onDone: (m: Msg) => void }) {
  const router = useRouter()
  const [ask, setAsk] = React.useState(false), [busy, setBusy] = React.useState(false)
  const key = React.useRef(crypto.randomUUID())
  const go = async () => {
    setBusy(true)
    try { const r = await removePricingRuleAction(rule.id, key.current); if (r.success) { onDone({ kind: 'ok', text: `${rule.name} removed` }); router.refresh() } else onDone({ kind: 'error', text: r.error }) } finally { setBusy(false); setAsk(false) }
  }
  return ask
    ? <><Button className="h-11" variant="destructive" disabled={busy} onClick={go}>{busy ? 'Removing…' : 'Yes, remove'}</Button><Button className="h-11" variant="outline" onClick={() => setAsk(false)}>Keep</Button></>
    : <Button className="h-11" variant="outline" onClick={() => setAsk(true)}>Remove</Button>
}

export function PricingClient({ board }: { board: { tours: TourRow[]; rules: Rule[] } }) {
  const [msg, setMsg] = React.useState<Msg>(null), [editing, setEditing] = React.useState<string | null>(null)
  if (!board.tours.length) return <p className="text-sm text-muted-foreground">No tours yet. Add a tour first, then set its seasonal prices here.</p>
  return (
    <div className="space-y-3">
      {msg && <p role={msg.kind === 'ok' ? 'status' : 'alert'} className={msg.kind === 'ok' ? 'font-mono text-xs uppercase tracking-wide text-emerald-700' : 'break-words text-sm text-rose-600'}>{msg.text}</p>}
      <ul className="space-y-3">
        {board.tours.map((t) => {
          const rules = board.rules.filter((r) => r.tourId === t.id)
          return (
            <li key={t.id} className="min-w-0 rounded-xl border p-3" data-pricing-tour={t.name}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0"><p className="break-words font-semibold">{t.name}</p><p className="text-sm text-muted-foreground">{t.ticketTypes.map((x) => `${x.name} ${money(x.priceCents, x.currencyCode)}`).join(' · ') || 'No active ticket types'}</p></div>
                {t.ticketTypes.length > 0 && <Button className="h-11" variant="outline" onClick={() => { setMsg(null); setEditing(`${t.id}:new`) }}>Add a rule</Button>}
              </div>
              {editing === `${t.id}:new` && <RuleForm tour={t} rule={null} onDone={(m) => { setMsg(m); setEditing(null) }} onCancel={() => setEditing(null)} />}
              <ul className="mt-2 space-y-2">
                {rules.map((r) => {
                  const d = describe(r, t)
                  return (
                    <li key={r.id} className="min-w-0 rounded-md border p-3 text-sm" data-pricing-rule>
                      <p className="break-words font-medium">{r.name}</p>
                      <p className="break-words text-muted-foreground">{d.price} · {d.ticket}</p>
                      <p className="break-words text-muted-foreground">{d.when} · {d.days}</p>
                      <div className="mt-2 flex flex-wrap gap-2"><Button className="h-11" variant="outline" onClick={() => { setMsg(null); setEditing(editing === r.id ? null : r.id) }}>{editing === r.id ? 'Close' : 'Edit'}</Button><Remove rule={r} onDone={setMsg} /></div>
                      {editing === r.id && <RuleForm tour={t} rule={r} onDone={(m) => { setMsg(m); setEditing(null) }} onCancel={() => setEditing(null)} />}
                    </li>
                  )
                })}
                {!rules.length && <li className="text-sm text-muted-foreground">No seasonal rules. Guests pay the listed ticket prices.</li>}
              </ul>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
