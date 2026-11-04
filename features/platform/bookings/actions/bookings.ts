'use server'

import { revalidatePath } from 'next/cache'
import { platformMutation, platformQuery } from '../../lib/gql'

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
