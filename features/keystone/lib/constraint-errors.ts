import { GraphQLError } from 'graphql'

type Rule = { code: string; message: string; fields?: string[] }
const AMOUNT = 'TOUR_INVALID_AMOUNT'
const CURRENCY = { code: 'TOUR_INVALID_CURRENCY', message: 'Currency must be a three-letter code, such as USD.' }
const TIME = 'TOUR_INVALID_TIME_RANGE'

/** Database rules (migrations/20261108130000_concerts_invariants) and what a person should read when one refuses a write. */
export const CONSTRAINT_MESSAGES: Record<string, Rule> = {
  Booking_amounts_valid: { code: AMOUNT, message: 'Booking amounts and seats can’t be negative.' },
  Booking_refunded_within_total: { code: 'TOUR_REFUND_EXCEEDS_TOTAL', message: 'A booking can’t be refunded more than its total.' },
  BookingLine_amounts_valid: { code: AMOUNT, message: 'Booking line amounts and seats can’t be negative.' },
  AddOn_price_valid: { code: AMOUNT, message: 'An add-on price can’t be negative.' },
  TicketType_valid: { code: AMOUNT, message: 'A ticket needs a price of zero or more, and its minimum age can’t be above its maximum age.' },
  Channel_rate_valid: { code: 'TOUR_INVALID_RATE', message: 'A channel commission must be between 0% and 100%.' },
  ChannelStatement_amounts_valid: { code: AMOUNT, message: 'A statement’s commission can’t be negative or more than its gross sales.' },
  ChannelStatement_period_order: { code: TIME, message: 'A statement period must end on or after it starts.' },
  Departure_valid: { code: 'TOUR_INVALID_DEPARTURE', message: 'A departure needs a capacity of zero or more, must end after it starts, and can’t have a negative booking cutoff.' },
  Tour_valid: { code: AMOUNT, message: 'Durations, participant limits and minimum age can’t be negative.' },
  Tour_participants_order: { code: AMOUNT, message: 'The minimum group size can’t be larger than the maximum.' },
  GiftCard_valid: { code: 'TOUR_INVALID_GIFT_CARD', message: 'A gift card balance can’t be negative or more than its original value.' },
  GiftCardEntry_valid: { code: 'TOUR_INVALID_GIFT_CARD', message: 'A gift card entry can’t be zero, and the balance after it can’t be negative.' },
  Guide_rate_valid: { code: AMOUNT, message: 'A guide’s pay rate can’t be negative.' },
  GuideAssignment_pay_valid: { code: AMOUNT, message: 'Guide pay can’t be negative.' },
  GuideAvailability_order: { code: TIME, message: 'An availability window must end after it starts.' },
  GuidePayout_valid: { code: AMOUNT, message: 'A payout can’t be negative and its period must end on or after it starts.' },
  InventoryHold_quantity_positive: { code: AMOUNT, message: 'A hold needs at least one seat.' },
  ManagerApproval_amount_valid: { code: AMOUNT, message: 'An approval amount can’t be negative.' },
  ManagerApproval_time_order: { code: TIME, message: 'An approval can’t expire before it is requested.' },
  PartyChange_amounts_valid: { code: AMOUNT, message: 'Party change amounts can’t be negative.' },
  Payment_amounts_valid: { code: AMOUNT, message: 'A payment must be positive, and refunds can’t exceed it.' },
  Refund_amount_positive: { code: AMOUNT, message: 'A refund must be a positive amount.' },
  Refund_within_payment: { code: 'TOUR_REFUND_EXCEEDS_PAYMENT', message: 'Refunds can’t exceed what was paid, and must be in the payment’s currency.' },
  PaymentCollection_amounts_valid: { code: AMOUNT, message: 'Payment collection amounts can’t be negative.' },
  PaymentSession_amount_valid: { code: AMOUNT, message: 'A payment amount can’t be negative.' },
  PricingRule_price_valid: { code: AMOUNT, message: 'A price override can’t be negative.' },
  PromoCode_valid: { code: 'TOUR_INVALID_PROMO', message: 'A promo needs a value of zero or more, at least one use per order, and an end date on or after its start.' },
  PromoCode_used_within_max: { code: 'TOUR_PROMO_EXHAUSTED', message: 'That promo code has no uses left.' },
  PromoRedemption_amount_valid: { code: AMOUNT, message: 'A promo discount can’t be negative.' },
  Resource_valid: { code: AMOUNT, message: 'A resource needs zero or more seats and at least one unit.' },
  ResourceAssignment_quantity_valid: { code: AMOUNT, message: 'An assignment needs at least one unit.' },
  Schedule_capacity_valid: { code: AMOUNT, message: 'A capacity override can’t be negative.' },
  StoreSettings_valid: { code: 'TOUR_INVALID_RATE', message: 'The refund threshold and waitlist hours can’t be negative, and tax must be between 0% and 100%.' },
  WaitlistEntry_seats_valid: { code: AMOUNT, message: 'A waitlist entry needs at least one seat.' },
  Departure_within_capacity: { code: 'TOUR_DEPARTURE_FULL', message: 'That departure no longer has enough seats. Reload and try again.' },
  AddOn_currency_code: CURRENCY,
  Booking_currency_code: CURRENCY,
  BookingLine_currency_code: CURRENCY,
  ChannelStatement_currency_code: CURRENCY,
  GiftCard_currency_code: CURRENCY,
  Guide_currency_code: CURRENCY,
  GuideAssignment_currency_code: CURRENCY,
  GuidePayout_currency_code: CURRENCY,
  PartyChange_currency_code: CURRENCY,
  Payment_currency_code: CURRENCY,
  PricingRule_currency_code: CURRENCY,
  PromoRedemption_currency_code: CURRENCY,
  Refund_currency_code: CURRENCY,
  StoreSettings_currency_code: CURRENCY,
  TicketType_currency_code: CURRENCY,
  PromoRedemption_promo_booking_key: { code: 'TOUR_DUPLICATE_PROMO', message: 'That promo is already applied to this booking.', fields: ['booking', 'promoCode'] },
  GuideAssignment_departure_guide_key: { code: 'TOUR_DUPLICATE_ASSIGNMENT', message: 'That guide is already assigned to this departure.', fields: ['departure', 'guide'] },
}

