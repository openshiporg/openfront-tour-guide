'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { signWaiver } from '../lib/data'

export function WaiverForm({ token, waiver }: { token: string; waiver: any }) {
  const [name, setName] = React.useState('')
  const [guardian, setGuardian] = React.useState(false)
  const [minor, setMinor] = React.useState('')
  const [agree, setAgree] = React.useState(false)
  const [error, setError] = React.useState('')
  const [done, setDone] = React.useState(waiver.status === 'signed')
  const key = React.useRef(crypto.randomUUID())
  const submit = async () => { setError(''); const r = await signWaiver({ token, signerName: name, isGuardian: guardian, minorName: guardian ? minor : undefined }, key.current); if (r.ok) setDone(true); else setError(r.error) }
  if (done) return <p className="text-sm">Waiver signed for {waiver.participantName}.</p>
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">{waiver.name}</h1>
      <p className="text-sm text-muted-foreground">{waiver.tourName} · {waiver.participantName} · version {waiver.version}</p>
      <p className="whitespace-pre-wrap rounded-lg border p-3 text-sm">{waiver.text}</p>
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={guardian} onCheckedChange={(v) => setGuardian(v === true)} />Signing as parent or guardian</label>
      {guardian && <Input placeholder="Minor's full name" value={minor} onChange={(e) => setMinor(e.target.value)} />}
      <Input placeholder="Your full name" value={name} onChange={(e) => setName(e.target.value)} />
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={agree} onCheckedChange={(v) => setAgree(v === true)} />I have read and agree</label>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <Button className="h-11" disabled={!name || !agree || (guardian && !minor)} onClick={submit}>Sign</Button>
    </div>
  )
}
