import test from 'node:test';
import assert from 'node:assert/strict';
import { refundRequestRefusal } from './tour-tender';

test('a staff refund of 0 is refused unless it cancels the booking', () => {
  assert.match(refundRequestRefusal(0, false, []) || '', /above 0/);
  assert.equal(refundRequestRefusal(0, true, []), null);
  assert.equal(refundRequestRefusal(6000, false, []), null);
  assert.ok(refundRequestRefusal(-1, false, []));
  assert.ok(refundRequestRefusal(1.5, false, []));
});

test('a reused refund key must ask for the same amount as the first refund', () => {
  assert.equal(refundRequestRefusal(8000, false, [{ amount: 5000 }, { amount: 3000 }]), null);
  assert.match(refundRequestRefusal(6000, false, [{ amount: 5000 }, { amount: 3000 }]) || '', /different refund amount/);
});
