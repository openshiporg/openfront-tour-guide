'use server'
import { revalidatePath } from 'next/cache'
import { platformMutation, platformQuery } from '../../lib/gql'

export async function getSettlements() {
  return await platformQuery<{ guidePayouts: any[]; channelStatements: any[]; channels: any[] }>(`query {
    guidePayouts(take:100,orderBy:[{createdAt:desc}]){ id status totalCents currencyCode periodStart periodEnd reference paidAt guide{name} }
    channelStatements(take:100,orderBy:[{createdAt:desc}]){ id status grossCents commissionCents netDueCents currencyCode periodStart periodEnd channel{name} }
    channels(take:100,where:{active:{equals:true}}){id name}
  }`) || { guidePayouts: [], channelStatements: [], channels: [] }
}
export async function transitionSettlement(kind: 'payout' | 'statement', input: { id: string; status: string; reference?: string }) {
  if (!['payout','statement'].includes(kind)) throw new Error('Invalid settlement kind')
  const operation = kind === 'payout' ? 'transitionGuidePayout' : 'transitionChannelStatement'
  const result = await platformMutation(`mutation($input:SettlementTransitionInput!,$idempotencyKey:String!){${operation}(input:$input,idempotencyKey:$idempotencyKey)}`, { input })
  revalidatePath('/dashboard/platform/guides'); revalidatePath('/dashboard/platform/channels')
  return result
}
export async function generateStatement(input: { channelId: string; from: string; to: string }) {
  const result = await platformMutation(`mutation($input:ChannelStatementInput!,$idempotencyKey:String!){generateChannelStatement(input:$input,idempotencyKey:$idempotencyKey)}`, { input })
  revalidatePath('/dashboard/platform/channels')
  return result
}
