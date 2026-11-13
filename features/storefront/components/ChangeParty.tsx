'use client'

import React from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { Button } from '@/components/ui/button'
import { changeParty, completePartyChange, partyQuote, type PartyChange } from '../lib/data'
import { money as fmt } from '../lib/format'
import { PartyEditor, PartyQuoteSummary } from './PartyEditor'

function PayDifference({ onPaid, onError }: { onPaid: () => Promise<void>; onError: (m: string) => void }) {
  const stripe = useStripe(); const elements = useElements()
  const [busy, setBusy] = React.useState(false)
  const pay = async () => {
    if (!stripe || !elements) return
    setBusy(true); onError('')
    const r = await stripe.confirmPayment({ elements, redirect: 'if_required' })
    if (r.error) { setBusy(false); return onError(r.error.message || 'Payment failed') }
    await onPaid(); setBusy(false)
  }
  return <div className="space-y-3"><PaymentElement options={{ paymentMethodOrder: ['card'], layout: { type: 'accordion', defaultCollapsed: false, radios: false, spacedAccordionItems: false }, wallets: { applePay: 'never', googlePay: 'never' } }} /><Button className="h-11 w-full" disabled={busy || !stripe} onClick={pay}>{busy ? 'Paying…' : 'Pay the difference'}</Button></div>
}

// Manage-link section: add or remove people. Costs more: pay the difference by card, the change applies once paid. Costs less: the
// removed amount is refunded under the published policy at once. Kept people keep the price they paid.
export function ChangeParty({ link, booking, onDone }: { link: { bookingRef: string; token: string }; booking: any; onDone: (note: string) => Promise<void> }) {
  const money = (c: number) => fmt(c, booking.currencyCode)
  const [draft, setDraft] = React.useState<PartyChange>({ keep: booking.participants.map((p: any) => p.id), add: [] })
  const [q, setQ] = React.useState<any>(null)
  const [error, setError] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [pay, setPay] = React.useState<any>(null)
  const key = React.useRef<string>('')
  const changed = draft.add.length > 0 || draft.keep.length !== booking.participants.length
  React.useEffect(() => {
    key.current = crypto.randomUUID()
    if (!changed) { setQ(null); setError(''); return }
    let live = true
    const t = setTimeout(async () => { const r = await partyQuote(link.bookingRef, link.token, draft); if (!live) return; if (r.ok) { setQ(r.quote); setError('') } else { setQ(null); setError(r.error) } }, 300)
    return () => { live = false; clearTimeout(t) }
  }, [JSON.stringify(draft)]) // eslint-disable-line react-hooks/exhaustive-deps
  const stripePromise = React.useMemo(() => (pay?.publishableKey ? loadStripe(pay.publishableKey) : null), [pay?.publishableKey])

  const submit = async () => {
    setBusy(true); setError('')
    try {
      const r = await changeParty(link.bookingRef, link.token, draft, key.current)
      if (!r.ok) return setError(r.error)
      if (r.result.status === 'pending_payment') return setPay(r.result)
      await onDone(r.result.refundCents > 0 ? `Party changed. ${money(r.result.refundCents)} has been refunded.` : 'Party changed.')
    } finally { setBusy(false) }
  }
  const paid = async () => {
    const r = await completePartyChange(link.bookingRef, link.token, pay.changeId)
    if (!r.ok) return setError(r.error)
    await onDone(`Party changed. ${money(pay.collectCents)} paid.`)
  }
  if (pay) return (
    <section className="space-y-3 border-t pt-3" aria-label="Pay for the change">
      <h2 className="text-base font-semibold">Pay the difference</h2>
      <p className="text-sm">The added seats are held for you while you pay <span className="font-mono">{money(pay.collectCents)}</span>. Nothing changes until the payment goes through.</p>
      {stripePromise && pay.clientSecret ? <Elements stripe={stripePromise} options={{ clientSecret: pay.clientSecret }}><PayDifference onPaid={paid} onError={setError} /></Elements> : <p className="text-sm text-rose-600">Card payments are not set up. Contact the operator.</p>}
      {error && <p className="text-sm text-rose-600" role="alert">{error}</p>}
    </section>
  )
  return (
    <section className="space-y-3 border-t pt-3" aria-label="Change party">
      <h2 className="text-base font-semibold">Change who is coming</h2>
      <p className="text-sm text-muted-foreground">Untick someone to remove them, or add a person. People already booked keep the price they paid.</p>
      <PartyEditor people={booking.participants} tickets={booking.tickets || []} money={money} onChange={setDraft} />
      {q && <PartyQuoteSummary q={q} money={money} />}
      {error && <p className="text-sm text-rose-600" role="alert">{error}</p>}
      <Button className="h-11" onClick={submit} disabled={!q || !q.roomForAdded || busy}>{busy ? 'Saving…' : q?.collectCents > 0 ? `Continue to pay ${money(q.collectCents)}` : q?.refundCents > 0 ? `Change and refund ${money(q.refundCents)}` : 'Save change'}</Button>
    </section>
  )
}
