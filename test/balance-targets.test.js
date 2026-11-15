import test from 'node:test';
import assert from 'node:assert/strict';
import { createBalanceTargets, getCompletedTargetCount, getTargetPage } from '../src/balance-targets.js';

test('creates 625 compounding balance targets from 4000 USDT', () => {
  const targets = createBalanceTargets();
  assert.equal(targets.length, 625);
  assert.deepEqual(targets[0], { number: 1, principal: 4000, afterGrowth: 4040 });
  assert.deepEqual(targets[1], { number: 2, principal: 4040, afterGrowth: 4080.4 });
  assert.equal(targets[2].principal, targets[1].afterGrowth);
});

test('marks targets complete only when the latest balance is strictly above principal', () => {
  assert.equal(getCompletedTargetCount(3999.99), 0);
  assert.equal(getCompletedTargetCount(4000), 0);
  assert.equal(getCompletedTargetCount(4000.01), 1);
  assert.equal(getCompletedTargetCount(4040), 1);
  assert.equal(getCompletedTargetCount(4040.01), 2);
  assert.equal(getCompletedTargetCount(Number.NaN), 0);
});

test('returns one-based pages and includes the final partial page', () => {
  const targets = createBalanceTargets();
  assert.equal(getTargetPage(targets, 1).length, 25);
  assert.equal(getTargetPage(targets, 1)[0].number, 1);
  assert.equal(getTargetPage(targets, 2)[0].number, 26);
  assert.equal(getTargetPage(targets, 25)[0].number, 601);
  assert.equal(getTargetPage(targets, 25).at(-1).number, 625);
});
