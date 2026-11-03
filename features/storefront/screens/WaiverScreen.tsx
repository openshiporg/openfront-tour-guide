import { getWaiver } from '../lib/data'
import { WaiverForm } from '../components/WaiverForm'

export async function WaiverScreen({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const r = await getWaiver(token)
  if (!r.ok) return <p className="text-sm text-rose-600">Waiver link not valid.</p>
  return <WaiverForm token={token} waiver={r.waiver} />
}
