import test from 'node:test';
import assert from 'node:assert/strict';
import { compactHistory, DEFAULT_HISTORY_RANGE, filterHistory, getLatestSample, parseUsdMBalance } from '../src/balance-history.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.parse('2026-11-15T12:00:00.000Z');
const sample = (time, balance, resolution = 'raw') => ({
  timestamp: new Date(time).toISOString(), balance, resolution,
});

test('defaults the balance chart to the latest 24 hours', () => {
  const samples = [sample(NOW - DAY - 1, 1), sample(NOW - DAY, 2), sample(NOW, 3)];
  assert.equal(DEFAULT_HISTORY_RANGE, '24h');
  assert.deepEqual(filterHistory(samples, DEFAULT_HISTORY_RANGE, NOW), samples.slice(1));
});

test('selects only the USDT wallet balance from a Binance response', () => {
  assert.equal(parseUsdMBalance([
    { asset: 'BTC', balance: '0.25' },
    { asset: 'USDT', balance: '1234.5600' },
  ]), 1234.56);
});

test('rejects malformed or unsuccessful Binance balance responses', () => {
  for (const payload of [
    null,
    { code: -1000, msg: 'error' },
    [],
    [{ asset: 'BTC', balance: '1' }],
    [{ asset: 'USDT' }],
    [{ asset: 'USDT', balance: 'NaN' }],
    [{ asset: 'USDT', balance: '-1' }],
  ]) assert.throws(() => parseUsdMBalance(payload));
});

test('compresses with UTC hour and day buckets and keeps latest valid sample', () => {
  const samples = [
    sample(NOW - 40 * DAY + 10 * HOUR + 5 * 60 * 1000, 20),
    sample(NOW - 40 * DAY + 10 * HOUR + 55 * 60 * 1000, 21),
    sample(NOW - 400 * DAY + HOUR, 30),
    sample(NOW - 400 * DAY + 10 * HOUR, 31),
  ];
  assert.deepEqual(compactHistory(samples, NOW), [
    { ...samples[3], resolution: 'daily' },
    { ...samples[1], resolution: 'hourly' },
  ]);
});

test('applies inclusive 30, 365, and 1825 day retention cutoffs', () => {
  const samples = [
    sample(NOW - 30 * DAY, 30),
    sample(NOW - 30 * DAY - 1, 31),
    sample(NOW - 365 * DAY, 365),
    sample(NOW - 365 * DAY - 1, 366),
    sample(NOW - 1825 * DAY, 1825),
    sample(NOW - 1825 * DAY - 1, 1826),
  ];
  const compacted = compactHistory(samples, NOW);
  assert.equal(compacted.some(item => item.timestamp === samples[0].timestamp && item.resolution === 'raw'), true);
  assert.equal(compacted.some(item => item.timestamp === samples[1].timestamp && item.resolution === 'hourly'), true);
  assert.equal(compacted.some(item => item.timestamp === samples[2].timestamp && item.resolution === 'hourly'), true);
  assert.equal(compacted.some(item => item.timestamp === samples[3].timestamp && item.resolution === 'daily'), true);
  assert.equal(compacted.some(item => item.timestamp === samples[4].timestamp && item.resolution === 'daily'), true);
  assert.equal(compacted.some(item => item.timestamp === samples[5].timestamp), false);
});

test('sorts compacted samples chronologically and ignores invalid samples', () => {
  const result = compactHistory([
    sample(NOW - 10 * 60 * 1000, 10),
    { ...sample(NOW - 5 * 60 * 1000, 11), balance: -1 },
    sample(NOW - 15 * 60 * 1000, 9),
  ], NOW);
  assert.deepEqual(result, [sample(NOW - 15 * 60 * 1000, 9), sample(NOW - 10 * 60 * 1000, 10)]);
});

test('keeps only the latest valid sample in each UTC five-minute raw bucket', () => {
  const samples = [
    sample(NOW - 59 * 60 * 1000, 10),
    sample(NOW - 56 * 60 * 1000, 11),
    { ...sample(NOW - 57 * 60 * 1000, 99), balance: -1 },
    sample(NOW - 55 * 60 * 1000, 12),
  ];
  assert.deepEqual(compactHistory(samples, NOW), [samples[1], samples[3]]);
});

test('filters actual samples using all eight supported time ranges', () => {
  const ranges = [['1h', HOUR], ['24h', DAY], ['7d', 7 * DAY], ['30d', 30 * DAY],
    ['180d', 180 * DAY], ['1y', 365 * DAY], ['3y', 3 * 365 * DAY], ['5y', 5 * 365 * DAY]];
  const samples = ranges.map(([, duration], index) => sample(NOW - duration, index));
  samples.push(sample(NOW, 99));
  for (const [range, duration] of ranges) {
    assert.deepEqual(filterHistory(samples, range, NOW), samples.filter(item => Date.parse(item.timestamp) >= NOW - duration));
  }
});

test('rejects an unsupported filter range', () => {
  assert.throws(() => filterHistory([], '2y', NOW));
});

test('returns only the fixed sample fields when filtering records with extra properties', () => {
  const input = { ...sample(NOW, 99), note: 'unexpected', source: 'fixture' };
  assert.deepEqual(filterHistory([input], '1h', NOW), [sample(NOW, 99)]);
});

test('selects the newest sample and its immediate chronological predecessor', () => {
  const older = sample(NOW - 2 * HOUR, 100);
  const newer = sample(NOW - HOUR, 125, 'hourly');
  const latest = sample(NOW, 110);
  assert.deepEqual(getLatestSample([latest, older, newer]), {
    current: latest,
    previous: newer,
    delta: -15,
  });
  assert.deepEqual(getLatestSample([older]), { current: older, previous: null, delta: null });
  assert.deepEqual(getLatestSample([]), { current: null, previous: null, delta: null });
});
