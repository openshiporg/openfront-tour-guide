import { GraphQLClient, gql } from 'graphql-request';
import { startOnboarding, completeOnboarding } from '../actions/onboarding';
import { itemsFor } from '../utils/dataUtils';
import { SECTIONS, type TemplateType } from '../config/templates';

const ENSURE = gql`mutation Ensure($entity: String!, $data: JSON!) { ensureTourOnboardingRecord(entity: $entity, data: $data) }`;
const ACTIVITY = gql`mutation Activity($template: String!, $seed: JSON!) { seedTourActivity(template: $template, seed: $seed) }`;

export type SectionState = Record<string, { status: 'idle' | 'running' | 'done' | 'error'; error?: string }>;

export function useOnboardingApi(args: { template: TemplateType; data: any; onSection: (type: string, status: 'running' | 'done' | 'error', error?: string) => void; onFinished: () => void; onFailed: (message: string) => void }) {
  const run = async () => {
    const client = new GraphQLClient(`${window.location.origin}/api/graphql`, { headers: { 'Content-Type': 'application/json' }, credentials: 'include' } as any);
    const ensure = async (entity: string, data: any): Promise<string> => {
      const result: any = await client.request(ENSURE, { entity, data });
      if (!result?.ensureTourOnboardingRecord?.id) throw new Error(`${entity} was not saved`);
      return result.ensureTourOnboardingRecord.id;
    };
    const phase = async (type: string, fn: () => Promise<void>) => {
      args.onSection(type, 'running');
      try { await fn(); args.onSection(type, 'done'); }
      catch (e: any) { const message = e?.response?.errors?.[0]?.message || e?.message || 'Failed'; args.onSection(type, 'error', message); throw new Error(message); }
    };
    const d = args.data;
    const started = await startOnboarding();
    if (!started.success) return args.onFailed(started.error || 'Could not record setup progress');
    try {
      await phase('settings', async () => { await ensure('settings', d.settings); });
      await phase('paymentProvider', async () => { await ensure('paymentProvider', d.paymentProvider); });
      await phase('roles', async () => { for (const r of d.roles) await ensure('role', r); });
      const meeting: string[] = [], policies: string[] = [];
      await phase('meetingPoints', async () => { for (const m of d.meetingPoints) meeting.push(await ensure('meetingPoint', m)); });
      await phase('cancellationPolicies', async () => { for (const p of d.cancellationPolicies) policies.push(await ensure('cancellationPolicy', p)); });
      let waiverId: string | undefined;
      await phase('waiver', async () => { if (d.tours.some((t: any) => t.waiver)) waiverId = await ensure('waiver', d.waiver); });
      await phase('promoCodes', async () => { for (const p of d.promoCodes) await ensure('promoCode', p); });
      await phase('channels', async () => { for (const c of d.channels) await ensure('channel', c); });
      await phase('resources', async () => { for (const r of d.resources) await ensure('resource', r); });
      await phase('guides', async () => { for (const g of d.guides) await ensure('guide', g); });
      await phase('tours', async () => {
        for (const t of d.tours) {
          const { meetingPoint, policy, waiver, minimal, ...rest } = t;
          await ensure('tour', { ...rest, meetingPointId: meeting[Math.min(meetingPoint, meeting.length - 1)], policyId: policies[Math.min(policy, policies.length - 1)], waiverId: waiver ? waiverId : undefined });
        }
      });
      await phase('activity', async () => { await client.request(ACTIVITY, { template: args.template, seed: d }); });
      const done = await completeOnboarding();
      if (!done.success) return args.onFailed(done.error || 'Could not complete setup');
      args.onFinished();
    } catch (e: any) { args.onFailed(e.message); }
  };
  return { run, sections: SECTIONS, itemsFor };
}
