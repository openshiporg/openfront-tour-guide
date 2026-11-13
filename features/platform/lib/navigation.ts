import { Gift, ListOrdered, CalendarClock, CalendarDays, Ticket, Compass, Users, Truck, Handshake, ClipboardCheck, BarChart3, CalendarCheck, CloudRain, FileSignature, Tag, TrendingUp, UserRound, Settings, LucideIcon, Store } from 'lucide-react'

export interface PlatformNavItem {
  title: string
  href: string
  description: string
  icon: LucideIcon
  group?: string
}
export interface PlatformNavGroup { id: string; title: string; icon: LucideIcon; items: PlatformNavItem[] }

export const platformNavItems: PlatformNavItem[] = [
  { title: 'Today', href: '/platform/today', description: 'Departures today with seats, staffing and waiver gaps.', icon: CalendarClock, group: 'standalone' },
  { title: 'Calendar', href: '/platform/calendar', description: 'Week grid of departures by tour.', icon: CalendarDays, group: 'standalone' },
  { title: 'Bookings', href: '/platform/bookings', description: 'Bookings by status, phone and walk-up sales, refunds.', icon: Ticket, group: 'standalone' },
  { title: 'Waitlist', href: '/platform/waitlist', description: 'Guests waiting for full departures; held offers.', icon: ListOrdered, group: 'standalone' },
  { title: 'My departures', href: '/platform/my-departures', description: 'Your accepted departures, manifests and pickup sheets.', icon: CalendarCheck, group: 'operations' },
  { title: 'Check-in', href: '/platform/check-in', description: 'Mobile manifest and check-in.', icon: ClipboardCheck, group: 'standalone' },
  { title: 'Tours', href: '/platform/tours', description: 'Tours, ticket types, add-ons, schedules and policies.', icon: Compass, group: 'catalog' },
  { title: 'Seasonal pricing', href: '/platform/pricing', description: 'Price changes by season, weekday and ticket type.', icon: TrendingUp, group: 'catalog' },
  { title: 'Waivers', href: '/platform/waivers', description: 'Waiver versions and signatures.', icon: FileSignature, group: 'catalog' },
  { title: 'Gift cards', href: '/platform/gift-cards', description: 'Sell gift cards and vouchers; balances and history.', icon: Gift, group: 'catalog' },
  { title: 'Promo codes', href: '/platform/promo-codes', description: 'Discount codes and redemptions.', icon: Tag, group: 'catalog' },
  { title: 'Guides', href: '/platform/guides', description: 'Roster, certifications, assignments and payouts.', icon: Users, group: 'operations' },
  { title: 'Resources', href: '/platform/resources', description: 'Vans, boats and equipment pools.', icon: Truck, group: 'operations' },
  { title: 'Channels', href: '/platform/channels', description: 'Resellers, allocations and statements.', icon: Handshake, group: 'operations' },
  { title: 'Weather', href: '/platform/weather', description: 'Weather cancellations: rebook or refund each guest.', icon: CloudRain, group: 'operations' },
  { title: 'Sales report', href: '/platform/reports', description: 'Sales by tour, channel and source, with CSV export.', icon: BarChart3, group: 'operations' },
  { title: 'Customers', href: '/platform/customers', description: 'Guests and their bookings.', icon: UserRound, group: 'operations' },
  { title: 'Settings', href: '/platform/settings', description: 'Operator, tax and refund approval threshold.', icon: Settings, group: 'settings' },
  { title: 'Store', href: '/platform/store', description: 'Configure store settings, logo, and branding.', icon: Store, group: 'settings' },
]
export const platformStandaloneItems = platformNavItems.filter((i) => i.group === 'standalone')
export const platformNavGroups: PlatformNavGroup[] = [
  { id: 'catalog', title: 'Catalog', icon: Compass, items: platformNavItems.filter((i) => i.group === 'catalog') },
  { id: 'operations', title: 'Operations', icon: Users, items: platformNavItems.filter((i) => i.group === 'operations') },
  { id: 'settings', title: 'Settings', icon: Settings, items: platformNavItems.filter((i) => i.group === 'settings') },
]
export function getPlatformNavItemsWithBasePath(basePath: string) {
  return platformNavItems.map((item) => ({ ...item, href: `${basePath}${item.href}` }))
}
