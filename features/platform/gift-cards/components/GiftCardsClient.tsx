'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { StatusLabel } from '../../components/StatusLabel'
import { dayIn, money } from '../../lib/format'
import { issueGiftCardAction, revealGiftCardCodeAction, voidGiftCardAction } from '../actions/giftCards'

type Msg = { kind: 'ok' | 'error'; text: string } | null
const cents = (v: string) => Math.round(Number(v.replace(/[^0-9.]/g, '')) * 100)
const KIND: Record<string, string> = { issue: 'Issued', redeem: 'Paid booking', return: 'Refund returned', void: 'Voided' }

function Issue({ onIssued }: { onIssued: (m: Msg, code?: string) => void }) {
  const router = useRouter()
  const [amount, setAmount] = React.useState(''), [fundedBy, setFundedBy] = React.useState<'cash' | 'complimentary'>('cash')
  const [name, setName] = React.useState(''), [email, setEmail] = React.useState(''), [expires, setExpires] = React.useState(''), [note, setNote] = React.useState(''), [busy, setBusy] = React.useState(false)
  const attempt = React.useRef<{ key: string; fp: string } | null>(null)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true)
    const input = { amountCents: cents(amount), fundedBy, recipientName: name, recipientEmail: email, expiresAt: expires ? new Date(`${expires}T23:59:59`).toISOString() : undefined, note }
    const fp = JSON.stringify(input)
    if (!attempt.current || attempt.current.fp !== fp) attempt.current = { key: crypto.randomUUID(), fp }
    try {
      const r = await issueGiftCardAction(input, attempt.current.key)
      if (r.success) { attempt.current = null; setAmount(''); setName(''); setEmail(''); setExpires(''); setNote(''); onIssued({ kind: 'ok', text: `${money(r.card.initialCents, r.card.currencyCode)} gift card issued${fundedBy === 'cash' ? ', cash collected' : ''}` }, r.card.code); router.refresh() }
      else onIssued({ kind: 'error', text: r.error })
    } catch { onIssued({ kind: 'error', text: 'Could not issue. Press Issue again: the same request is safe to repeat.' }) } finally { setBusy(false) }
  }
  const valid = cents(amount) >= 100 && (fundedBy === 'cash' || note.trim())
  return (
    <details className="rounded-xl border p-3" open>
      <summary className="cursor-pointer text-sm font-medium">Issue a gift card</summary>
      <form onSubmit={submit} className="mt-3 grid min-w-0 gap-3 md:grid-cols-2">
        <fieldset className="flex flex-wrap gap-4 text-sm md:col-span-2"><legend className="sr-only">Funded by</legend>
          <label className="flex items-center gap-2"><input type="radio" name="funded" checked={fundedBy === 'cash'} onChange={() => setFundedBy('cash')} />Sold for cash</label>
          <label className="flex items-center gap-2"><input type="radio" name="funded" checked={fundedBy === 'complimentary'} onChange={() => setFundedBy('complimentary')} />Complimentary voucher</label>
        </fieldset>
        <Input aria-label="Amount" inputMode="decimal" placeholder="Amount, e.g. 50.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <label className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">Expires<Input aria-label="Expires" type="date" className="min-w-0" value={expires} onChange={(e) => setExpires(e.target.value)} /></label>
        <Input aria-label="Recipient name" placeholder="Recipient name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
        <Input aria-label="Recipient email" type="email" placeholder="Recipient email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input aria-label="Note" className="md:col-span-2" placeholder={fundedBy === 'complimentary' ? 'Why (required), e.g. apology for the cancelled sunset tour' : 'Note (optional)'} value={note} onChange={(e) => setNote(e.target.value)} />
        <Button disabled={busy || !valid}>{busy ? 'Issuing…' : `Issue${cents(amount) >= 100 ? ` ${money(cents(amount))}` : ''}`}</Button>
      </form>
    </details>
  )
}

function Void({ card, onDone }: { card: any; onDone: (m: Msg) => void }) {
  const router = useRouter()
  const [reason, setReason] = React.useState(''), [busy, setBusy] = React.useState(false), [open, setOpen] = React.useState(false)
  const key = React.useRef(crypto.randomUUID())
  const go = async () => {
    setBusy(true)
    try {
      const r = await voidGiftCardAction(card.id, reason.trim(), key.current)
      if (r.success) { setOpen(false); onDone({ kind: 'ok', text: `Gift card ····${card.last4} voided` }); router.refresh() }
      else onDone({ kind: 'error', text: r.error })
    } finally { setBusy(false) }
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><Button size="sm" variant="outline">Void</Button></PopoverTrigger>
      <PopoverContent className="w-72 space-y-2">
        <p className="text-sm text-muted-foreground">The code stops working. {money(card.balanceCents, card.currencyCode)} left on it is written off.</p>
        <Input placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        <Button size="sm" className="w-full" variant="destructive" disabled={busy || !reason.trim()} onClick={go}>{busy ? 'Voiding…' : 'Void gift card'}</Button>
      </PopoverContent>
    </Popover>
  )
}

