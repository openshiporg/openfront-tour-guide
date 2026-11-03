import Link from 'next/link'
import { getOperatorName } from '../lib/data'

export async function Shell({ children }: { children: React.ReactNode }) {
  const name = await getOperatorName()
  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 pb-16">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b py-4">
        <Link href="/" className="text-lg font-semibold">{name}</Link>
        <nav className="flex gap-4 text-sm"><Link href="/">Tours</Link><Link href="/lookup">Find booking</Link></nav>
      </header>
      <main className="py-6">{children}</main>
    </div>
  )
}
