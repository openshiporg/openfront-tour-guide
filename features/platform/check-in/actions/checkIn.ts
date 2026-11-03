'use server'

import { revalidatePath } from 'next/cache'
import { platformMutation, platformQuery } from '../../lib/gql'

export async function getManifest(departureId: string) {
  const data = await platformQuery<{ departureManifest: any }>(`query($id:ID!){ departureManifest(departureId:$id) }`, { id: departureId })
  return data?.departureManifest || null
}
export async function checkInAction(participantId: string) {
  const result = await platformMutation(`mutation($input:ParticipantActionInput!,$idempotencyKey:String!){ checkInParticipant(input:$input,idempotencyKey:$idempotencyKey) }`, { input: { participantId } })
  revalidatePath('/dashboard/platform/check-in')
  return result
}
export async function noShowAction(bookingId: string) {
  const result = await platformMutation(`mutation($input:BookingActionInput!,$idempotencyKey:String!){ markNoShow(input:$input,idempotencyKey:$idempotencyKey) }`, { input: { bookingId } })
  revalidatePath('/dashboard/platform/check-in')
  return result
}
