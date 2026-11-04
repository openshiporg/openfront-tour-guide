'use server'

import { revalidatePath } from 'next/cache'
import { platformMutation, platformQuery } from '../../lib/gql'

export async function getBookingOptions() {
  return await platformQuery<{ departures: any[]; channels: any[] }>(`query($now:DateTime!){ departures(where:{startAt:{gt:$now},status:{in:[on_sale,confirmed,min_not_met]}},take:200,orderBy:[{startAt:asc}]){ id startAt tour{ name ticketTypes(where:{active:{equals:true}},take:30){ id name priceCents } } } channels(where:{active:{equals:true}},take:100){id name paymentModel} }`, { now: new Date().toISOString() }) || { departures: [], channels: [] }
}
export async function createOperatorBooking(input: Record<string, unknown>) {
  const result = await platformMutation(`mutation($input:ChannelBookingInput!,$idempotencyKey:String!){createChannelBooking(input:$input,idempotencyKey:$idempotencyKey)}`, { input })
  revalidatePath('/dashboard/platform/bookings')
  return result
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
