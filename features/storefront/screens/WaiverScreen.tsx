import { notFound } from 'next/navigation'
import { getWaiver } from '../lib/data'
import { WaiverForm } from '../components/WaiverForm'

export async function WaiverScreen({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const r = await getWaiver(token)
  if (!r.ok) notFound()
  return <div className="p-5 sm:p-8"><WaiverForm token={token} waiver={r.waiver} /></div>
}
