import Link from 'next/link'
import { ArrowRight, CalendarDays, Clock, Search, ShieldCheck, Plane, Users } from 'lucide-react'
import { getOperatorName, getTours } from '../lib/data'
import { money, hoursText } from '../lib/format'

const card = 'rounded-3xl bg-[#f6f6f4] p-5 sm:p-6'
const eyebrow = 'text-[10px] font-bold uppercase tracking-[0.2em] text-[#0f4a2f]'

function photo(t: any): string | null {
  const i = Array.isArray(t.images) ? t.images[0] : null
  return typeof i === 'string' ? i : i?.url || i?.src || null
}

export async function HomeScreen() {
  const [tours, name] = await Promise.all([getTours(), getOperatorName()])
  return (
    <div className="space-y-3">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-[#cfe6f3] via-[#e8f2f2] to-[#f6f6f4] px-6 py-10 sm:px-10 sm:py-14">
        <svg aria-hidden viewBox="0 0 800 300" preserveAspectRatio="xMaxYMax slice" className="absolute inset-0 h-full w-full">
          <path d="M300 300 L480 90 L540 140 L620 40 L800 230 L800 300Z" fill="#7fa7c4" opacity=".55" />
          <path d="M420 300 L600 150 L700 210 L800 120 L800 300Z" fill="#2f6b4a" opacity=".85" />
          <path d="M560 300 L700 220 L800 250 L800 300Z" fill="#0f4a2f" />
        </svg>
        <div className="relative max-w-sm">
          <p className={eyebrow}>Guided tours</p>
          <h1 className="mt-3 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">Discover Extraordinary Places</h1>
          <p className="mt-4 text-sm">Curated tours, expert guides, and unforgettable travel experiences with {name}.</p>
          <Link href="#tours" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0f4a2f] px-5 py-2.5 text-sm font-semibold text-white">Explore Tours <ArrowRight className="size-4" /></Link>
        </div>
      </section>

      <section className={`${card} grid gap-4 sm:grid-cols-3 sm:divide-x sm:divide-black/10`}>
        {[[Users, 'Expert Guides', 'Local knowledge, richer trips'], [ShieldCheck, 'Trusted & Safe', 'Your journey, our priority'], [CalendarDays, 'Book Online', 'Reserve your spot in minutes']].map(([Icon, t, s]: any) => (
          <div key={t} className="flex items-center gap-3 sm:px-4"><Icon className="size-6 shrink-0 text-[#0f4a2f]" /><div><p className="text-sm font-bold">{t}</p><p className="text-xs text-[#0b2e1f]/60">{s}</p></div></div>
        ))}
      </section>

      <section id="tours" className={card}>
        <p className={eyebrow}>Popular tours</p>
        <h2 className="mt-1 text-2xl font-extrabold tracking-tight">Our Most Loved Trips</h2>
        <ul className="mt-5 grid gap-5 sm:grid-cols-3">
          {tours.map((t, n) => {
            const from = Math.min(...t.ticketTypes.map((x: any) => x.priceCents))
            const src = photo(t)
            return (
              <li key={t.id}>
                <Link href={`/tours/${t.slug}`} className="block min-h-11">
                  <div className="aspect-[4/3] overflow-hidden rounded-2xl bg-gradient-to-br from-[#2f6b4a] to-[#8fb8a0]" style={{ filter: `hue-rotate(${n * 25}deg)` }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {src && <img src={src} alt={t.name} className="size-full object-cover" />}
                  </div>
                  <h3 className="mt-3 font-bold">{t.name}</h3>
                  <p className="mt-1 flex items-center gap-3 text-xs text-[#0b2e1f]/60"><span className="flex items-center gap-1"><Clock className="size-3.5" />{hoursText(t.durationMinutes)}</span><span>from {money(from)}</span></p>
                </Link>
              </li>
            )
          })}
          {!tours.length && <li className="text-sm text-[#0b2e1f]/60">No tours on sale.</li>}
        </ul>
      </section>

      <section className={card}>
        <p className={eyebrow}>How it works</p>
        <h2 className="mt-1 text-2xl font-extrabold tracking-tight">Travel With Ease</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {[[Search, '1. Choose a Tour', 'Browse our curated trips'], [CalendarDays, '2. Book Online', 'Reserve your spot in minutes'], [Plane, '3. Explore', 'Pack your bags and go!']].map(([Icon, t, s]: any) => (
            <div key={t} className="flex items-center gap-3"><span className="grid size-12 place-items-center rounded-xl bg-[#dcebe1]"><Icon className="size-5 text-[#0f4a2f]" /></span><div><p className="text-sm font-bold">{t}</p><p className="text-xs text-[#0b2e1f]/60">{s}</p></div></div>
          ))}
        </div>
      </section>
    </div>
  )
}
