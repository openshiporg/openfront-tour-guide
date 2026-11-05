'use server'

import { revalidatePath } from 'next/cache'
import { platformMutation, platformQuery } from '../../lib/gql'

export async function getWaitlist(status: string) {
  const data = await platformQuery<{ waitlistBoard: any[] }>(`query($s:String){ waitlistBoard(status:$s) }`, { s: status })
  return data?.waitlistBoard || []
}
// Departures that can take a waitlist entry (full or nearly), with their ticket types; same flat reads as the booking form.
export async function getWaitlistDepartures() {
  const data = await platformQuery<{ departures: any[]; tours: any[] }>(`query($now:DateTime!){ departures(where:{startAt:{gt:$now},status:{in:[on_sale,confirmed,min_not_met,full]}},take:200,orderBy:[{startAt:asc}]){ id startAt remaining tour{ id } } tours(where:{status:{equals:active}},take:100){ id name ticketTypes(where:{active:{equals:true}},take:30){ id name priceCents } } }`, { now: new Date().toISOString() })
  if (!data) return []
  const tours = new Map(data.tours.map((t) => [t.id, t]))
  return data.departures.filter((d) => tours.has(d.tour?.id)).map((d) => ({ id: d.id, startAt: d.startAt, remaining: d.remaining, tour: tours.get(d.tour?.id) }))
}
export async function addToWaitlistAction(input: Record<string, unknown>, idempotencyKey: string) {
  const result = await platformMutation(`mutation($input:WaitlistJoinInput!,$idempotencyKey:String!){ addToWaitlist(input:$input,idempotencyKey:$idempotencyKey) }`, { input, idempotencyKey })
  revalidatePath('/dashboard/platform/waitlist')
  return result.success ? { success: true as const, entry: (result.data as any).addToWaitlist } : result
}
export async function bookWaitlistOfferAction(entryId: string, participants: string[], idempotencyKey: string) {
  const result = await platformMutation(`mutation($input:WaitlistBookInput!,$idempotencyKey:String!){ bookWaitlistOffer(input:$input,idempotencyKey:$idempotencyKey) }`, { input: { entryId, participants }, idempotencyKey })
  revalidatePath('/dashboard/platform/waitlist'); revalidatePath('/dashboard/platform/bookings')
  return result.success ? { success: true as const, booking: (result.data as any).bookWaitlistOffer } : result
}
export async function withdrawWaitlistAction(entryId: string, reason: string) {
  const result = await platformMutation(`mutation($input:WaitlistWithdrawInput!,$idempotencyKey:String!){ withdrawWaitlistEntry(input:$input,idempotencyKey:$idempotencyKey) }`, { input: { entryId, reason } })
  revalidatePath('/dashboard/platform/waitlist')
  return result
}
