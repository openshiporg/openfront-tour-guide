import { User } from './User';
import { Role } from './Role';
import { OAuthApp } from './OAuthApp';
import { OAuthToken } from './OAuthToken';
import { Tour } from './Tour';
import { TicketType, AddOn, MeetingPoint, CancellationPolicy, PricingRule, Schedule } from './catalog';
import { Departure } from './Departure';
import { Guide, GuideCertification, GuideAvailability, GuideAssignment, Resource, ResourceAssignment, GuidePayout } from './staffing';
import { Booking, BookingLine, InventoryHold, PartyChange } from './Booking';
import { Participant, WaiverTemplate, WaiverSignature } from './waivers';
import { Channel, ChannelStatement, OperationalTask, NotificationPreference, WaitlistEntry, StoreSettings, AuditEvent, PromoCode, PromoRedemption } from './operations';
import { PaymentProvider } from './PaymentProvider';
import { PaymentCollection } from './PaymentCollection';
import { PaymentSession } from './PaymentSession';
import { Payment } from './Payment';
import { Refund } from './Refund';
import { PaymentWebhookEvent } from './PaymentWebhookEvent';
import { ManagerApproval } from './ManagerApproval';
import { IdempotencyKey } from './IdempotencyKey';
import { GiftCard, GiftCardEntry } from './giftCards';
const rawModels = {
  User, Role, OAuthApp, OAuthToken, Tour, TicketType, AddOn, MeetingPoint, CancellationPolicy, PricingRule, Schedule,
  Departure, Guide, GuideCertification, GuideAvailability, GuideAssignment, Resource, ResourceAssignment, GuidePayout,
  Booking, BookingLine, InventoryHold, PartyChange, Participant, WaiverTemplate, WaiverSignature, Channel, ChannelStatement,
  OperationalTask, NotificationPreference, WaitlistEntry, StoreSettings, AuditEvent, PromoCode, PromoRedemption, PaymentProvider, PaymentCollection, PaymentSession,
  Payment, Refund, PaymentWebhookEvent, IdempotencyKey, ManagerApproval, GiftCard, GiftCardEntry,
};

// Sidebar visibility follows the role: a list whose query access denies the session is hidden from navigation
// (Keystone evaluates ui.isHidden per session in admin meta). Explicit isHidden settings are kept.
type QueryAccess = (args: any) => unknown;
export const models = Object.fromEntries(Object.entries(rawModels).map(([key, config]: [string, any]) => {
  const query: unknown = config?.access?.operation?.query;
  if (typeof query !== 'function') return [key, config];
  const existing = config?.ui?.isHidden;
  const isHidden = (args: any) => {
    if (existing === true) return true;
    if (typeof existing === 'function' && existing(args)) return true;
    return !(query as QueryAccess)(args);
  };
  return [key, { ...config, ui: { ...(config.ui ?? {}), isHidden } }];
})) as typeof rawModels;
export default models;
