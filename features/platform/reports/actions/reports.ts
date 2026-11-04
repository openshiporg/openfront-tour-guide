'use server'

import { platformMutation, platformQuery } from '../../lib/gql'

export type Totals = { bookings: number; guests: number; grossCents: number; discountCents: number; refundedCents: number; netCents: number; commissionCents: number }
export type Group = Totals & { name: string }
export type SalesReport = { from: string; to: string; basis: string; timezone: string; totals: Totals; byTour: Group[]; byChannel: Group[]; bySource: Group[] }

export async function getSalesReport(from: string, to: string, basis: string) {
  const data = await platformQuery<{ salesReport: SalesReport }>(`query($f:String!,$t:String!,$b:String){ salesReport(from:$f,to:$t,basis:$b) }`, { f: from, t: to, b: basis })
  return data?.salesReport || null
}
export async function exportSalesCsvAction(from: string, to: string, basis: string) {
  const r = await platformMutation(`mutation($input:SalesReportInput!){ exportSalesCsv(input:$input) }`, { input: { from, to, basis } })
  if (!r.success) return { success: false as const, error: r.error || 'Could not build the export' }
  const d = (r.data as any)?.exportSalesCsv
  return { success: true as const, filename: String(d.filename), csv: String(d.csv), rows: Number(d.rows) }
}
