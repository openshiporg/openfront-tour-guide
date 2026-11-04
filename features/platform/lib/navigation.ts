import { CalendarClock, CalendarDays, Ticket, Compass, Users, Truck, Handshake, ClipboardCheck, Bell, CloudRain, FileSignature, Tag, CreditCard, UserRound, Settings, LucideIcon } from 'lucide-react'

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
  { title: 'Check-in', href: '/platform/check-in', description: 'Mobile manifest and check-in.', icon: ClipboardCheck, group: 'standalone' },
  { title: 'Tours', href: '/platform/tours', description: 'Tours, ticket types, add-ons, schedules and policies.', icon: Compass, group: 'catalog' },
  { title: 'Waivers', href: '/platform/waivers', description: 'Waiver versions and signatures.', icon: FileSignature, group: 'catalog' },
  { title: 'Promo codes', href: '/platform/promo-codes', description: 'Discount codes and redemptions.', icon: Tag, group: 'catalog' },
  { title: 'Guides', href: '/platform/guides', description: 'Roster, certifications, assignments and payouts.', icon: Users, group: 'operations' },
  { title: 'Resources', href: '/platform/resources', description: 'Vans, boats and equipment pools.', icon: Truck, group: 'operations' },
  { title: 'Channels', href: '/platform/channels', description: 'Resellers, allocations and statements.', icon: Handshake, group: 'operations' },
  { title: 'Weather', href: '/platform/weather', description: 'Weather cancellations: rebook or refund each guest.', icon: CloudRain, group: 'operations' },
  { title: 'Notifications', href: '/platform/notifications', description: 'Queued and held-back guest messages.', icon: Bell, group: 'operations' },
  { title: 'Customers', href: '/platform/customers', description: 'Guests and their bookings.', icon: UserRound, group: 'operations' },
  { title: 'Payment providers', href: '/platform/payment-providers', description: 'Payment gateways and settings.', icon: CreditCard, group: 'settings' },
  { title: 'Settings', href: '/platform/settings', description: 'Operator, tax and refund approval threshold.', icon: Settings, group: 'settings' },
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
