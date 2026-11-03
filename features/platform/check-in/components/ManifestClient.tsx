'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { StatusLabel } from '../../components/StatusLabel'
import { checkInAction, noShowAction } from '../actions/checkIn'

export function ManifestClient({ manifest }: { manifest: any }) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const run = async (fn: () => Promise<{ success: boolean; error?: string }>) => { setError(null); const r = await fn(); if (!r.success) setError(r.error || 'Failed'); else router.refresh() }
  return (
    <div className="space-y-3 p-4">
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {manifest.bookings.map((b: any) => (
        <section key={b.id} className="rounded-xl border p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0"><h3 className="truncate text-base font-semibold">{b.leadName}</h3><p className="font-mono text-sm text-muted-foreground">{b.bookingRef}</p></div>
            <StatusLabel status={b.status} />
          </div>
          {(b.pickupLocation || b.specialRequests) && <p className="mt-1 text-sm text-muted-foreground">{[b.pickupLocation, b.specialRequests].filter(Boolean).join(' · ')}</p>}
          <ul className="mt-2 divide-y">
            {b.participants.map((p: any) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{p.fullName}</p>
                  <p className="text-sm text-muted-foreground">{[p.dietary && `Diet: ${p.dietary}`, p.medicalFlag && (p.medicalNotes ? `Medical: ${p.medicalNotes}` : 'Medical note'), p.waiverStatus === 'required' && 'Waiver missing'].filter(Boolean).join(' · ') || 'No flags'}</p>
                </div>
                {p.checkInStatus === 'checked_in' ? <StatusLabel status="checked_in" /> : <Button size="sm" disabled={b.status !== 'confirmed' && b.status !== 'checked_in'} onClick={() => run(() => checkInAction(p.id))}>Check in</Button>}
              </li>
            ))}
          </ul>
          {b.status === 'confirmed' && <Button size="sm" variant="outline" className="mt-1" onClick={() => run(() => noShowAction(b.id))}>No show</Button>}
        </section>
      ))}
      {!manifest.bookings.length && <p className="text-sm text-muted-foreground">No bookings.</p>}
    </div>
  )
}
