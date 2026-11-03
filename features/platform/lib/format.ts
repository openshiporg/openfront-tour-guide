export const money = (cents: number | null | undefined, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format((cents || 0) / 100)
export const timeIn = (value: string | Date, zone = 'America/New_York') =>
  new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' }).format(new Date(value))
export const dayIn = (value: string | Date, zone = 'America/New_York') =>
  new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(value))
export const dayKey = (value: string | Date, zone = 'America/New_York') =>
  new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(new Date(value))
