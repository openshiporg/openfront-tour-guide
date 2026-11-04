import test from 'node:test';
import assert from 'node:assert/strict';
import { settlementTransition, validatePayout } from '../mutations/tour-settlement';
test('settlement transitions do not skip approval or invoice', () => {
  settlementTransition('payout','draft','approved'); settlementTransition('payout','approved','paid','wire receipt');
  settlementTransition('statement','open','invoiced'); settlementTransition('statement','invoiced','paid','bank receipt');
  for (const [kind,current,next,ref] of [['payout','draft','paid','x'],['statement','paid','open','x'],['payout','approved','paid',' '],['statement','invoiced','paid','x'.repeat(201)]] as const) assert.throws(()=>settlementTransition(kind,current,next,ref));
});
test('payout must conserve worked assignment amounts and currency', () => {
  const p={guideId:'g',currencyCode:'USD',totalCents:1234,assignments:[{guideId:'g',currencyCode:'USD',payCents:1234,status:'worked'}]};
  validatePayout(p);
  assert.throws(()=>validatePayout({...p,totalCents:1235}));
  assert.throws(()=>validatePayout({...p,assignments:[]}));
  for (const change of [{status:'accepted'},{currencyCode:'EUR'},{guideId:'other'}]) assert.throws(()=>validatePayout({...p,assignments:[{...p.assignments[0],...change}]}));
});
