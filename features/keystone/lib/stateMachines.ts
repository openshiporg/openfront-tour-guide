/**
 * One transitions map per lifecycle. Writers assert the move here so an illegal one is refused with one clear message.
 * Keys are the model names; a status missing from a map is terminal. Machines that are guarded elsewhere (settlementTransition,
 * assignment responses) are listed so the whole set reads in one place and the test can check them against the models.
 */
export type Machine = Record<string, readonly string[]>;
export const MACHINES = {
 // scheduled has no writer (departures are created on_sale); in_progress has no writer either (closeDeparture accepts it for imports).
 departure: {
  scheduled: ['on_sale', 'confirmed', 'full', 'min_not_met', 'closed', 'cancelled', 'weather_cancelled'],
  on_sale: ['confirmed', 'full', 'min_not_met', 'closed', 'cancelled', 'weather_cancelled'],
  min_not_met: ['on_sale', 'confirmed', 'full', 'closed', 'cancelled', 'weather_cancelled'],
  confirmed: ['on_sale', 'full', 'min_not_met', 'closed', 'cancelled', 'weather_cancelled'],
  full: ['on_sale', 'confirmed', 'min_not_met', 'closed', 'cancelled', 'weather_cancelled'],
  closed: ['in_progress', 'completed', 'cancelled', 'weather_cancelled'],
  in_progress: ['completed'],
  completed: [], cancelled: [], weather_cancelled: [],
 },
 // cancelled -> pending_payment: a payment that lands after its hold lapsed revives the booking if the seats are still free.
 // partially_refunded is legacy: a partial refund now leaves the operational status alone (refundedCents records it).
 booking: {
  pending_payment: ['confirmed', 'cancelled'],
  confirmed: ['checked_in', 'no_show', 'cancelled', 'refunded', 'partially_refunded'],
  checked_in: ['completed', 'cancelled', 'refunded', 'partially_refunded'],
  // no_show -> confirmed: undoNoShow at the office when the guest did arrive.
  no_show: ['confirmed', 'cancelled', 'refunded'],
  completed: ['cancelled', 'refunded', 'partially_refunded'],
  partially_refunded: ['checked_in', 'no_show', 'completed', 'cancelled', 'refunded'],
  refunded: [],
  // cancelled -> refunded: seats were lost after a card payment and the whole payment was refunded.
  cancelled: ['pending_payment', 'refunded'],
 },
 inventoryHold: { active: ['converted', 'released', 'expired'], converted: [], released: [], expired: [] },
 partyChange: { pending_payment: ['applied', 'cancelled', 'failed'], cancelled: ['applied', 'failed'], applied: [], failed: [] },
 waitlistEntry: { waiting: ['offered', 'withdrawn', 'expired'], offered: ['converted', 'expired', 'withdrawn'], converted: [], expired: [], withdrawn: [] },
 promoRedemption: { reserved: ['committed', 'released'], committed: ['released'], released: [] },
 guideAssignment: { offered: ['accepted', 'declined', 'cancelled'], accepted: ['worked', 'cancelled'], worked: [], declined: [], cancelled: [] },
 guidePayout: { draft: ['approved'], approved: ['paid'], paid: [] },
 channelStatement: { open: ['invoiced'], invoiced: ['paid'], paid: [] },
 giftCard: { active: ['void'], void: [] },
 // reopened when a departure that had resolved its decision drops below the minimum again.
 operationalTask: { open: ['resolved'], resolved: ['open'] },
 participantCheckIn: { pending: ['checked_in', 'no_show'], checked_in: [], no_show: [] },
 waiver: { required: ['signed'], signed: [], not_required: [] },
 refund: { processing: ['succeeded', 'failed', 'unknown'], unknown: ['succeeded', 'failed', 'unknown'], succeeded: [], failed: [] },
 payment: { pending: ['processing', 'succeeded', 'failed', 'cancelled', 'unknown'], processing: ['authorized', 'succeeded', 'failed', 'cancelled', 'unknown'], authorized: ['succeeded', 'failed', 'cancelled'], unknown: ['succeeded', 'failed', 'cancelled'], succeeded: ['partially_refunded', 'refunded'], partially_refunded: ['partially_refunded', 'refunded'], refunded: [], failed: [], cancelled: [] },
 managerApproval: { pending: ['approved', 'rejected', 'expired'], approved: ['consumed', 'expired'], rejected: [], consumed: [], expired: [] },
 paymentWebhookEvent: { received: ['processed', 'ignored', 'failed'], failed: ['processed', 'ignored', 'failed'], processed: [], ignored: [] },
} as const satisfies Record<string, Machine>;
export type MachineName = keyof typeof MACHINES;
export const canTransition = (m: MachineName, from: string, to: string) => (MACHINES[m] as Machine)[from]?.includes(to) ?? false;
export function assertMove(m: MachineName, from: string, to: string) { if (!canTransition(m, from, to)) throw new Error(`A ${m.replace(/([A-Z])/g, ' $1').toLowerCase()} cannot move from ${from.replace(/_/g, ' ')} to ${to.replace(/_/g, ' ')}`); }
export const nextStates = (m: MachineName, from: string): readonly string[] => (MACHINES[m] as Machine)[from] ?? [];
export const terminalStates = (m: MachineName) => Object.entries(MACHINES[m] as Machine).filter(([, v]) => !v.length).map(([k]) => k);
