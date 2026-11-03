'use server'

import { platformQuery } from '../../lib/gql'

export async function getGuides() {
  const data = await platformQuery<{ guides: any[] }>(`query{ guides(take:100, orderBy:[{name:asc}]){ id name status languages payRateType payRateCents certifications{ id name expiresAt } assignments(where:{status:{in:[offered,accepted]}}, take:5){ id status role departure{ startAt tour{ name } } } } }`)
  return data?.guides || []
}
