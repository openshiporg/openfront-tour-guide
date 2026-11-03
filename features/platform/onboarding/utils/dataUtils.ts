import type { TemplateType } from '../config/templates';

export function getSeedForTemplate(template: TemplateType, seed: any) {
  if (template === 'full') return seed;
  const tours = seed.tours.filter((t: any) => t.minimal);
  return {
    ...seed,
    tours,
    guides: seed.guides.slice(0, 1),
    meetingPoints: seed.meetingPoints.slice(0, 1),
    cancellationPolicies: seed.cancellationPolicies.slice(0, 1),
    channels: [],
    resources: [],
    promoCodes: [],
    bookingTarget: 0,
  };
}
export function itemsFor(data: any, type: string): string[] {
  switch (type) {
    case 'settings': return [data.settings?.name].filter(Boolean);
    case 'paymentProvider': return [data.paymentProvider?.name].filter(Boolean);
    case 'waiver': return data.tours?.some((t: any) => t.waiver) ? [data.waiver?.name] : [];
    case 'roles': case 'meetingPoints': case 'cancellationPolicies': case 'channels': case 'resources': case 'guides': case 'tours': return (data[type] || []).map((x: any) => x.name);
    case 'promoCodes': return (data.promoCodes || []).map((x: any) => x.code);
    case 'activity': return [data.tours?.length === 1 ? 'Three departures' : 'Departures, bookings and history'];
    default: return [];
  }
}
