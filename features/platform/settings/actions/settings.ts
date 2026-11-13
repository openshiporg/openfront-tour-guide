'use server'

import { revalidatePath } from 'next/cache'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { platformQuery } from '../../lib/gql'

export type OperatorSettings = { id: string; name: string; timezone: string; address: string; currencyCode: string; taxBps: number; refundApprovalThresholdCents: number; waitlistOfferHours: number }

export async function getOperatorSettings() {
  const data = await platformQuery<{ storeSettingsItems: OperatorSettings[] }>(`query{ storeSettingsItems(take:1){ id name timezone address currencyCode taxBps refundApprovalThresholdCents waitlistOfferHours } }`)
  return data?.storeSettingsItems?.[0] || null
}
export async function saveOperatorSettings(id: string, input: Omit<OperatorSettings, 'id' | 'currencyCode'>) {
  const r = await keystoneClient(`mutation($id:ID!,$data:StoreSettingsUpdateInput!){ updateStoreSettings(where:{id:$id}, data:$data){ id } }`, { id, data: input })
  revalidatePath('/dashboard/platform/settings')
  return r.success ? { success: true as const } : { success: false as const, error: r.error || 'Could not save the settings' }
}
