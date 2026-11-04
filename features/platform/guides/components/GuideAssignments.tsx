'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { guideAction } from '../actions/guides'
import { dayIn, timeIn } from '../../lib/format'

export function GuideAssignments({ guides, departures }: { guides: any[]; departures: any[] }) {
  const [guideId, setGuide] = useState(''), [departureId, setDeparture] = useState(''), [role, setRole] = useState('lead'), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const router = useRouter()
  async function run(operation: 'assignGuide' | 'respondToAssignment', input: any) {
    setBusy(true); setError('')
    try { const r = await guideAction(operation, input); if (!r.success) setError(r.error || 'Assignment failed'); else { setError('Saved'); router.refresh() } } catch { setError('Assignment failed') } finally { setBusy(false) }
  }
  return <section className="space-y-3 p-4">
    <h2 className="font-semibold">Guide assignments</h2>
    <div className="grid min-w-0 gap-2 md:grid-cols-3">
      <Select value={guideId} onValueChange={setGuide}><SelectTrigger><SelectValue placeholder="Guide" /></SelectTrigger><SelectContent>{guides.filter(g => g.status === 'active').map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent></Select>
      <Select value={departureId} onValueChange={setDeparture}><SelectTrigger className="min-w-0"><SelectValue placeholder="Departure" /></SelectTrigger><SelectContent>{departures.map(d => <SelectItem key={d.id} value={d.id}>{d.tour.name} · {dayIn(d.startAt)} {timeIn(d.startAt)}</SelectItem>)}</SelectContent></Select>
      <Select value={role} onValueChange={setRole}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['lead','assistant','driver'].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select>
    </div>
    <Button disabled={busy || !guideId || !departureId} onClick={() => run('assignGuide', { guideId, departureId, role })}>Offer assignment</Button>
    {error && <p role="status" className="text-sm">{error}</p>}
    {guides.flatMap(g => g.assignments.filter((a: any) => a.status === 'offered').map((a: any) => <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-xl border p-3 text-sm"><span className="min-w-0 flex-1">{g.name} · {a.departure.tour.name} · {dayIn(a.departure.startAt)} {timeIn(a.departure.startAt)}</span><Button size="sm" disabled={busy} onClick={() => run('respondToAssignment', { assignmentId: a.id, status: 'accepted' })}>Accept</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => run('respondToAssignment', { assignmentId: a.id, status: 'declined' })}>Decline</Button></div>))}
  </section>
}
