import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { getGiftCards } from '../actions/giftCards'
import { GiftCardsClient } from '../components/GiftCardsClient'

export async function GiftCardsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams
  const board = await getGiftCards(q || '')
  return (
    <PageContainer title="Gift cards" breadcrumbs={[{ type: 'link', label: 'Dashboard', href: '/dashboard' }, { type: 'page', label: 'Gift cards' }]}>
      <div className="space-y-3 p-4">
        <p className="text-sm text-muted-foreground">Sell a gift card for cash or give a voucher. Guests enter the code at checkout; it pays up to its balance and the rest goes on their card. Refunds put the value back on the gift card, never out as cash.</p>
        <GiftCardsClient board={board} search={q || ''} />
      </div>
    </PageContainer>
  )
}
export default GiftCardsPage
