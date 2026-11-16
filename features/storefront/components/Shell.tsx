import Link from 'next/link'
import { getOperatorName } from '../lib/data'
import { StoreLogoMark } from './StoreLogoMark'

const card = 'rounded-3xl bg-[#f6f6f4] shadow-[0_1px_0_rgba(0,0,0,0.03)]'

export async function Shell({ children }: { children: React.ReactNode }) {
  const name = await getOperatorName()
  return (
    <div className="min-h-screen bg-white text-[#0b2e1f] [--primary:#0f4a2f] [--primary-foreground:#fff] [--ring:#0f4a2f] [--radius:0.85rem] [&_button]:rounded-xl">
      <div className="mx-auto max-w-5xl space-y-3 px-3 py-3 sm:px-4">
        <header className={`${card} flex flex-wrap items-center justify-between gap-3 px-5 py-3`}>
          <Link href="/" className="flex min-h-11 items-center gap-2 text-base font-bold tracking-tight"><StoreLogoMark />{name}</Link>
          <nav className="order-3 flex w-full justify-center gap-6 text-sm font-medium sm:order-none sm:w-auto">
            <Link className="flex min-h-11 items-center" href="/">Tours</Link><Link className="flex min-h-11 items-center" href="/lookup">Find booking</Link>
          </nav>
          <Link href="/#tours" className="flex min-h-11 items-center rounded-xl bg-[#0f4a2f] px-4 text-sm font-semibold text-white">Book a Tour</Link>
        </header>
        <main>{children}</main>
        <footer className={`${card} flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm`}>
          <Link href="/" className="flex items-center gap-2 font-bold"><StoreLogoMark />{name}</Link>
          <nav className="flex gap-6 font-medium"><Link className="flex min-h-11 items-center" href="/">Tours</Link><Link className="flex min-h-11 items-center" href="/lookup">Find booking</Link></nav>
        </footer>
      </div>
    </div>
  )
}
