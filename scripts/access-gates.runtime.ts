import assert from 'node:assert/strict';
import { getContext } from '@keystone-6/core/context';
import config from '../features/keystone/index';
import * as PrismaModule from '@prisma/client';
import { randomUUID } from 'node:crypto';
const tag = 'depth-' + randomUUID();
async function main() {
  const base: any = getContext(config, PrismaModule), p = base.prisma;
  const mk = async (name: string, flags: Record<string, boolean>) => {
    const role = await p.role.create({ data: { name: `${tag}-${name}`, canAccessDashboard: true, ...flags } });
    const user = await p.user.create({ data: { name: `${tag}-${name}`, email: `${tag}-${name}@test.example`, password: 'disabled-runtime-fixture', roleId: role.id } });
    return base.withSession({ itemId: user.id, listKey: 'User', data: { role } });
  };
  const settings = await mk('settings', { canManageSettings: true }), customers = await mk('customers', { canManageCustomers: true }), none = await mk('none', { canManageGuides: true }), refunds = await mk('refunds', { canIssueRefunds: true });
  const can = async (fn: () => Promise<any>) => { try { await fn(); return true; } catch { return false; } };
  const row = await p.storeSettings.findFirst();
  const readS = (c: any) => can(async () => { const r = await c.query.StoreSettings.findMany({ query: 'id' }); if (!r.length) throw new Error('hidden'); });
  const writeS = (c: any) => can(() => c.query.StoreSettings.updateOne({ where: { id: row.id }, data: { refundApprovalThresholdCents: row.refundApprovalThresholdCents }, query: 'id' }));
  assert.equal(await writeS(settings), true, 'canManageSettings writes settings');
  assert.equal(await writeS(none), false, 'no permission cannot write settings');
  assert.equal(await writeS(refunds), false, 'refund staff cannot write settings');
  assert.equal(await readS(refunds), true, 'refund staff can read the threshold');
  assert.equal(await readS(none), false, 'a guides-only role cannot read settings');
  const seen = async (c: any) => (await c.query.User.findMany({ query: 'id' })).length;
  const total = await p.user.count();
  assert.equal(await seen(customers), total, 'canManageCustomers lists customers');
  assert.equal(await seen(none), 1, 'no permission sees only themself');
  await p.user.deleteMany({ where: { email: { startsWith: tag } } }); await p.role.deleteMany({ where: { name: { startsWith: tag } } });
  console.log('PASS settings/customers gates');
  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
