export type TemplateType = 'full' | 'minimal';
export const TEMPLATES: Record<TemplateType, { name: string; description: string }> = {
  full: { name: 'Complete operator setup', description: 'Six tours, eight guides, fleet, channels, three weeks of departures, bookings and history.' },
  minimal: { name: 'Minimal setup', description: 'One tour, one guide and three departures.' },
};
export const SECTIONS = [
  { type: 'settings', label: 'Operator settings' },
  { type: 'paymentProvider', label: 'Payment provider' },
  { type: 'roles', label: 'Roles' },
  { type: 'meetingPoints', label: 'Meeting points' },
  { type: 'cancellationPolicies', label: 'Cancellation policies' },
  { type: 'waiver', label: 'Waiver' },
  { type: 'promoCodes', label: 'Promo codes' },
  { type: 'channels', label: 'Channels' },
  { type: 'resources', label: 'Fleet' },
  { type: 'guides', label: 'Guides' },
  { type: 'tours', label: 'Tours' },
  { type: 'activity', label: 'Departures and bookings' },
] as const;
