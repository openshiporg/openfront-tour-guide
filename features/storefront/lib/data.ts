'use server'

import { randomUUID } from 'node:crypto'
import { cookies } from 'next/headers'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'

// Guest proof: a random token kept in an httpOnly cookie. Only its SHA-256 digest is stored.
// Over HTTPS it is SameSite=None; Secure; Partitioned (CHIPS) so a framed shop
// (the Oathkeeper Browser, an embed) keeps its seat hold through checkout:
// Safari keeps a cookie in a cross-site frame only when it is partitioned. It
// uses a new name because a browser keeps a partitioned and an unpartitioned
// cookie of the same name side by side; the earlier Lax cookie is still read.
const PROOF = 'tour_guest_proof_p'
const LEGACY_PROOF = 'tour_guest_proof'
const production = process.env.NODE_ENV === 'production'
async function proof() {
  const jar = await cookies()
  let token = jar.get(PROOF)?.value || jar.get(LEGACY_PROOF)?.value
  if (!jar.get(PROOF)?.value) {
    token ||= randomUUID() + randomUUID().replaceAll('-', '')
    try {
      jar.set(PROOF, token, { httpOnly: true, path: '/', maxAge: 60 * 60 * 24 * 7, ...(production ? { sameSite: 'none' as const, secure: true, partitioned: true } : { sameSite: 'lax' as const }) })
    } catch {
      // Server Components can't set cookies; the next Server Action will.
    }
  }
  return token as string
}
async function call<T = any>(query: string, variables: Record<string, unknown>): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const r = await keystoneClient<T>(query, variables)
  return r.success ? { ok: true, data: r.data as T } : { ok: false, error: r.error || 'Request failed' }
}

