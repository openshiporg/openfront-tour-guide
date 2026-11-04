'use server'

import { platformQuery } from '../../lib/gql'

export type GuestNotification = { id: string; createdAt: string; kind: string; status: 'queued' | 'suppressed'; reason: string; to: string; subject: string; bookingRef: string; departureId: string | null; tourName: string; departureStartAt: string | null }

export async function getGuestNotifications(f: { status?: string; departureId?: string; from?: string; to?: string }) {
  const data = await platformQuery<{ guestNotifications: GuestNotification[] }>(
    `query($s:String,$d:ID,$f:String,$t:String){ guestNotifications(status:$s,departureId:$d,from:$f,to:$t,take:100) }`,
    { s: f.status || 'all', d: f.departureId || null, f: f.from || null, t: f.to || null })
  return data?.guestNotifications || []
}
// Departures in the filter dropdown: the next and previous two weeks, flat read.
export async function getNotificationDepartures() {
  const from = new Date(Date.now() - 14 * 86400000).toISOString(), to = new Date(Date.now() + 30 * 86400000).toISOString()
  const data = await platformQuery<{ departures: any[]; tours: any[] }>(`query($f:DateTime!,$t:DateTime!){ departures(where:{startAt:{gte:$f,lt:$t}},take:150,orderBy:[{startAt:asc}]){ id startAt tour{ id } } tours(take:100){ id name } }`, { f: from, t: to })
  const tours = new Map((data?.tours || []).map((t) => [t.id, t.name]))
  return (data?.departures || []).map((d) => ({ id: d.id, startAt: d.startAt, tourName: tours.get(d.tour?.id) || 'Tour' }))
}
