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
export async function undoNoShowAction(bookingId: string) {
  const result = await platformMutation(`mutation($input:BookingActionInput!,$idempotencyKey:String!){ undoNoShow(input:$input,idempotencyKey:$idempotencyKey) }`, { input: { bookingId } })
  revalidatePath('/dashboard/platform/check-in')
  return result
}
export async function getParticipantWaiver(participantId: string) {
  const data = await platformQuery<{ participantWaiver: { participantId: string; participantName: string; age: number | null; status: string; name: string; version: number; text: string } }>(`query($id:ID!){ participantWaiver(participantId:$id) }`, { id: participantId })
  return data?.participantWaiver || null
}
export async function captureWaiverAction(participantId: string, signerName: string, isGuardian: boolean) {
  const result = await platformMutation(`mutation($input:CaptureWaiverInput!,$idempotencyKey:String!){ captureWaiverOnSite(input:$input,idempotencyKey:$idempotencyKey) }`, { input: { participantId, signerName, isGuardian } })
  revalidatePath('/dashboard/platform/check-in'); revalidatePath('/dashboard/platform/today')
  return result
}
export async function syncOfflineAction(departureId: string, events: { key: string; kind: 'check_in' | 'no_show'; participantId?: string; bookingId?: string; recordedAt: string }[], idempotencyKey: string) {
  const result = await platformMutation(`mutation($input:SyncOfflineCheckInsInput!,$idempotencyKey:String!){ syncOfflineCheckIns(input:$input,idempotencyKey:$idempotencyKey) }`, { input: { departureId, events }, idempotencyKey })
  revalidatePath('/dashboard/platform/check-in')
  return result.success ? { success: true as const, data: (result.data as any).syncOfflineCheckIns } : result
}
