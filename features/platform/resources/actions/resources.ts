'use server'

import { revalidatePath } from 'next/cache'
import { platformMutation, platformQuery } from '../../lib/gql'

// Flat reads joined in code (nesting under many departures makes Keystone issue a query per row).
export async function getResourcePlanner() {
  const now = new Date().toISOString()
  const data = await platformQuery<{ departures: any[]; tours: any[]; resources: any[]; resourceAssignments: any[] }>(
    `query($now:DateTime!){
      departures(where:{startAt:{gt:$now},status:{notIn:[cancelled,weather_cancelled,completed]}},take:100,orderBy:[{startAt:asc}]){ id startAt endAt capacity status tour{ id } }
      tours(take:100){ id name requiresResourceKind maxParticipants }
      resources(take:100,orderBy:[{name:asc}]){ id name kind seats quantity status }
      resourceAssignments(where:{departure:{startAt:{gt:$now}}},take:300){ id quantity departure{ id } resource{ id } }
    }`, { now })
  if (!data) return { resources: [], departures: [] }
  const tours = new Map(data.tours.map((t) => [t.id, t]))
  const resources = new Map(data.resources.map((r) => [r.id, r]))
  const assigned = new Map(data.resourceAssignments.map((a) => [a.departure?.id, a]))
  const departures = data.departures.map((d) => {
    const tour = tours.get(d.tour?.id), a = assigned.get(d.id)
    return { id: d.id, startAt: d.startAt, endAt: d.endAt, capacity: d.capacity, status: d.status, tourName: tour?.name || 'Tour', kind: tour?.requiresResourceKind || 'none', assignment: a ? { id: a.id, quantity: a.quantity, resource: resources.get(a.resource?.id) || null } : null }
  }).filter((d) => d.kind !== 'none')
  return { resources: data.resources, departures }
}
export async function assignResourceAction(departureId: string, resourceId: string, quantity: number) {
  const result = await platformMutation(`mutation($input:AssignResourceInput!,$idempotencyKey:String!){ assignResource(input:$input,idempotencyKey:$idempotencyKey) }`, { input: { departureId, resourceId, quantity } })
  revalidatePath('/dashboard/platform/resources')
  return result
}
export async function unassignResourceAction(departureId: string) {
  const result = await platformMutation(`mutation($input:UnassignResourceInput!,$idempotencyKey:String!){ unassignResource(input:$input,idempotencyKey:$idempotencyKey) }`, { input: { departureId } })
  revalidatePath('/dashboard/platform/resources')
  return result
}