type ErrorLink = {
  message?: unknown; meta?: { target?: unknown }; code?: unknown; originalError?: unknown; cause?: unknown
  // Keystone returns uncoded Prisma failures (CHECK and trigger violations) as "Prisma error" with the text here.
  extensions?: { debug?: { message?: unknown }; prisma?: { meta?: unknown } }
} | null | undefined

function chain(error: unknown) {
  const out: ErrorLink[] = []
  let current = error as ErrorLink
  for (let depth = 0; current && depth < 6; depth++) { out.push(current); current = (current.originalError ?? current.cause) as ErrorLink }
  return out
}

/** The readable, coded refusal for a known constraint violation anywhere in the error's cause chain, or null. */
export function constraintRefusal(error: unknown): { code: string; message: string } | null {
  for (const link of chain(error)) {
    const text = [
      link?.message, typeof link?.meta === 'object' ? JSON.stringify(link.meta) : '',
      link?.extensions?.debug?.message ?? '', link?.extensions?.prisma?.meta ? JSON.stringify(link.extensions.prisma.meta) : '',
    ].join(' ')
    for (const [name, rule] of Object.entries(CONSTRAINT_MESSAGES)) if (text.includes(name)) return rule
    // Prisma sometimes reports a unique violation by its fields instead of the index name.
    const listed = /Unique constraint failed on the fields: \((.*?)\)(?:\s|$)/.exec(String(link?.message || ''))?.[1]?.match(/`([^`]+)`/g)?.map(field => field.slice(1, -1))
    // Raw SQL writes surface Postgres's own detail instead: Key (event, artist)=(…) already exists.
    const keyed = /Key \((.*?)\)=\(.*\) already exists/.exec(text)?.[1]?.split(',').map(field => field.trim().replace(/^"|"$/g, ''))
    const unwrap = (field: unknown) => String(field).replace(/^lower\((.*)\)$/, '$1')
    const fields = (link?.code === 'P2002' && Array.isArray(link?.meta?.target) ? link.meta.target : listed ?? keyed)?.map(unwrap)
    if (fields?.length) {
      const target = [...fields].map(String).sort().join(',')
      const matches = Object.values(CONSTRAINT_MESSAGES).filter(rule => rule.fields && [...rule.fields].sort().join(',') === target)
      if (matches.length === 1) return matches[0]
      // Prisma names fields, not the index: when two rules share a field list, do not guess which one refused.
      if (matches.length > 1) return { code: 'TOUR_DUPLICATE_RECORD', message: 'That record already exists. Reload and check before adding it again.' }
    }
  }
  return null
}

export function constraintGraphQLError(error: GraphQLError, refusal: { code: string; message: string }): GraphQLError {
  return new GraphQLError(refusal.message, { nodes: error.nodes, source: error.source, positions: error.positions, path: error.path, extensions: { code: refusal.code } })
}