export function GiftCardsClient({ board, search }: { board: any; search: string }) {
  const router = useRouter()
  const [msg, setMsg] = React.useState<Msg>(null), [code, setCode] = React.useState<string | null>(null), [copied, setCopied] = React.useState(false)
  const [shown, setShown] = React.useState<Record<string, string>>({}), [q, setQ] = React.useState(search)
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); setCopied(true) } catch { setCopied(false) } }
  const reveal = async (id: string) => { const r = await revealGiftCardCodeAction(id); if (r.success) setShown({ ...shown, [id]: r.code }); else setMsg({ kind: 'error', text: r.error }) }
  return (
    <div className="space-y-3">
      <Issue onIssued={(m, c) => { setMsg(m); setCode(c || null); setCopied(false) }} />
      {msg && <p role={msg.kind === 'ok' ? 'status' : 'alert'} className={msg.kind === 'ok' ? 'font-mono text-xs uppercase tracking-wide text-emerald-700' : 'text-sm text-rose-600'}>{msg.text}</p>}
      {code && (
        <div className="space-y-2 rounded-xl border p-3 text-sm" data-gift-code>
          <p>Give the guest this code. They enter it at checkout:</p>
          <p className="break-all font-mono text-lg tracking-wider">{code}</p>
          <Button size="sm" variant="outline" onClick={() => copy(code)}>{copied ? 'Copied' : 'Copy code'}</Button>
        </div>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm"><span className="text-muted-foreground">Outstanding on {board.activeCards} card{board.activeCards === 1 ? '' : 's'}: </span><span className="font-mono font-semibold" data-outstanding>{money(board.outstandingCents)}</span></p>
        <form className="flex min-w-0 gap-2" onSubmit={(e) => { e.preventDefault(); router.push(`/dashboard/platform/gift-cards${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`) }}>
          <Input aria-label="Find a gift card" className="min-w-0" placeholder="Code, last 4 or recipient" value={q} onChange={(e) => setQ(e.target.value)} />
          <Button variant="outline">Find</Button>
        </form>
      </div>
      <ul className="space-y-2">
        {board.cards.map((c: any) => (
          <li key={c.id} className="min-w-0 rounded-xl border p-3 text-sm" data-gift-card={c.status}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="min-w-0 break-words"><span className="font-mono font-semibold">····{c.last4}</span> <span className="text-muted-foreground">· {c.fundedBy === 'cash' ? 'sold for cash' : 'complimentary'}{c.recipientName ? ` · for ${c.recipientName}` : ''}</span></p>
              <StatusLabel status={c.status} />
            </div>
            {c.status !== 'active' && c.balanceCents > 0 && <p className="mt-1 text-amber-700" data-reissue>{money(c.balanceCents, c.currencyCode)} came back from a refund after this card stopped working. Issue a new card for it.</p>}
            <p className="mt-1"><span className="font-mono font-semibold">{money(c.status === 'active' ? c.balanceCents : 0, c.currencyCode)}</span><span className="text-muted-foreground"> usable of {money(c.initialCents, c.currencyCode)} · issued {dayIn(c.createdAt)}{c.expiresAt ? ` · expires ${dayIn(c.expiresAt)}` : ''}</span></p>
            {c.note && <p className="break-words text-muted-foreground">{c.note}</p>}
            {shown[c.id] && <p className="break-all font-mono">{shown[c.id]}</p>}
            <details className="mt-2"><summary className="cursor-pointer text-muted-foreground">History ({c.entries.length})</summary>
              <ul className="mt-1 space-y-1">{c.entries.map((e: any, i: number) => (
                <li key={i} className="flex flex-wrap justify-between gap-x-3"><span className="min-w-0 break-words">{dayIn(e.createdAt)} · {KIND[e.kind] || e.kind}{e.bookingRef ? <> · <span className="font-mono">{e.bookingRef}</span></> : ''}</span><span className="font-mono">{e.amountCents > 0 ? '+' : '−'}{money(Math.abs(e.amountCents), c.currencyCode)} → {money(e.balanceAfterCents, c.currencyCode)}</span></li>
              ))}</ul>
            </details>
            {c.status !== 'void' && (
              <div className="mt-2 flex flex-wrap gap-2">
                {!shown[c.id] && <Button size="sm" variant="outline" onClick={() => reveal(c.id)}>Show code</Button>}
                <Void card={c} onDone={setMsg} />
              </div>
            )}
          </li>
        ))}
      </ul>
      {!board.cards.length && <p className="text-sm text-muted-foreground">{search ? 'No gift card matches.' : 'No gift cards yet.'}</p>}
    </div>
  )
}
