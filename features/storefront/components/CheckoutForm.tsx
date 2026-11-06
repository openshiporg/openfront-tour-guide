'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { completeCheckout, giftCardBalance, startCheckout } from '../lib/data'
import { money, when } from '../lib/format'

function Pay({ bookingRef, email, onError }: { bookingRef: string; email: string; onError: (m: string) => void }) {
  const stripe = useStripe(); const elements = useElements(); const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const pay = async () => {
    if (!stripe || !elements) return
    setBusy(true); onError('')
    const result = await stripe.confirmPayment({ elements, redirect: 'if_required' })
    if (result.error) { setBusy(false); return onError(result.error.message || 'Payment failed') }
    const done = await completeCheckout(bookingRef, `complete:${bookingRef}`)
    setBusy(false)
    sessionStorage.setItem('tg_email', email)
    if (!done.ok) return onError(done.error)
    router.push(`/bookings/${bookingRef}`)
  }
  return <div className="space-y-3"><PaymentElement /><Button className="w-full" disabled={busy || !stripe} onClick={pay}>Pay</Button></div>
}

export function CheckoutForm({ holdId, hold, publishableKey }: { holdId: string; hold: any; publishableKey: string }) {
  const router = useRouter()
  const quote = hold.quote
  const tickets = quote.lines.filter((l: any) => l.kind === 'ticket')
  const people: { ticketTypeId: string; label: string }[] = tickets.flatMap((l: any) => Array.from({ length: l.qty }, () => ({ ticketTypeId: l.catalogId as string, label: l.name as string })))
  const [lead, setLead] = React.useState({ name: '', email: '', phone: '' })
  const [names, setNames] = React.useState<string[]>(people.map(() => ''))
  const [ages, setAges] = React.useState<string[]>(people.map(() => ''))
  const [error, setError] = React.useState('')
  const [checkout, setCheckout] = React.useState<any>(null)
  const [giftCode, setGiftCode] = React.useState(''), [gift, setGift] = React.useState<any>(null), [giftError, setGiftError] = React.useState(''), [giftOpen, setGiftOpen] = React.useState(false)
  const giftCents = gift ? Math.min(gift.balanceCents, quote.totalCents) : 0
  const applyGift = async () => {
    setGiftError(''); setGift(null)
    const r = await giftCardBalance(giftCode)
    if (!r.ok) return setGiftError(r.error)
    if (r.card.currencyCode !== quote.currencyCode) return setGiftError(`This gift card is in ${r.card.currencyCode}`)
    setGift({ ...r.card, code: giftCode })
  }
  const [left, setLeft] = React.useState(() => Math.max(0, new Date(hold.expiresAt).getTime() - Date.now()))
  const key = React.useRef(crypto.randomUUID())
  const stripePromise = React.useMemo(() => (publishableKey ? loadStripe(publishableKey) : null), [publishableKey])
  React.useEffect(() => { const t = setInterval(() => setLeft(Math.max(0, new Date(hold.expiresAt).getTime() - Date.now())), 1000); return () => clearInterval(t) }, [hold.expiresAt])

  const begin = async () => {
    setError('')
    const r = await startCheckout({ holdId, lead, giftCardCode: gift?.code || undefined, participants: people.map((p, i) => ({ ticketTypeId: p.ticketTypeId, fullName: names[i] || (i === 0 ? lead.name : ''), age: ages[i] ? Number(ages[i]) : undefined, email: i === 0 ? lead.email : undefined })) }, key.current)
    if (!r.ok) return setError(r.error)
    if (!r.checkout.clientSecret) { const done = await completeCheckout(r.checkout.bookingRef, `complete:${r.checkout.bookingRef}`); sessionStorage.setItem('tg_email', lead.email); return done.ok ? router.push(`/bookings/${r.checkout.bookingRef}`) : setError(done.error) }
    setCheckout(r.checkout)
  }
  const hh = Math.floor(left / 3600000), mm = String(Math.floor((left % 3600000) / 60000)).padStart(2, '0'), ss = String(Math.floor((left % 60000) / 1000)).padStart(2, '0')
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-2"><div><h1 className="text-xl font-semibold">{quote.tour.name}</h1><p className="text-sm text-muted-foreground">{when(quote.tour.startAt, quote.tour.timezone)}</p></div><p className="font-mono text-sm">Held {hh > 0 ? `${hh}h ${mm}m` : `${mm}:${ss}`}</p></header>
      <ul className="space-y-1 text-sm">{quote.lines.map((l: any, i: number) => <li key={i} className="flex justify-between gap-2"><span>{l.qty} × {l.name}</span><span className="font-mono">{money(l.unitPriceCents * l.qty, quote.currencyCode)}</span></li>)}
        {quote.discountCents > 0 && <li className="flex justify-between"><span>Discount</span><span className="font-mono">−{money(quote.discountCents, quote.currencyCode)}</span></li>}
        {quote.taxCents > 0 && <li className="flex justify-between"><span>Tax</span><span className="font-mono">{money(quote.taxCents, quote.currencyCode)}</span></li>}
        <li className="flex justify-between border-t pt-1 font-semibold"><span>Total</span><span className="font-mono">{money(quote.totalCents, quote.currencyCode)}</span></li>
        {(checkout?.giftCents || giftCents) > 0 && <>
          <li className="flex justify-between gap-2" data-gift-applied><span>Gift card ····{checkout?.giftLast4 || gift?.last4}</span><span className="font-mono">−{money(checkout?.giftCents ?? giftCents, quote.currencyCode)}</span></li>
          <li className="flex justify-between gap-2 font-semibold"><span>To pay by card</span><span className="font-mono">{money(checkout ? checkout.cardCents : quote.totalCents - giftCents, quote.currencyCode)}</span></li>
        </>}</ul>
      {left === 0 && <p className="text-sm text-rose-600">Hold expired. Choose seats again.</p>}
      {!checkout ? (
        <div className="space-y-3">
          <h2 className="text-base font-semibold">Lead booker</h2>
          <Input placeholder="Full name" value={lead.name} onChange={(e) => setLead({ ...lead, name: e.target.value })} />
          <Input type="email" placeholder="Email" value={lead.email} onChange={(e) => setLead({ ...lead, email: e.target.value })} />
          <Input placeholder="Phone" value={lead.phone} onChange={(e) => setLead({ ...lead, phone: e.target.value })} />
          <h2 className="pt-2 text-base font-semibold">Guests</h2>
          {people.map((p, i) => (
            <div key={i} className="grid grid-cols-[1fr_5rem] gap-2"><Input placeholder={`${p.label} ${i + 1} name`} value={names[i]} onChange={(e) => setNames(names.map((n, j) => (j === i ? e.target.value : n)))} /><Input inputMode="numeric" placeholder="Age" value={ages[i]} onChange={(e) => setAges(ages.map((n, j) => (j === i ? e.target.value : n)))} /></div>
          ))}
          <div className="space-y-2 border-t pt-3">
            {!giftOpen && !gift ? <button type="button" className="text-sm underline underline-offset-4" onClick={() => setGiftOpen(true)}>Have a gift card?</button> : gift ? (
              <p className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>Gift card ····{gift.last4} pays {money(giftCents, quote.currencyCode)}{gift.balanceCents > giftCents ? `, ${money(gift.balanceCents - giftCents, quote.currencyCode)} stays on the card` : ''}</span><button type="button" className="underline underline-offset-4" onClick={() => { setGift(null); setGiftCode('') }}>Remove</button></p>
            ) : (
              <div className="flex gap-2"><Input aria-label="Gift card code" placeholder="GC-XXXX-XXXX-XXXX" autoCapitalize="characters" value={giftCode} onChange={(e) => setGiftCode(e.target.value)} /><Button type="button" variant="outline" disabled={giftCode.replace(/[^A-Za-z0-9]/g, '').length < 12} onClick={applyGift}>Apply</Button></div>
            )}
            {giftError && <p className="text-sm text-rose-600">{giftError}</p>}
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <Button className="w-full" disabled={left === 0 || !lead.name || !lead.email} onClick={begin}>{giftCents >= quote.totalCents && quote.totalCents > 0 ? 'Book with gift card' : 'Continue to payment'}</Button>
        </div>
      ) : stripePromise ? (
        <Elements stripe={stripePromise} options={{ clientSecret: checkout.clientSecret }}><Pay bookingRef={checkout.bookingRef} email={lead.email} onError={setError} />{error && <p className="mt-2 text-sm text-rose-600">{error}</p>}</Elements>
      ) : <p className="text-sm text-rose-600">Payments are not configured.</p>}
    </div>
  )
}
