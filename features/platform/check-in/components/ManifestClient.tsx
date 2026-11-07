'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { StatusLabel } from '../../components/StatusLabel'
import { Input } from '@/components/ui/input'
import { captureWaiverAction, checkInAction, getParticipantWaiver, noShowAction, undoNoShowAction, syncOfflineAction } from '../actions/checkIn'

type Tap = { key: string; kind: 'check_in' | 'no_show'; participantId?: string; bookingId?: string; recordedAt: string; label: string }
type Problem = { key: string; label: string; reason: string }
const newKey = () => crypto.randomUUID().replaceAll('-', '')
// The queue lives in localStorage so taps survive a reload or a dead battery; it is only cleared once the server answers.
function useOfflineQueue(departureId: string) {
  const store = `tg-offline-checkin:${departureId}`
  const [queue, setQueue] = React.useState<Tap[]>([])
  const [problems, setProblems] = React.useState<Problem[]>([])
  const [online, setOnline] = React.useState(true)
  const [loaded, setLoaded] = React.useState(false)
  React.useEffect(() => {
    const read = (k: string) => { try { return JSON.parse(localStorage.getItem(k) || '[]') } catch { return [] } }
    setQueue(read(store)); setProblems(read(store + ':problems')); setLoaded(true)
    setOnline(navigator.onLine)
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [store])
  const save = React.useCallback((next: Tap[]) => { localStorage.setItem(store, JSON.stringify(next)); setQueue(next) }, [store])
  // Taps the server refused stay listed (also across reloads) until the guide clears them.
  const saveProblems = React.useCallback((next: Problem[]) => { localStorage.setItem(store + ':problems', JSON.stringify(next)); setProblems(next) }, [store])
  return { queue, save, problems, saveProblems, online, setOnline, loaded }
}

export function ManifestClient({ manifest }: { manifest: any }) {
  const router = useRouter()
  const departureId = manifest.departure.id
  const { queue, save, problems, saveProblems, online, setOnline, loaded } = useOfflineQueue(departureId)
  const [syncing, setSyncing] = React.useState(false)
  const batchKey = React.useRef<string | null>(null)
  const queuedIn = new Set(queue.filter((t) => t.kind === 'check_in').map((t) => t.participantId))
  const queuedOut = new Set(queue.filter((t) => t.kind === 'no_show').map((t) => t.bookingId))
  const enqueue = (tap: Omit<Tap, 'key' | 'recordedAt'>) => { save([...queue, { ...tap, key: newKey(), recordedAt: new Date().toISOString() }]); setNotice(null); setError(null) }
  const sync = React.useCallback(async () => {
    if (!queue.length || syncing) return
    const batch = queue.slice(0, 50)
    batchKey.current ||= newKey()
    setSyncing(true); setError(null)
    try {
      const r: any = await syncOfflineAction(departureId, batch.map(({ label, ...t }) => t), batchKey.current)
      if (!r.success) { setError(r.error || 'Sync failed. The taps are still saved on this device.'); return }
      batchKey.current = null
      const done = new Set(batch.map((t) => t.key))
      save(queue.filter((t) => !done.has(t.key)))
      const bad = r.data.results.filter((x: any) => x.outcome === 'conflict')
      saveProblems([...problems, ...bad.map((x: any) => ({ key: x.key, label: batch.find((t) => t.key === x.key)?.label || x.label, reason: x.reason }))])
      setNotice(`Synced ${batch.length} tap${batch.length === 1 ? '' : 's'}${bad.length ? `, ${bad.length} need${bad.length === 1 ? 's' : ''} a look` : ''}`)
      router.refresh()
    } catch { setOnline(false); setError('Still offline. The taps are saved on this device.') }
    finally { setSyncing(false) }
  }, [queue, problems, syncing, departureId, save, saveProblems, router, setOnline])
  // Sync when the signal comes back, and when the page opens with taps left over from before.
  React.useEffect(() => { if (loaded && online && queue.length) sync() }, [online, loaded]) // eslint-disable-line react-hooks/exhaustive-deps
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
  // Live first; with no signal (or a call that never reaches the server) the tap is queued instead of lost.
  const run = async (fn: () => Promise<{ success: boolean; error?: string }>, tap: Omit<Tap, 'key' | 'recordedAt'>) => {
    setError(null)
    if (!online || queue.length) return enqueue(tap)
    try { const r = await fn(); if (!r.success) setError(r.error || 'Failed'); else router.refresh() }
    catch { setOnline(false); enqueue(tap) }
  }
  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3" data-offline-bar>
        <span className={`font-mono text-xs uppercase tracking-wide ${online ? 'text-muted-foreground' : 'text-amber-700'}`}>{online ? (queue.length ? `${queue.length} tap${queue.length === 1 ? '' : 's'} waiting to sync` : 'Online · taps save live') : `Offline · ${queue.length} tap${queue.length === 1 ? '' : 's'} saved on this device`}</span>
        {queue.length > 0 && <Button size="sm" variant="outline" disabled={syncing || !online} onClick={sync}>{syncing ? 'Syncing…' : 'Sync now'}</Button>}
      </div>
      {problems.length > 0 && (
        <section className="space-y-1 rounded-xl border border-amber-300 p-3" aria-label="Taps that did not apply" data-offline-problems>
          <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">Not applied when synced</h3><Button size="sm" variant="ghost" onClick={() => saveProblems([])}>Clear</Button></div>
          {problems.map((p) => <p key={p.key} className="text-sm"><span className="font-medium">{p.label}</span><span className="text-muted-foreground"> · {p.reason}</span></p>)}
        </section>
      )}
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
                {p.checkInStatus === 'checked_in' ? <StatusLabel status="checked_in" /> : queuedIn.has(p.id) ? <StatusLabel status="saved_offline" /> : <Button size="sm" disabled={(b.status !== 'confirmed' && b.status !== 'checked_in') || queuedOut.has(b.id)} onClick={() => run(() => checkInAction(p.id), { kind: 'check_in', participantId: p.id, label: `${p.fullName} · ${b.bookingRef}` })}>Check in</Button>}
              </li>
            ))}
          </ul>
          {b.status === 'confirmed' && (queuedOut.has(b.id) ? <StatusLabel status="no_show_saved_offline" className="mt-1" /> : <Button size="sm" variant="outline" className="mt-1" disabled={b.participants.some((p: any) => queuedIn.has(p.id))} onClick={() => run(() => noShowAction(b.id), { kind: 'no_show', bookingId: b.id, label: `No show · ${b.bookingRef}` })}>No show</Button>)}
          {b.status === 'no_show' && <Button size="sm" variant="outline" className="mt-1" disabled={!online || queue.length > 0} onClick={async () => { setError(null); try { const r = await undoNoShowAction(b.id); if (!r.success) setError(r.error || 'Failed'); else router.refresh() } catch { setError('Could not undo the no show') } }}>Undo no show</Button>}
        </section>
      ))}
      {!manifest.bookings.length && <p className="text-sm text-muted-foreground">No bookings.</p>}
    </div>
  )
}
