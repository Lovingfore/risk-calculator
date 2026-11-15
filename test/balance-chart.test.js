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
