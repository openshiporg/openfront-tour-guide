import Link from 'next/link'
import { getOperatorName } from '../lib/data'
import { StoreLogoMark } from './StoreLogoMark'

export async function Shell({ children }: { children: React.ReactNode }) {
  const name = await getOperatorName()
  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 pb-16">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b py-4">
        <Link href="/" className="flex min-h-11 items-center gap-2 text-lg font-semibold"><StoreLogoMark />{name}</Link>
        <nav className="flex gap-2 text-sm"><Link className="flex h-11 items-center px-2" href="/">Tours</Link><Link className="flex h-11 items-center px-2" href="/lookup">Find booking</Link></nav>
      </header>
      <main className="py-6">{children}</main>
    </div>
  )
}
