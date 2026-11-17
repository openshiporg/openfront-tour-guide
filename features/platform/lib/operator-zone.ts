import { keystoneContext } from '@/features/keystone/context'
import { setOperatorZone, currentZone } from './format'

// The operator's time zone from Settings (readable by every staff role, guides included). Invalid values fall back to the current one.
export async function loadOperatorZone() {
  const row = await (keystoneContext.sudo().prisma as any).storeSettings.findFirst({ select: { timezone: true } })
  const zone = String(row?.timezone || '')
  try { if (zone) { new Intl.DateTimeFormat('en-US', { timeZone: zone }); setOperatorZone(zone) } } catch { /* keep the current zone */ }
  return currentZone()
}
