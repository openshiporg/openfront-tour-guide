'use server'

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { randomUUID } from 'node:crypto'

export async function platformQuery<T = any>(query: string, variables: Record<string, unknown> = {}): Promise<T | null> {
  const response = await keystoneClient<T>(query, variables)
  return response.success ? (response.data as T) : null
}
export async function platformMutation(query: string, variables: Record<string, unknown> = {}) {
  const response = await keystoneClient(query, { idempotencyKey: randomUUID(), ...variables })
  return response.success ? { success: true as const, data: response.data } : { success: false as const, error: response.error }
}
