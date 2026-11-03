'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { StatusLabel } from '../../components/StatusLabel'
import { timeIn } from '../../lib/format'
import { cancelDepartureAction } from '../actions/today'

export function TodayClient({ departures }: { departures: any[] }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const cancel = async (id: string, reason: string) => {
    setBusy(id); setError(null)
    const result = await cancelDepartureAction(id, reason)
    setBusy(null)
    if (!result.success) setError(result.error || 'Could not cancel')
    else router.refresh()
  }
  if (!departures.length) return <p className="p-4 text-sm text-muted-foreground">No departures today.</p>
  return (
    <div className="space-y-3 p-4">
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {departures.map((d) => {
        const alerts = [!d.staffed && ['confirmed', 'full', 'on_sale', 'min_not_met'].includes(d.status) && d.booked > 0 ? 'Not staffed' : null, d.waiverGaps ? `${d.waiverGaps} waiver${d.waiverGaps === 1 ? '' : 's'} missing` : null, d.status === 'min_not_met' ? 'Minimum not met' : null].filter(Boolean)
        return (
          <section key={d.id} className="rounded-xl border p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold">{d.tourName}</h3>
                <p className="text-sm text-muted-foreground">{timeIn(d.startAt)} – {timeIn(d.endAt)}</p>
              </div>
              <StatusLabel status={d.status} />
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
              <div><dt className="text-xs text-muted-foreground">Seats</dt><dd className="font-mono">{d.booked}/{d.capacity}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Guides</dt><dd className="font-mono">{d.guidesAssigned}/{d.guidesNeeded}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Held</dt><dd className="font-mono">{d.held}</dd></div>
            </dl>
            {alerts.length > 0 && <p className="mt-2 text-sm text-amber-700">{alerts.join(' · ')}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline"><Link href={`/dashboard/platform/check-in?departure=${d.id}`}>Manifest</Link></Button>
              {!['cancelled', 'weather_cancelled', 'completed'].includes(d.status) && (
                <Popover>
                  <PopoverTrigger asChild><Button size="sm" variant="outline" disabled={busy === d.id}>Cancel departure</Button></PopoverTrigger>
                  <PopoverContent className="w-64 space-y-2">
                    <p className="text-sm">Refunds every booking under its policy; weather refunds in full.</p>
                    <Button size="sm" className="w-full" onClick={() => cancel(d.id, 'weather')}>Weather cancel</Button>
                    <Button size="sm" variant="outline" className="w-full" onClick={() => cancel(d.id, 'operator')}>Operator cancel</Button>
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}
