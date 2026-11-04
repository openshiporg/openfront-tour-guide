'use server'

import { revalidatePath } from 'next/cache'
import { platformMutation, platformQuery } from '../../lib/gql'

export async function getWeatherCancellations() {
  const data = await platformQuery<{ weatherCancellations: { departures: any[] } }>(`query{ weatherCancellations }`)
  return data?.weatherCancellations?.departures || []
}
export async function weatherCancelAction(departureId: string, reason: string) {
  const result = await platformMutation(`mutation($input:WeatherCancelInput!,$idempotencyKey:String!){ weatherCancelDeparture(input:$input,idempotencyKey:$idempotencyKey) }`, { input: { departureId, reason } })
  revalidatePath('/dashboard/platform/today'); revalidatePath('/dashboard/platform/weather')
  return result
}
export async function weatherRebookAction(bookingId: string, departureId: string) {
  const result = await platformMutation(`mutation($input:WeatherRebookInput!,$idempotencyKey:String!){ rebookWeatherBooking(input:$input,idempotencyKey:$idempotencyKey) }`, { input: { bookingId, departureId } })
  revalidatePath('/dashboard/platform/weather')
  return result
}
