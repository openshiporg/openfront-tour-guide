'use server'

import { platformQuery, platformMutation } from '../../lib/gql'
import { revalidatePath } from 'next/cache'

export async function guideAction(operation: 'assignGuide' | 'respondToAssignment', input: Record<string, unknown>) {
  if (!['assignGuide', 'respondToAssignment'].includes(operation)) throw new Error('Invalid guide action')
  const type = operation === 'assignGuide' ? 'AssignGuideInput' : 'RespondAssignmentInput'
  const r = await platformMutation(`mutation($input:${type}!,$idempotencyKey:String!){${operation}(input:$input,idempotencyKey:$idempotencyKey)}`, { input })
  revalidatePath('/dashboard/platform/guides')
  return r
}

export async function getGuides() {
  const data = await platformQuery<{ guides: any[] }>(`query{ guides(take:100, orderBy:[{name:asc}]){ id name status languages payRateType payRateCents certifications{ id name expiresAt } assignments(where:{status:{in:[offered,accepted]}}, take:5){ id status role departure{ startAt tour{ name } } } } }`)
  return data?.guides || []
}
