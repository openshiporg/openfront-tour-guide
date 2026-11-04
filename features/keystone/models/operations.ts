import { permissions } from '../access';
import { text, integer, checkbox, json, timestamp } from '@keystone-6/core/fields';
import { domainList, name, state, money, currency, rel } from './domainFields';
export const Channel = domainList('canManageChannels', { name: name(), commissionBps: integer({ defaultValue: 0, validation: { min: 0, max: 10000 } }), paymentModel: state(['channel_collects','we_collect']), contact: text(), active: checkbox({ defaultValue: true }), allocation: integer({ defaultValue: 0, validation: { min: 0 } }), bookings: rel('Booking.channel', true), statements: rel('ChannelStatement.channel', true) });
export const ChannelStatement = domainList('canManageChannels', { channel: rel('Channel.statements'), periodStart: timestamp(), periodEnd: timestamp(), bookings: rel('Booking.statement', true), grossCents: money(), commissionCents: money(), netDueCents: money(), currencyCode: currency(), status: state(['open','invoiced','paid']), statementKey: text({ isIndexed: 'unique' }) }, true);
export const OperationalTask = domainList('canManageDepartures', { name: name(), departure: rel('Departure.tasks'), status: state(['open','resolved']), taskKey: text({ isIndexed: 'unique' }), notes: text() }, true);
export const NotificationPreference = domainList('canManageBookings', { email: text({ isIndexed: 'unique' }), bookingUpdates: checkbox({ defaultValue: true }), weatherCancellation: checkbox({ defaultValue: true }) });
const settingsList = domainList('canManageSettings', { name: name(), timezone: text({ defaultValue: 'America/New_York' }), address: text(), currencyCode: currency(), refundApprovalThresholdCents: integer({ defaultValue: 10000, validation: { min: 0 } }), taxBps: integer({ defaultValue: 0, validation: { min: 0, max: 10000 } }), settingsKey: text({ defaultValue: 'operator', isIndexed: 'unique' }) });
// Writing operator settings (tax, currency, refund threshold) needs canManageSettings. Reading stays open to the roles whose screens
// show those values (the refund threshold on Bookings), so refund and booking staff are not locked out of their own screens.
const readsSettings = (args: any) => permissions.canManageSettings(args) || permissions.canIssueRefunds(args) || permissions.canManageBookings(args);
export const StoreSettings = { ...settingsList, access: { ...settingsList.access, operation: { ...(settingsList as any).access.operation, query: readsSettings } }, graphql: { plural: 'StoreSettingsItems' } };
export const AuditEvent = domainList('canReadAudit', { actor: rel('User.auditEvents'), action: text({ validation: { isRequired: true } }), targetList: text({ validation: { isRequired: true } }), targetId: text({ validation: { isRequired: true }, isIndexed: true }), before: json(), after: json(), reason: text(), requestId: text({ isIndexed: true }) }, true);
export const PromoCode = domainList('canManagePromos', {
  code: text({ isIndexed: 'unique', validation: { isRequired: true, match: { regex: /^[A-Z0-9_-]{3,40}$/, explanation: 'Uppercase letters, digits, dash or underscore' } } }),
  discountType: state(['percent_bps', 'amount_cents', 'comp']), value: integer({ defaultValue: 0, validation: { min: 0 } }),
  maxUses: integer({ validation: { min: 1 } }), usedCount: integer({ defaultValue: 0, access: { create: () => false, update: () => false } }), perOrderLimit: integer({ validation: { min: 1 } }),
  startsAt: timestamp(), endsAt: timestamp(), status: state(['active', 'paused', 'expired']),
  tours: rel('Tour.promoCodes', true), redemptions: rel('PromoRedemption.promoCode', true),
});
export const PromoRedemption = domainList('canManagePromos', {
  promoCode: rel('PromoCode.redemptions'), booking: rel('Booking.promoRedemptions'), holdId: text({ isIndexed: true }), amountCents: money(), currencyCode: currency(), status: state(['reserved', 'committed', 'released']),
}, true);
