export const money = (cents: number, currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format((cents || 0) / 100)
export const when = (value: string | Date, zone = 'America/New_York') => new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
export const dayOf = (value: string | Date, zone = 'America/New_York') => new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(new Date(value))

export const hoursText = (minutes: number) => { const h = Math.floor(minutes / 60), m = minutes % 60; return h && m ? `${h} h ${m} min` : h ? `${h} ${h === 1 ? 'hour' : 'hours'}` : `${m} min` }
// The tour's uploaded photo, or the first entry of its older free-form images list.
export function tourPhoto(t: any): string | null {
  if (t?.photo?.url) return t.photo.url
  const i = Array.isArray(t?.images) ? t.images[0] : null
  return typeof i === 'string' ? i : i?.url || i?.src || null
}
export const kindText: Record<string, string> = { walking: 'Walking tour', food: 'Food tour', water: 'On the water', bike: 'Bike tour', vehicle_day_trip: 'Day trip', multi_day: 'Multi-day trip', private_only: 'Private tour' }
// A JSON list field entered by the operator: keep only plain text lines.
export const lines = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()) : [])