export async function getTours() {
  const r = await call<{ toursOnSale: any[] }>(`query{ toursOnSale }`, {})
  return r.ok ? r.data.toursOnSale : []
}
export async function getOperatorName() {
  const r = await call<{ operatorName: string | null }>(`query{ operatorName }`, {})
  return (r.ok && r.data.operatorName) || 'Openfront Tour Guide'
}
export async function getAvailability(tourId: string, from: string, to: string) {
  const r = await call<{ tourAvailability: any[] }>(`query($t:ID!,$f:String!,$to:String!){ tourAvailability(tourId:$t, from:$f, to:$to) }`, { t: tourId, f: from, to })
  return r.ok ? r.data.tourAvailability : []
}
export async function holdSeats(input: { departureId: string; tickets: { id: string; qty: number }[]; addOns: { id: string; qty: number }[]; promoCode?: string }, key: string) {
  const token = await proof()
  const r = await call<{ createDepartureHold: any }>(`mutation($i:DepartureHoldInput!,$k:String!){ createDepartureHold(input:$i, idempotencyKey:$k) }`, { i: { ...input, token }, k: key })
  return r.ok ? { ok: true as const, hold: r.data.createDepartureHold } : r
}
export async function getHold(holdId: string) {
  const token = await proof()
  const r = await call<{ checkoutHold: any }>(`query($h:ID!,$t:String!){ checkoutHold(holdId:$h, token:$t) }`, { h: holdId, t: token })
  return r.ok ? r.data.checkoutHold : null
}
// What a gift card code is worth before paying (balance, expiry). Wrong and void codes give the same answer.
export async function giftCardBalance(code: string) {
  const r = await call<{ giftCardBalance: any }>(`query($c:String!){ giftCardBalance(code:$c) }`, { c: code })
  return r.ok ? { ok: true as const, card: r.data.giftCardBalance } : r
}
export async function startCheckout(input: { holdId: string; lead: any; participants: any[]; giftCardCode?: string }, key: string) {
  const token = await proof()
  const r = await call<{ startBookingCheckout: any }>(`mutation($i:StartBookingCheckoutInput!,$k:String!){ startBookingCheckout(input:$i, idempotencyKey:$k) }`, { i: { ...input, token }, k: key })
  return r.ok ? { ok: true as const, checkout: r.data.startBookingCheckout } : r
}
export async function completeCheckout(bookingRef: string, key: string) {
  const token = await proof()
  const r = await call<{ completeBookingCheckout: any }>(`mutation($i:CompleteBookingCheckoutInput!,$k:String!){ completeBookingCheckout(input:$i, idempotencyKey:$k) }`, { i: { bookingRef, token }, k: key })
  return r.ok ? { ok: true as const, result: r.data.completeBookingCheckout } : r
}
export async function lookup(bookingRef: string, email: string) {
  const r = await call<{ lookupBooking: any }>(`query($r:String!,$e:String!){ lookupBooking(bookingRef:$r, email:$e) }`, { r: bookingRef, e: email })
  return r.ok ? { ok: true as const, booking: r.data.lookupBooking } : r
}
export async function cancelBooking(bookingRef: string, email: string, key: string) {
  const r = await call<{ cancelMyBooking: any }>(`mutation($r:String!,$e:String!,$k:String!){ cancelMyBooking(bookingRef:$r, email:$e, idempotencyKey:$k) }`, { r: bookingRef, e: email, k: key })
  return r.ok ? { ok: true as const, booking: r.data.cancelMyBooking } : r
}
export async function getWaiver(token: string) {
  const r = await call<{ waiverForToken: any }>(`query($t:String!){ waiverForToken(token:$t) }`, { t: token })
  return r.ok ? { ok: true as const, waiver: r.data.waiverForToken } : r
}
export async function signWaiver(input: { token: string; signerName: string; isGuardian: boolean; minorName?: string }, key: string) {
  const r = await call(`mutation($i:SignWaiverInput!,$k:String!){ signWaiver(input:$i, idempotencyKey:$k) }`, { i: input, k: key })
  return r.ok ? { ok: true as const } : r
}
export async function manage(bookingRef: string, token: string) {
  const r = await call<{ manageBooking: any }>(`query($r:String!,$t:String!){ manageBooking(bookingRef:$r, token:$t) }`, { r: bookingRef, t: token })
  return r.ok ? { ok: true as const, booking: r.data.manageBooking } : r
}
export async function manageCancel(bookingRef: string, token: string, key: string) {
  const r = await call<{ cancelManagedBooking: any }>(`mutation($r:String!,$t:String!,$k:String!){ cancelManagedBooking(bookingRef:$r, token:$t, idempotencyKey:$k) }`, { r: bookingRef, t: token, k: key })
  return r.ok ? { ok: true as const, result: r.data.cancelManagedBooking } : r
}
export async function manageReschedule(bookingRef: string, token: string, departureId: string, key: string) {
  const r = await call<{ rescheduleManagedBooking: any }>(`mutation($r:String!,$t:String!,$d:ID!,$k:String!){ rescheduleManagedBooking(bookingRef:$r, token:$t, departureId:$d, idempotencyKey:$k) }`, { r: bookingRef, t: token, d: departureId, k: key })
  return r.ok ? { ok: true as const, result: r.data.rescheduleManagedBooking } : r
}
export async function joinWaitlist(input: { departureId: string; tickets: { id: string; qty: number }[]; lead: { name: string; email: string; phone?: string } }, key: string) {
  const r = await call<{ joinWaitlist: any }>(`mutation($i:WaitlistJoinInput!,$k:String!){ joinWaitlist(input:$i, idempotencyKey:$k) }`, { i: input, k: key })
  return r.ok ? { ok: true as const, entry: r.data.joinWaitlist } : r
}
export async function waitlistStatus(entryId: string, token: string) {
  const r = await call<{ waitlistStatus: any }>(`query($e:ID!,$t:String!){ waitlistStatus(entryId:$e, token:$t) }`, { e: entryId, t: token })
  return r.ok ? { ok: true as const, entry: r.data.waitlistStatus } : r
}
// Binds the offer's held seats to this browser's checkout proof, then the normal checkout page takes over.
export async function claimWaitlistOffer(entryId: string, token: string) {
  const cartToken = await proof()
  const r = await call<{ claimWaitlistOffer: any }>(`mutation($e:ID!,$t:String!,$c:String!){ claimWaitlistOffer(entryId:$e, token:$t, cartToken:$c) }`, { e: entryId, t: token, c: cartToken })
  return r.ok ? { ok: true as const, result: r.data.claimWaitlistOffer } : r
}
export async function leaveWaitlist(entryId: string, token: string, key: string) {
  const r = await call<{ leaveWaitlist: any }>(`mutation($e:ID!,$t:String!,$k:String!){ leaveWaitlist(entryId:$e, token:$t, idempotencyKey:$k) }`, { e: entryId, t: token, k: key })
  return r.ok ? { ok: true as const } : r
}
export type PartyChange = { keep: string[]; add: { ticketTypeId: string; fullName: string; age?: number | null }[] }
export async function partyQuote(bookingRef: string, token: string, input: PartyChange) {
  const r = await call<{ partyChangeQuote: any }>(`query($r:String!,$t:String!,$i:PartyChangeInput!){ partyChangeQuote(bookingRef:$r, token:$t, input:$i) }`, { r: bookingRef, t: token, i: input })
  return r.ok ? { ok: true as const, quote: r.data.partyChangeQuote } : r
}
export async function changeParty(bookingRef: string, token: string, input: PartyChange, key: string) {
  const r = await call<{ changeParty: any }>(`mutation($r:String!,$t:String!,$i:PartyChangeInput!,$k:String!){ changeParty(bookingRef:$r, token:$t, input:$i, idempotencyKey:$k) }`, { r: bookingRef, t: token, i: input, k: key })
  return r.ok ? { ok: true as const, result: r.data.changeParty } : r
}
export async function completePartyChange(bookingRef: string, token: string, changeId: string) {
  const r = await call<{ completePartyChange: any }>(`mutation($r:String!,$t:String!,$c:ID!){ completePartyChange(bookingRef:$r, token:$t, changeId:$c) }`, { r: bookingRef, t: token, c: changeId })
  return r.ok ? { ok: true as const, result: r.data.completePartyChange } : r
}
