'use server'

import { revalidatePath } from 'next/cache'
import { platformMutation, platformQuery } from '../../lib/gql'

export async function getDepartures(from: string, to: string) {
  const data = await platformQuery<{ departuresInRange: any[] }>(`query($from:String!,$to:String!){ departuresInRange(from:$from,to:$to) }`, { from, to })
  return data?.departuresInRange || []
}
export async function cancelDepartureAction(departureId: string, reason: string) {
  const result = await platformMutation(`mutation($input:CancelDepartureInput!,$idempotencyKey:String!){ cancelDeparture(input:$input,idempotencyKey:$idempotencyKey) }`, { input: { departureId, reason } })
  revalidatePath('/dashboard/platform/today')
  return result
}
