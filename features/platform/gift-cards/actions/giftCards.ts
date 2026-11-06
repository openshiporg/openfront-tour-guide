'use server'

import { revalidatePath } from 'next/cache'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { platformQuery } from '../../lib/gql'

export async function getGiftCards(search: string) {
  const data = await platformQuery<{ giftCardBoard: any }>(`query($s:String){ giftCardBoard(search:$s) }`, { s: search || null })
  return data?.giftCardBoard || { cards: [], outstandingCents: 0, activeCards: 0 }
}
// keystoneClient directly (not platformMutation): the caller keeps the idempotency key across retries, and refusals reach the screen.
export async function issueGiftCardAction(input: Record<string, unknown>, idempotencyKey: string) {
  const r = await keystoneClient<{ issueGiftCard: any }>(`mutation($input:IssueGiftCardInput!,$k:String!){ issueGiftCard(input:$input,idempotencyKey:$k) }`, { input, k: idempotencyKey })
  revalidatePath('/dashboard/platform/gift-cards')
  return r.success ? { success: true as const, card: r.data!.issueGiftCard } : { success: false as const, error: r.error || 'Could not issue the gift card' }
}
export async function voidGiftCardAction(id: string, reason: string, idempotencyKey: string) {
  const r = await keystoneClient<{ voidGiftCard: any }>(`mutation($input:VoidGiftCardInput!,$k:String!){ voidGiftCard(input:$input,idempotencyKey:$k) }`, { input: { id, reason }, k: idempotencyKey })
  revalidatePath('/dashboard/platform/gift-cards')
  return r.success ? { success: true as const } : { success: false as const, error: r.error || 'Could not void the gift card' }
}
export async function revealGiftCardCodeAction(id: string) {
  const r = await keystoneClient<{ revealGiftCardCode: any }>(`mutation($id:ID!){ revealGiftCardCode(id:$id) }`, { id })
  return r.success ? { success: true as const, code: r.data!.revealGiftCardCode.code as string } : { success: false as const, error: r.error || 'Could not show the code' }
}
