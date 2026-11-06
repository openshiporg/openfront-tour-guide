'use server'

import { revalidatePath } from 'next/cache'
import { platformMutation, platformQuery } from '../../lib/gql'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'

export async function getBookingOptions() {
  // Departures and tours are fetched separately and joined here: nesting tour{ticketTypes} under ~150
  // departures makes Keystone issue a query per row (10s+), which hits the internal GraphQL timeout.
  const data = await platformQuery<{ departures: any[]; tours: any[]; channels: any[] }>(`query($now:DateTime!){ departures(where:{startAt:{gt:$now},status:{in:[on_sale,confirmed,min_not_met]}},take:200,orderBy:[{startAt:asc}]){ id startAt tour{ id } } tours(where:{status:{equals:active}},take:100){ id name ticketTypes(where:{active:{equals:true}},take:30){ id name priceCents } } channels(where:{active:{equals:true}},take:100){id name paymentModel} }`, { now: new Date().toISOString() })
  if (!data) return { departures: [], channels: [] }
  const tours = new Map(data.tours.map((t) => [t.id, t]))
  return { departures: data.departures.filter((d) => tours.has(d.tour?.id)).map((d) => ({ id: d.id, startAt: d.startAt, tour: tours.get(d.tour?.id) })), channels: data.channels }
}
export async function createOperatorBooking(input: Record<string, unknown>, idempotencyKey: string) {
  // The key comes from the form, so a retry after a timeout replays the same command instead of booking again.
  const result = await platformMutation(`mutation($input:ChannelBookingInput!,$idempotencyKey:String!){createChannelBooking(input:$input,idempotencyKey:$idempotencyKey)}`, { input, idempotencyKey })
  revalidatePath('/dashboard/platform/bookings')
  return result
}
// After a timeout or error: did this key commit? Returns the booking if so.
export async function findOperatorBooking(idempotencyKey: string) {
  const data = await platformQuery<{ operatorBookingByKey: any }>(`query($idempotencyKey:String!){ operatorBookingByKey(idempotencyKey:$idempotencyKey) }`, { idempotencyKey })
  return data?.operatorBookingByKey?.found ? (data.operatorBookingByKey as { bookingRef: string; guestName: string; totalCents: number; seats: number }) : null
}
export async function getBookings(status: string | null) {
  const where = status ? { status: { equals: status } } : {}
  const data = await platformQuery<{ bookings: any[]; bookingsCount: number }>(
    `query($where:BookingWhereInput!){ bookings(where:$where, take:100, orderBy:[{createdAt:desc}]){ id bookingRef status guestName guestEmail source totalCents refundedCents currencyCode seats departure{ startAt tour{ name } } } bookingsCount(where:$where) }`, { where })
  return data || { bookings: [], bookingsCount: 0 }
}
export async function getStatusCounts(statuses: string[]) {
  const query = `query{ ${statuses.map((s) => `${s}: bookingsCount(where:{status:{equals:${s}}})`).join(' ')} all: bookingsCount }`
  return (await platformQuery<Record<string, number>>(query)) || {}
}
export async function refundAction(bookingId: string, amountCents: number, reason: string, cancelBooking: boolean) {
  const result = await platformMutation(`mutation($input:RefundBookingInput!,$idempotencyKey:String!){ refundBooking(input:$input,idempotencyKey:$idempotencyKey) }`, { input: { bookingId, amountCents, reason, cancelBooking } })
  revalidatePath('/dashboard/platform/bookings')
  return result
}

