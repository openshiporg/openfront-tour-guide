import { notFound } from 'next/navigation'
import { getWaiver } from '../lib/data'
import { WaiverForm } from '../components/WaiverForm'

export async function WaiverScreen({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const r = await getWaiver(token)
  if (!r.ok) notFound()
  return <div className="mx-auto max-w-2xl px-5 pb-8 pt-2 sm:pt-6"><WaiverForm token={token} waiver={r.waiver} /></div>
}
