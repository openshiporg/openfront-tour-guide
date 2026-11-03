import { NextRequest, NextResponse } from 'next/server'
import { keystoneContext } from '@/features/keystone/context'
import { handleWebhook } from '@/features/keystone/utils/paymentProviderAdapter'
import { finalizeBookingPayment } from '@/features/keystone/mutations/tour-checkout'

// Provider webhooks confirm bookings even when the guest closes the tab after paying.
export async function POST(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: code } = await params
  if (!/^[a-z0-9_-]+$/i.test(code)) return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
  const rawBody = await request.text()
  const context = keystoneContext.sudo()
  const prisma = context.prisma as any
  const provider = await prisma.paymentProvider.findFirst({ where: { code, isInstalled: true } })
  if (!provider || !provider.handleWebhookFunction || provider.handleWebhookFunction === 'manual') return NextResponse.json({ error: 'Unsupported provider' }, { status: 400 })
  let parsed: any
  try { parsed = await handleWebhook({ provider, event: JSON.parse(rawBody), headers: Object.fromEntries(request.headers), rawBody }) }
  catch { return NextResponse.json({ error: 'Verification failed' }, { status: 400 }) }
  if (!parsed?.isValid) return NextResponse.json({ error: 'Verification failed' }, { status: 400 })
  const eventKey = `${code}:${parsed.event?.id}`
  const seen = await prisma.paymentWebhookEvent.findUnique({ where: { eventKey } })
  if (seen?.status === 'processed') return NextResponse.json({ received: true })
  if (!seen) await prisma.paymentWebhookEvent.create({ data: { eventKey, providerCode: code, providerEventId: String(parsed.event?.id || ''), eventType: String(parsed.type), payload: parsed.event, status: 'received' } })
  try {
    if (parsed.type === 'payment_intent.succeeded') {
      const intentId = parsed.resource?.id
      const session = intentId && await prisma.paymentSession.findFirst({ where: { paymentProviderId: provider.id, data: { path: ['paymentIntentId'], equals: intentId } }, include: { paymentCollection: { include: { booking: true } } } })
      const booking = session?.paymentCollection?.booking
      if (!booking) throw new Error('Payment correlation pending')
      await finalizeBookingPayment(prisma, booking.id, null, `webhook:${eventKey}`)
    }
    await prisma.paymentWebhookEvent.update({ where: { eventKey }, data: { status: parsed.type === 'payment_intent.succeeded' ? 'processed' : 'ignored', processedAt: new Date(), attempts: { increment: 1 } } })
    return NextResponse.json({ received: true })
  } catch (error: any) {
    await prisma.paymentWebhookEvent.updateMany({ where: { eventKey, status: { not: 'processed' } }, data: { status: 'failed', error: String(error?.message || 'failed').slice(0, 300), attempts: { increment: 1 } } })
    return NextResponse.json({ error: 'Retry' }, { status: 500 })
  }
}
