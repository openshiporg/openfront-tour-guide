// Staff screens show times in the operator's time zone (Settings). Server pages load it with loadOperatorZone();
// the dashboard layout passes it to the browser with <OperatorZone>.
let operatorZone = 'America/New_York'
export const setOperatorZone = (zone?: string | null) => { if (zone) operatorZone = zone }
export const currentZone = () => operatorZone
export const money = (cents: number | null | undefined, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format((cents || 0) / 100)
export const timeIn = (value: string | Date, zone = operatorZone) =>
  new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' }).format(new Date(value))
export const dayIn = (value: string | Date, zone = operatorZone) =>
  new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(value))
export const dayKey = (value: string | Date, zone = operatorZone) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(new Date(value))
