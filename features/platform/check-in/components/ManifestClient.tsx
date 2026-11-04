'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { StatusLabel } from '../../components/StatusLabel'
import { Input } from '@/components/ui/input'
import { captureWaiverAction, checkInAction, getParticipantWaiver, noShowAction } from '../actions/checkIn'

export function ManifestClient({ manifest }: { manifest: any }) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const [signing, setSigning] = React.useState<{ id: string; text: string; name: string; version: number; age: number | null } | null>(null)
  const [signer, setSigner] = React.useState('')
  const [guardian, setGuardian] = React.useState(false)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const openWaiver = async (p: any) => {
    setError(null); setNotice(null); setBusy(true)
    try { const w = await getParticipantWaiver(p.id); if (!w) setError('Waiver unavailable: publish the waiver version first'); else { setSigning({ id: p.id, text: w.text, name: w.name, version: w.version, age: w.age }); setSigner(''); setGuardian(w.age !== null && w.age < 18) } }
    catch { setError('Could not load the waiver') } finally { setBusy(false) }
  }
  const sign = async (who: string) => {
    if (!signing) return
    setError(null); setBusy(true)
    try { const r = await captureWaiverAction(signing.id, signer.trim(), guardian); if (r.success) { setNotice(`Waiver signed for ${who}`); setSigning(null); router.refresh() } else setError(r.error || 'Could not save the signature') }
    catch { setError('Could not save the signature') } finally { setBusy(false) }
  }
  const run = async (fn: () => Promise<{ success: boolean; error?: string }>) => { setError(null); const r = await fn(); if (!r.success) setError(r.error || 'Failed'); else router.refresh() }
  return (
    <div className="space-y-3 p-4">
      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
      {notice && <p role="status" className="font-mono text-xs uppercase tracking-wide text-emerald-700">{notice}</p>}
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
                {p.waiverStatus === 'required' && b.status !== 'cancelled' && <Button size="sm" variant="outline" disabled={busy} onClick={() => openWaiver(p)}>Sign waiver</Button>}
                {signing && signing.id === p.id && (
                  <div className="w-full min-w-0 space-y-2 rounded-lg border p-3" role="group" aria-label={`Waiver for ${p.fullName}`}>
                    <p className="text-sm font-semibold">{signing.name} · version {signing.version}</p>
                    <p className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-sm text-muted-foreground">{signing.text}</p>
                    <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 size-4" checked={guardian} onChange={(e) => setGuardian(e.target.checked)} /><span>Signed by a parent or guardian for {p.fullName}</span></label>
                    <Input aria-label="Type full name to sign" placeholder={guardian ? 'Guardian full name' : 'Type full name to sign'} value={signer} onChange={(e) => setSigner(e.target.value)} />
                    <div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy || !signer.trim()} onClick={() => sign(p.fullName)}>Sign waiver</Button><Button size="sm" variant="ghost" onClick={() => setSigning(null)}>Cancel</Button></div>
                  </div>
                )}
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
