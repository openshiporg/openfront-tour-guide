import { tourPhoto } from '../lib/format'

// The tour's photo. A tour without one shows its name on a plain panel, never a decorative fill.
export function TourPhoto({ tour, className = '', eager = false }: { tour: any; className?: string; eager?: boolean }) {
  const src = tourPhoto(tour)
  if (!src) return <div className={`grid place-items-center bg-[#e7e9e3] p-4 text-center text-sm text-[#0b2e1f]/60 ${className}`}>No photo yet</div>
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={tour.name} width={tour.photo?.width || undefined} height={tour.photo?.height || undefined} loading={eager ? 'eager' : 'lazy'} className={`bg-[#e7e9e3] object-cover ${className}`} />
}
