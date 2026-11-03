import type { Metadata } from 'next'
import { Shell } from '@/features/storefront/components/Shell'
import { getOperatorName } from '@/features/storefront/lib/data'

export async function generateMetadata(): Promise<Metadata> {
  const name = await getOperatorName()
  return { title: name, description: `Book tours and activities with ${name}` }
}

export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return <Shell>{children}</Shell>
}
