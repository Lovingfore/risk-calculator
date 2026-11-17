import test from 'node:test';
import assert from 'node:assert/strict';
import { drawBalanceChart } from '../src/balance-chart.js';

test('labels the balance axis in USDT', () => {
  const labels = [];
  const canvas = { width: 0, height: 0, getBoundingClientRect: () => ({ width: 360, height: 255 }) };
  const context = {
    canvas,
    setTransform() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    fill() {}, arc() {}, save() {}, restore() {}, translate() {}, rotate() {},
    fillText(text) { labels.push(text); },
  };
  const previousGetComputedStyle = globalThis.getComputedStyle;
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
  try {
    drawBalanceChart([], '7d', context, { now: Date.parse('2026-11-15T00:00:00.000Z') });
  } finally {
    if (previousGetComputedStyle) globalThis.getComputedStyle = previousGetComputedStyle;
    else delete globalThis.getComputedStyle;
  }
  assert.ok(labels.includes('USDT'));
});

test('shows a range-empty state when unlocked history has no samples in the selected range', () => {
  const labels = [];
  const canvas = { width: 0, height: 0, getBoundingClientRect: () => ({ width: 600, height: 300 }) };
  const context = {
    canvas,
    setTransform() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    fill() {}, arc() {}, save() {}, restore() {}, translate() {}, rotate() {},
    fillText(text) { labels.push(text); },
  };
  const previousGetComputedStyle = globalThis.getComputedStyle;
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
  try {
    drawBalanceChart([], '24h', context, {
      now: Date.parse('2026-11-16T21:51:00.000Z'),
      hasHistory: true,
    });
  } finally {
    if (previousGetComputedStyle) globalThis.getComputedStyle = previousGetComputedStyle;
    else delete globalThis.getComputedStyle;
  }
  assert.ok(labels.includes('此时间范围暂无记录'));
  assert.ok(!labels.includes('解锁后显示余额记录'));
});

test('shows the configured empty state before the first equity sample', () => {
  const labels = [];
  const canvas = { width: 0, height: 0, getBoundingClientRect: () => ({ width: 600, height: 300 }) };
  const context = {
    canvas,
    setTransform() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    fill() {}, arc() {}, save() {}, restore() {}, translate() {}, rotate() {},
    fillText(text) { labels.push(text); },
  };
  const previousGetComputedStyle = globalThis.getComputedStyle;
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
  try {
    drawBalanceChart([], '24h', context, {
      now: Date.parse('2026-11-16T21:51:00.000Z'),
      emptyMessage: '等待首次账户权益采样',
    });
  } finally {
    if (previousGetComputedStyle) globalThis.getComputedStyle = previousGetComputedStyle;
    else delete globalThis.getComputedStyle;
  }
  assert.ok(labels.includes('等待首次账户权益采样'));
});

test('rejects the removed one-hour range', () => {
  const canvas = { width: 0, height: 0, getBoundingClientRect: () => ({ width: 600, height: 300 }) };
  const context = new Proxy({ canvas }, { get: (target, property) => property in target ? target[property] : () => {} });
  const previousGetComputedStyle = globalThis.getComputedStyle;
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
  try {
    assert.throws(() => drawBalanceChart([], '1h', context), /Unsupported history range/);
  } finally {
    if (previousGetComputedStyle) globalThis.getComputedStyle = previousGetComputedStyle;
    else delete globalThis.getComputedStyle;
  }
});
