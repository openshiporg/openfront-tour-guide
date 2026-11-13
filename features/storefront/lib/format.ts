export const money = (cents: number, currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format((cents || 0) / 100)
export const when = (value: string | Date, zone = 'America/New_York') => new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
export const dayOf = (value: string | Date, zone = 'America/New_York') => new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(new Date(value))

export const hoursText = (minutes: number) => { const h = Math.floor(minutes / 60), m = minutes % 60; return h && m ? `${h} h ${m} min` : h ? `${h} ${h === 1 ? 'hour' : 'hours'}` : `${m} min` }
