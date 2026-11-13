import { text, integer, json, checkbox, timestamp } from '@keystone-6/core/fields';
import { document } from '@keystone-6/fields-document';
import { permissions } from '../access';
import { domainList, name, state, rel } from './domainFields';
const Participant0 = domainList('canCheckIn', { booking: rel('Booking.participants'), ticketTypeSnapshot: json({ ui: { listView: { fieldMode: 'hidden' }, createView: { fieldMode: 'hidden' } } }), fullName: name(), age: integer({ validation: { min: 0 } }), email: text(), dietary: text(), medicalNotes: text({ access: { read: permissions.canReadMedicalNotes, create: () => false, update: () => false } }), waiverStatus: state(['required','signed','not_required']), checkInStatus: state(['pending','checked_in','no_show']), waiverTokenHash: text({ isIndexed: 'unique', db: { isNullable: true }, access: { read: () => false } }), signatures: rel('WaiverSignature.participant', true) }, true);
// A guide reads only the participants (and signatures) on departures where their own assignment is accepted or worked.
// Operations roles (manage departures or bookings) read everyone. Same rule as lib/tour-scope.ts, as a Keystone query filter.
const onMyDepartures = (session: any) => ({ departure: { assignedGuides: { some: { status: { in: ['accepted', 'worked'] }, guide: { userId: { equals: session.itemId } } } } } });
const scopedQuery = (forSignature: boolean) => ({ session }: any) => {
  if (!session?.itemId) return false;
  const role = session.data?.role;
  if (role?.canManageDepartures || role?.canManageBookings) return true;
  const booking = { booking: onMyDepartures(session) };
  return forSignature ? { participant: booking } : booking;
};
export const Participant = { ...Participant0, access: { ...(Participant0 as any).access, filter: { query: scopedQuery(false) } } } as typeof Participant0;
export const WaiverTemplate = domainList('canManageWaivers', { name: name(), version: integer({ defaultValue: 1, validation: { min: 1 } }), body: document({ formatting: true }), bodyHash: text(), status: state(['draft','published','archived']), tours: rel('Tour.requiresWaiver', true), signatures: rel('WaiverSignature.template', true) }, false, {
  validate: { update: ({ item, resolvedData, addValidationError }: any) => { if (item.status === 'published' && Object.keys(resolvedData).some(k => k !== 'updatedAt')) addValidationError('Published waiver versions are immutable'); } },
});
const WaiverSignature0 = domainList('canCheckIn', { participant: rel('Participant.signatures'), template: rel('WaiverTemplate.signatures'), templateVersion: integer({ validation: { isRequired: true } }), signerName: name(), isGuardian: checkbox({ defaultValue: false }), minorName: text(), signedAt: timestamp({ validation: { isRequired: true } }), ip: text(), userAgent: text(), bodyHash: text({ validation: { isRequired: true } }) }, true);
export const WaiverSignature = { ...WaiverSignature0, access: { ...(WaiverSignature0 as any).access, filter: { query: scopedQuery(true) } } } as typeof WaiverSignature0;
