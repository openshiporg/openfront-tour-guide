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
export const models = {
  User, Role, OAuthApp, OAuthToken, Tour, TicketType, AddOn, MeetingPoint, CancellationPolicy, PricingRule, Schedule,
  Departure, Guide, GuideCertification, GuideAvailability, GuideAssignment, Resource, ResourceAssignment, GuidePayout,
  Booking, BookingLine, InventoryHold, PartyChange, Participant, WaiverTemplate, WaiverSignature, Channel, ChannelStatement,
  OperationalTask, NotificationPreference, WaitlistEntry, StoreSettings, AuditEvent, PromoCode, PromoRedemption, PaymentProvider, PaymentCollection, PaymentSession,
  Payment, Refund, PaymentWebhookEvent, IdempotencyKey, ManagerApproval,
};
export default models;