export async function resetGuestLinkAction(bookingId: string, reason: string) {
  const result = await platformMutation(`mutation($input:ResetGuestLinkInput!,$idempotencyKey:String!){ resetGuestLink(input:$input,idempotencyKey:$idempotencyKey) }`, { input: { bookingId, reason } })
  return result.success ? { success: true as const, link: String((result.data as any)?.resetGuestLink?.link || '') } : result
}
export async function getMoveOptionsAction(bookingId: string) {
  const data = await platformQuery<{ bookingMoveOptions: { canMove: boolean; options: { id: string; startAt: string; remaining: number }[] } }>(`query($bookingId:ID!){ bookingMoveOptions(bookingId:$bookingId) }`, { bookingId })
  return data?.bookingMoveOptions || null
}
export async function moveBookingAction(bookingId: string, departureId: string, reason: string, idempotencyKey: string) {
  const result = await platformMutation(`mutation($input:MoveBookingInput!,$idempotencyKey:String!){ moveBooking(input:$input,idempotencyKey:$idempotencyKey) }`, { input: { bookingId, departureId, reason }, idempotencyKey })
  revalidatePath('/dashboard/platform/bookings')
  return result.success ? { success: true as const, startAt: String((result.data as any)?.moveBooking?.startAt || '') } : result
}
export async function getRefundThreshold() {
  const data = await platformQuery<{ storeSettingsItems: { refundApprovalThresholdCents: number | null }[] }>(`query{ storeSettingsItems(take:1){ refundApprovalThresholdCents } }`)
  return data?.storeSettingsItems?.[0]?.refundApprovalThresholdCents ?? 10000
}
export async function getRefundApprovals() {
  const data = await platformQuery<{ authenticatedItem: { id: string } | null; managerApprovals: any[] }>(
    `query{ authenticatedItem { ... on User { id } } managerApprovals(where:{status:{in:["pending","approved"]}, expiresAt:{gt:"${new Date().toISOString()}"}}, orderBy:[{requestedAt:desc}], take:50){ id targetId amount reason status expiresAt requestedBy{ id name } approvedBy{ name } } }`)
  const rows = data?.managerApprovals || []
  const ids = [...new Set(rows.map((r) => r.targetId))]
  const found = ids.length ? await platformQuery<{ bookings: any[] }>(`query($ids:[ID!]){ bookings(where:{id:{in:$ids}}){ id bookingRef guestName currencyCode totalCents refundedCents } }`, { ids }) : null
  const byId = new Map((found?.bookings || []).map((b) => [b.id, b]))
  return { me: data?.authenticatedItem?.id || null, rows: rows.map((r) => ({ ...r, booking: byId.get(r.targetId) || null })) }
}
export async function requestApprovalAction(bookingId: string, amountCents: number, reason: string) {
  const result = await platformMutation(`mutation($bookingId:ID!,$reason:String!,$amount:Int!){ requestRefundApproval(bookingId:$bookingId,reason:$reason,amount:$amount) }`, { bookingId, reason, amount: amountCents })
  revalidatePath('/dashboard/platform/bookings')
  return result
}
export async function approveRefundAction(approvalId: string) {
  const result = await platformMutation(`mutation($approvalId:ID!){ approveRefund(approvalId:$approvalId) }`, { approvalId })
  revalidatePath('/dashboard/platform/bookings')
  return result
}
export type PartyInput = { keep: string[]; add: { ticketTypeId: string; fullName: string; age?: number | null }[] }
export async function getBookingPartyAction(bookingId: string) {
  const data = await platformQuery<{ bookingParty: any }>(`query($bookingId:ID!){ bookingParty(bookingId:$bookingId) }`, { bookingId })
  return data?.bookingParty || null
}
export async function quotePartyAction(bookingId: string, input: PartyInput) {
  const r = await keystoneClient<{ bookingPartyQuote: any }>(`query($bookingId:ID!,$input:PartyChangeInput!){ bookingPartyQuote(bookingId:$bookingId,input:$input) }`, { bookingId, input })
  return r.success ? { ok: true as const, quote: (r.data as any).bookingPartyQuote } : { ok: false as const, error: r.error || 'Could not price the change' }
}
export async function changePartyAction(bookingId: string, input: PartyInput, reason: string, idempotencyKey: string) {
  const send = () => platformMutation(`mutation($input:StaffPartyChangeInput!,$idempotencyKey:String!){ changeBookingParty(input:$input,idempotencyKey:$idempotencyKey) }`, { input: { bookingId, ...input, reason }, idempotencyKey })
  // A change with a refund can outlast the client timeout on a slow database. The same key replays the committed change (and finishes the
  // refund if it was still in flight), so one quiet retry turns a timeout into the real answer instead of a scary error.
  let result = await send()
  if (!result.success && /Unable to complete the request/i.test(String(result.error || ''))) result = await send()
  revalidatePath('/dashboard/platform/bookings')
  return result.success ? { success: true as const, change: (result.data as any)?.changeBookingParty } : result
}
