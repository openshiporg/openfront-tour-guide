'use server'

import { revalidatePath } from 'next/cache'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { platformQuery } from '../../lib/gql'

export type Rule = { id: string; name: string; tourId: string; ticketTypeId: string | null; from: string | null; to: string | null; weekdays: number[]; adjustBps: number | null; overridePriceCents: number | null; currencyCode: string }
export type Ticket = { id: string; name: string; priceCents: number; currencyCode: string }
export type TourRow = { id: string; name: string; timezone: string; ticketTypes: Ticket[] }

export async function getPricingBoard() {
  const data = await platformQuery<{ pricingRuleBoard: { tours: TourRow[]; rules: Rule[] } }>(`query{ pricingRuleBoard }`)
  return data?.pricingRuleBoard || { tours: [], rules: [] }
}
// keystoneClient directly: the screen keeps the idempotency key across retries and shows the refusal text.
export async function savePricingRuleAction(input: Record<string, unknown>, idempotencyKey: string) {
  const r = await keystoneClient(`mutation($input:PricingRuleInput!,$k:String!){ savePricingRule(input:$input,idempotencyKey:$k) }`, { input, k: idempotencyKey })
  revalidatePath('/dashboard/platform/pricing')
  return r.success ? { success: true as const } : { success: false as const, error: r.error || 'Could not save the rule' }
}
export async function removePricingRuleAction(id: string, idempotencyKey: string) {
  const r = await keystoneClient(`mutation($input:PricingRuleRemoveInput!,$k:String!){ removePricingRule(input:$input,idempotencyKey:$k) }`, { input: { id }, k: idempotencyKey })
  revalidatePath('/dashboard/platform/pricing')
  return r.success ? { success: true as const } : { success: false as const, error: r.error || 'Could not remove the rule' }
}
