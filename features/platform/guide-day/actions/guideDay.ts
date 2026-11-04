'use server'

import { platformQuery } from '../../lib/gql'

export type MyDeparture = { id: string; startAt: string; endAt: string; status: string; tourName: string; meetingPoint: string | null; role: string; assignmentStatus: string; guests: number; bookings: number; waiverGaps: number }
export type PickupStop = { name: string; guests: number; bookings: { bookingRef: string; leadName: string; phone: string; partySize: number; names: string[]; notes: string }[] }
export type PickupSheet = { departure: { id: string; startAt: string; tourName: string; meetingPoint: { name: string; address: string; instructions: string } | null; guides: string[] }; totalGuests: number; stops: PickupStop[] }

export type DayPickupSheet = { day: string; timezone: string; totalGuests: number; departures: (PickupSheet['departure'] & { totalGuests: number; stops: PickupStop[] })[] }
export async function getDayPickupSheet(day: string) {
  const data = await platformQuery<{ dayPickupSheet: DayPickupSheet }>(`query($d:String!){ dayPickupSheet(day:$d) }`, { d: day })
  return data?.dayPickupSheet || null
}
export async function getMyDepartures(days = 14) {
  const data = await platformQuery<{ myDepartures: { guide: { id: string; name: string } | null; departures: MyDeparture[] } }>(`query($d:Int){ myDepartures(days:$d) }`, { d: days })
  return data?.myDepartures || null
}
export async function getPickupSheet(departureId: string) {
  const data = await platformQuery<{ pickupSheet: PickupSheet }>(`query($id:ID!){ pickupSheet(departureId:$id) }`, { id: departureId })
  return data?.pickupSheet || null
}
