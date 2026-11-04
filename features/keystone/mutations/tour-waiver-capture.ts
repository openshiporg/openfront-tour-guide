import { createHash } from 'node:crypto';
import { command, audit, authorize, userFacingError } from '../lib/tour-command';
import { plainText } from './tour-catalog';
import { assertDepartureAccess } from '../lib/tour-scope';

const LIVE = ['confirmed', 'checked_in'];

// On-site waiver capture at check-in: the guest reads and signs on the guide's device. It writes the same WaiverSignature
// (template version, body hash) as the emailed link, but records WHO attested: userAgent "staff-assisted:<staff id>" and an audit event.
async function load(context: any, participantId: string) {
  const participant = await context.prisma.participant.findUnique({ where: { id: participantId }, include: { booking: true } });
  if (!participant) throw new Error('Participant not found');
  if (participant.waiverStatus === 'not_required') throw new Error('This tour does not require a waiver');
  const templateId = participant.booking.tourSnapshot?.waiverTemplateId;
  const template = templateId && await context.prisma.waiverTemplate.findUnique({ where: { id: templateId } });
  if (!template || template.status !== 'published') throw new Error('Waiver unavailable: publish the waiver version first');
  return { participant, template };
}
export async function participantWaiver(_r: any, args: any, context: any) {
  const actor = await authorize(context, 'canCheckIn');
  try {
    const { participant, template } = await load(context, String(args.participantId));
    await assertDepartureAccess(context.prisma, actor, participant.booking.departureId);
    return { participantId: participant.id, participantName: participant.fullName, age: participant.age, status: participant.waiverStatus, name: template.name, version: template.version, text: plainText(template.body) };
  } catch (e) { throw userFacingError(e); }
}
export async function captureWaiverOnSite(_r: any, args: any, context: any) {
  const user = await authorize(context, 'canCheckIn');
  const i = args.input;
  try {
    const signerName = String(i.signerName || '').trim();
    if (!signerName) throw new Error('The signer must type their name');
    if (signerName.length > 200) throw new Error('Signer name is too long');
    const { participant, template } = await load(context, String(i.participantId));
    await assertDepartureAccess(context.prisma, user, participant.booking.departureId);
    if (!LIVE.includes(participant.booking.status)) throw new Error('Booking is not confirmed');
    const bodyHash = createHash('sha256').update(JSON.stringify(template.body)).digest('hex');
    return await command(context, args.idempotencyKey, 'captureWaiverOnSite', { participantId: participant.id, signerName, isGuardian: !!i.isGuardian }, [`participant:${participant.id}`], async (tx: any) => {
      const current = await tx.participant.findUnique({ where: { id: participant.id }, select: { waiverStatus: true } });
      if (current.waiverStatus === 'signed') return { signed: true, alreadySigned: true };
      await tx.waiverSignature.create({ data: { participantId: participant.id, templateId: template.id, templateVersion: template.version, signerName, isGuardian: !!i.isGuardian, minorName: i.isGuardian ? participant.fullName : '', signedAt: new Date(), ip: '', userAgent: `staff-assisted:${user.id}`, bodyHash } });
      await tx.participant.update({ where: { id: participant.id }, data: { waiverStatus: 'signed' } });
      await audit(tx, user.id, 'waiver.captured_on_site', 'Participant', participant.id, { waiverStatus: current.waiverStatus }, { waiverStatus: 'signed', signerName, isGuardian: !!i.isGuardian, templateVersion: template.version }, 'Signed on staff device at check-in', args.idempotencyKey);
      return { signed: true, alreadySigned: false };
    });
  } catch (e) { throw userFacingError(e); }
}
