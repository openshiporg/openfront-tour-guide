import { text, integer, json, timestamp } from '@keystone-6/core/fields';
import { domainList, state, money, currency, rel } from './domainFields';
export const InventoryHold = domainList('canManageBookings', { departure: rel('Departure.holds'), quantity: integer({ validation: { isRequired: true, min: 1 } }), expiresAt: timestamp({ validation: { isRequired: true }, isIndexed: true }), cartTokenHash: text({ access: { read: () => false }, isIndexed: true }), status: state(['active','converted','released','expired']), quote: json({ access: { read: () => false } }), booking: rel('Booking.hold') }, true);
export const Booking = domainList('canManageBookings', {
  bookingRef: text({ isIndexed: 'unique', validation: { isRequired: true } }), departure: rel('Departure.bookings'), customer: rel('User.bookings'), guestName: text(), guestEmail: text({ isIndexed: true }), guestPhone: text(),
  status: state(['pending_payment','confirmed','checked_in','completed','no_show','cancelled','refunded','partially_refunded']), channel: rel('Channel.bookings'), source: state(['online','phone','walk_up','reseller']),
  subtotalCents: money(), addOnsCents: money(), discountCents: money(), taxCents: money(), feeCents: money(), totalCents: money(), channelCommissionCents: money(), refundedCents: money(), currencyCode: currency(), seats: integer({ defaultValue: 0, validation: { min: 0 } }),
  policySnapshot: json(), tourSnapshot: json(), paymentCollection: rel('PaymentCollection.booking'), payments: rel('Payment.order', true), refunds: rel('Refund.order', true),
  secretKey: text({ access: { read: () => false } }), specialRequests: text(), pickupLocation: text(), promoRedemptions: rel('PromoRedemption.booking', true), participants: rel('Participant.booking', true), lines: rel('BookingLine.booking', true), hold: rel('InventoryHold.booking'), statement: rel('ChannelStatement.bookings'), rebookCreditHash: text({ access: { read: () => false }, isIndexed: 'unique', db: { isNullable: true } }), creditUsedAt: timestamp(), manageTokenVersion: integer({ defaultValue: 0, validation: { min: 0 }, access: { read: () => false } }), partyChanges: rel('PartyChange.booking', true),
}, true);
export const BookingLine = domainList('canManageBookings', { booking: rel('Booking.lines'), name: text({ validation: { isRequired: true } }), unitPriceCents: money(), qty: integer({ validation: { min: 1, isRequired: true } }), seatsUsed: integer({ defaultValue: 1, validation: { min: 0 } }), kind: state(['ticket','addon']), feeCents: money(), taxCents: money(), totalCents: money(), currencyCode: currency(), catalogId: text() }, true);
// A change to who is on a booking (party size or ticket mix) with its price difference. Command-only (tour-party-change.ts). A change that
// costs more and is paid by card waits here as pending_payment with an InventoryHold (holdId) on any added seats until the payment succeeds.
export const PartyChange = domainList('canManageBookings', {
  booking: rel('Booking.partyChanges'), source: state(['guest', 'staff']), status: state(['pending_payment', 'applied', 'cancelled', 'failed']),
  plan: json(), differenceCents: integer({ defaultValue: 0 }), collectCents: money(), refundCents: money(), keptCents: money(), currencyCode: currency(),
  holdId: text(), paymentIntentId: text(), clientSecret: text({ access: { read: () => false } }), expiresAt: timestamp(), reason: text(), requestKey: text({ isIndexed: 'unique' }),
}, true);
