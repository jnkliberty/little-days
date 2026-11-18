import assert from 'node:assert/strict';
import test from 'node:test';
import { args, checkPlan } from './live-smoke.ts';

test('receipt-only mode keeps the two receipt checks and drops the rest', () => {
  assert.deepEqual(checkPlan(true), ['child setup', 'measurement roundtrip', 'CSV export']);
});

test('the full smoke keeps every step, in the order the receipt needs', () => {
  const plan = checkPlan(false);
  assert.ok(plan.length > 3);
  assert.deepEqual(plan.filter(step => ['child setup', 'measurement roundtrip', 'CSV export'].includes(step)), ['child setup', 'measurement roundtrip', 'CSV export']);
  assert.ok(plan.includes('photo upload') && plan.includes('caregiver permissions'));
});

test('the receipt-only flag takes no value and a missing value still fails', () => {
  assert.deepEqual(args(['--receipt-only', '--cleanup-summary', 'f.json']), { 'receipt-only': '1', 'cleanup-summary': 'f.json' });
  assert.throws(() => args(['--cleanup-summary']), /invalid arguments/);
});
