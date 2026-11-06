'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { money as fmt } from '../../lib/format'
import { PartyEditor, PartyQuoteSummary, type PartyDraft } from '../../../storefront/components/PartyEditor'
import { changePartyAction, getBookingPartyAction, quotePartyAction, requestApprovalAction } from '../actions/bookings'

// Phone change of party: add people (the difference is taken in cash at the desk) or remove people (the difference is refunded in full,
// newest payment first). A refund over the threshold needs another manager's approval for this exact amount and reason.
export function ChangeParty({ booking, onDone }: { booking: { id: string; bookingRef: string; currencyCode: string }; onDone: (msg: { kind: 'ok' | 'error'; text: string }) => void }) {
  const router = useRouter()
  const money = (c: number) => fmt(c, booking.currencyCode)
  const [open, setOpen] = React.useState(false)
  const [party, setParty] = React.useState<any>(null)
  const [draft, setDraft] = React.useState<PartyDraft | null>(null)
  const [q, setQ] = React.useState<any>(null)
  const [error, setError] = React.useState('')
  const [reason, setReason] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [asked, setAsked] = React.useState(false)
  const key = React.useMemo(() => `party:${booking.id}:${JSON.stringify(draft)}:${reason.trim()}:${Math.random().toString(36).slice(2)}`, [booking.id, draft, reason])
  React.useEffect(() => {
    setAsked(false)
    if (!draft || !party || (draft.add.length === 0 && draft.keep.length === party.participants.length)) { setQ(null); setError(''); return }
    let live = true
    const t = setTimeout(async () => { const r = await quotePartyAction(booking.id, draft); if (!live) return; if (r.ok) { setQ(r.quote); setError('') } else { setQ(null); setError(r.error) } }, 300)
    return () => { live = false; clearTimeout(t) }
  }, [JSON.stringify(draft)]) // eslint-disable-line react-hooks/exhaustive-deps
  const load = async () => { setParty(null); setDraft(null); setQ(null); setError(''); setReason(''); setParty(await getBookingPartyAction(booking.id)) }
  const save = async () => {
    if (!draft) return
    setBusy(true)
    try {
      const r: any = await changePartyAction(booking.id, draft, reason.trim(), key)
      if (!r.success) return setError(r.error || 'Could not change the party')
      const c = r.change
      setOpen(false)
      onDone({ kind: 'ok', text: `${booking.bookingRef} now ${c.seats} ${c.seats === 1 ? 'person' : 'people'}${c.collectCents ? `, collect ${money(c.collectCents)} cash` : ''}${c.refundCents ? `, refunded ${money(c.refundCents)}` : ''}` })
      router.refresh()
    } finally { setBusy(false) }
  }
  const ask = async () => {
    setBusy(true)
    try { const r: any = await requestApprovalAction(booking.id, q.refundCents, reason.trim()); if (r?.success === false) setError(r.error || 'Could not request approval'); else setAsked(true) } finally { setBusy(false) }
  }
  return (
    <Sheet open={open} onOpenChange={(v) => { setOpen(v); if (v) load() }}>
      <SheetTrigger asChild><Button size="sm" variant="outline">Change party</Button></SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader><SheetTitle>Change party · <span className="font-mono">{booking.bookingRef}</span></SheetTitle></SheetHeader>
        <div className="space-y-3 px-4 pb-6">
          {!party && <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">Loading party</p>}
          {party && !party.canChange && <p className="text-sm">{party.reason}</p>}
          {party?.canChange && (
            <>
              <p className="text-sm text-muted-foreground">People already booked keep their price. Added people pay today&apos;s price, collected in cash. Removed people are refunded in full.</p>
              <PartyEditor people={party.participants} tickets={party.tickets} money={money} onChange={setDraft} />
              {q && <PartyQuoteSummary q={q} money={money} />}
              {q?.needsApproval && <p className="text-sm">This refund is over the approval threshold. Request approval, then ask another manager to approve it on this page.</p>}
              <Input placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
              {error && <p className="text-sm text-rose-600" role="alert">{error}</p>}
              {asked && <p className="font-mono text-xs uppercase tracking-wide text-emerald-700">Approval requested</p>}
              <div className="flex flex-wrap gap-2">
                {q?.needsApproval && <Button variant="outline" disabled={!reason.trim() || busy || asked} onClick={ask}>Request approval</Button>}
                <Button disabled={!q || !q.roomForAdded || !reason.trim() || busy} onClick={save}>{busy ? 'Saving…' : q?.collectCents > 0 ? `Save, collect ${money(q.collectCents)}` : q?.refundCents > 0 ? `Save, refund ${money(q.refundCents)}` : 'Save change'}</Button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
