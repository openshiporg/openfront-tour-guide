import Link from 'next/link'
import { getOperatorName } from '../lib/data'
import { StoreLogoMark } from './StoreLogoMark'
import '../storefront.css'

export async function Shell({ children }: { children: React.ReactNode }) {
  const name = await getOperatorName()
  return (
    <div className="shop min-h-screen bg-[#f6f6f4] text-[#0b2e1f]">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-3 sm:px-4">
        <header className="flex flex-wrap items-center justify-between gap-x-6 px-5 py-3">
          <Link href="/" className="flex min-h-11 items-center gap-2 text-base font-bold tracking-tight"><StoreLogoMark />{name}</Link>
          <nav className="flex gap-6 text-sm font-medium">
            <Link className="flex min-h-11 items-center hover:underline hover:underline-offset-4" href="/#tours">Tours</Link>
            <Link className="flex min-h-11 items-center hover:underline hover:underline-offset-4" href="/lookup">Find booking</Link>
          </nav>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="mx-5 mt-8 flex flex-wrap items-center justify-between gap-x-6 border-t border-[#0b2e1f]/15 py-4 text-sm text-[#0b2e1f]/75">
          <p>{name}</p>
          <p>Need to change or cancel? <Link className="inline-flex min-h-11 items-center underline underline-offset-4" href="/lookup">Find your booking</Link></p>
        </footer>
      </div>
    </div>
  )
}
