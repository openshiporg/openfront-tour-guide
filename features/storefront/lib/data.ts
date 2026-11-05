'use server'

import { randomUUID } from 'node:crypto'
import { cookies } from 'next/headers'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'

// Guest proof: a random token kept in an httpOnly cookie. Only its SHA-256 digest is stored.
const PROOF = 'tour_guest_proof'
async function proof() {
  const jar = await cookies()
  let token = jar.get(PROOF)?.value
  if (!token) { token = randomUUID() + randomUUID().replaceAll('-', ''); jar.set(PROOF, token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7 }) }
  return token
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
export async function startCheckout(input: { holdId: string; lead: any; participants: any[] }, key: string) {
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
