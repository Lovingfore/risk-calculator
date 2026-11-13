import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePosition } from '../src/calculator.js';

test('includes entry and stop taker fees and stays under the one percent budget', () => {
  const result = calculatePosition({ capital: 1000, entryPrice: 100, stopPrice: 95 });
  assert.equal(result.margin, 2.45);
  assert.equal(result.leverage, 80);
  assert.equal(result.quantity, 1.96);
  assert.equal(result.notional, 196);
  assert.equal(result.stopLoss, 9.9911);
  assert.ok(result.stopLoss <= 10);
  assert.ok(result.riskPercent < 1);
});

test('reduces margin by one cent when the higher stop price would exceed the risk budget', () => {
  const result = calculatePosition({ capital: 1000, entryPrice: 100, stopPrice: 105 });
  assert.equal(result.margin, 2.44);
  assert.equal(result.notional, 195.2);
  assert.equal(result.stopLoss, 9.96008);
  assert.ok(result.stopLoss <= 10);
});

test('rejects unusable prices and capital', () => {
  for (const input of [
    { capital: 0, entryPrice: 100, stopPrice: 95 },
    { capital: 1000, entryPrice: 0, stopPrice: 95 },
    { capital: 1000, entryPrice: 100, stopPrice: 100 },
  ]) assert.ok(calculatePosition(input).error);
});

test('rejects a position whose required margin is below one cent', () => {
  assert.match(calculatePosition({ capital: 0.001, entryPrice: 100, stopPrice: 95 }).error, /0\.01 USDT/);
});

test('rejects finite inputs whose calculated position exceeds the supported numeric range', () => {
  assert.match(calculatePosition({ capital: Number.MAX_VALUE, entryPrice: 100, stopPrice: 99.999999 }).error, /范围过大/);
});
