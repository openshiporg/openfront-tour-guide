import { text, integer, timestamp } from '@keystone-6/core/fields';
import { domainList, state, money, currency, rel } from './domainFields';

// Stored value. Only the hash of the code is kept (the code is shown once at issue, recomputable by the server only); the balance
// moves only through GiftCardEntry rows written by the gift card commands and the checkout/refund money path, under giftcard:<id>.
export const GiftCard = domainList('canManagePayments', {
  codeHash: text({ isIndexed: 'unique', access: { read: () => false } }), last4: text(),
  status: state(['active', 'void']), initialCents: money(), balanceCents: money(), currencyCode: currency(), expiresAt: timestamp(),
  fundedBy: state(['cash', 'complimentary']), recipientName: text(), recipientEmail: text({ isIndexed: true }), note: text(), issuedById: text(), replacesId: text(),
  entries: rel('GiftCardEntry.giftCard', true),
}, true);
// Ledger: the balance is the sum of the entries. amountCents is signed (issue/return +, redeem/void -).
export const GiftCardEntry = domainList('canManagePayments', {
  giftCard: rel('GiftCard.entries'), kind: state(['issue', 'redeem', 'return', 'void']), amountCents: integer({ validation: { isRequired: true } }),
  balanceAfterCents: money(), bookingId: text({ isIndexed: true }), bookingRef: text(), paymentId: text(), idempotencyKey: text({ isIndexed: 'unique' }), reason: text(), actorId: text(),
}, true);
