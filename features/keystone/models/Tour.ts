import { text, integer, json, checkbox } from '@keystone-6/core/fields';
import { domainList, name, state, rel } from './domainFields';
export const Tour = domainList('canManageTours', {
  name: name(), slug: text({ isIndexed: 'unique', validation: { isRequired: true } }),
  kind: state(['walking','food','water','bike','vehicle_day_trip','multi_day','private_only']),
  description: text({ ui: { displayMode: 'textarea' } }), highlights: json(),
  durationMinutes: integer({ defaultValue: 120, validation: { min: 1 } }), durationDays: integer({ validation: { min: 1 } }),
  timezone: text({ defaultValue: 'America/New_York' }), meetingPoint: rel('MeetingPoint.tours'),
  minParticipants: integer({ defaultValue: 1, validation: { min: 1 } }), maxParticipants: integer({ defaultValue: 24, validation: { min: 1 } }), guideRatio: integer({ defaultValue: 12, validation: { min: 1 } }),
  requiresResourceKind: state(['none','van','kayak','bike','boat']), minAge: integer({ defaultValue: 0, validation: { min: 0 } }), fitnessLevel: text(),
  inclusions: json(), exclusions: json(), whatToBring: text(), images: json(),
  cancellationPolicy: rel('CancellationPolicy.tours'), requiresWaiver: rel('WaiverTemplate.tours'), requiredCertifications: json({ defaultValue: [] }),
  status: state(['draft','active','archived']), ticketTypes: rel('TicketType.tour', true), addOns: rel('AddOn.tour', true), pricingRules: rel('PricingRule.tour', true), schedules: rel('Schedule.tour', true), departures: rel('Departure.tour', true), promoCodes: rel('PromoCode.tours', true),
});
