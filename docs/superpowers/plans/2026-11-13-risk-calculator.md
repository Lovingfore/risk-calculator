# Risk Calculator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and publish a Chinese GitHub Pages calculator that chooses an 80x position size whose modeled stop loss and Binance taker fees stay within 1% of account capital.

**Architecture:** A dependency-free browser page imports a pure ES module for position sizing. Node's built-in test runner covers the calculator; GitHub Actions runs those tests and deploys the static page to Pages.

**Tech Stack:** HTML, CSS, JavaScript ES modules, Node.js built-in test runner, GitHub Actions Pages deployment.

**Spec:** `docs/superpowers/specs/2026-11-13-risk-calculator-design.md`

## Global Constraints

- Treat account capital as USDT and cap modeled stop loss at 1% of capital.
- Keep the target leverage at 80x.
- Assume Binance USDⓈ-M linear USDT contracts and 0.05% taker fee per side; include both entry and stop-exit fees.
- Assume the stop order fills at the entered stop price; disclose that slippage and funding are excluded.
- Use dependency-free static files; do not store or transmit input values.

---

### Task 1: Position Sizing Calculator

**Files:**
- Create: `package.json`
- Create: `src/calculator.js`
- Test: `test/calculator.test.js`

**Interfaces:**
- `calculatePosition({ capital, entryPrice, stopPrice })` returns `{ error }` for invalid inputs or `{ margin, leverage, quantity, notional, stopLoss, riskPercent }` for a usable position.
- Result money fields are USDT, `margin` is floored to cents, `leverage` is `80`, and `riskPercent` is stop loss divided by account capital times 100.

- [ ] **Step 1: Write failing tests with literal expected results**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePosition } from '../src/calculator.js';

test('includes entry and stop taker fees and stays under the one percent budget', () => {
  assert.deepEqual(calculatePosition({ capital: 1000, entryPrice: 100, stopPrice: 95 }), {
    margin: 2.45,
    leverage: 80,
    quantity: 1.96,
    notional: 196,
    stopLoss: 9.9911,
    riskPercent: 0.99911,
  });
});

test('rejects unusable prices and capital', () => {
  for (const input of [
    { capital: 0, entryPrice: 100, stopPrice: 95 },
    { capital: 1000, entryPrice: 0, stopPrice: 95 },
    { capital: 1000, entryPrice: 100, stopPrice: 100 },
  ]) assert.ok(calculatePosition(input).error);
});
```

- [ ] **Step 2: Run tests and confirm the missing module causes the expected failure**

Run: `npm test`
Expected: FAIL because `src/calculator.js` does not exist.

- [ ] **Step 3: Implement the fee-aware sizing function and Node test command**

```js
const LEVERAGE = 80;
const TAKER_FEE = 0.0005;
const RISK_FRACTION = 0.01;

export function calculatePosition({ capital, entryPrice, stopPrice }) {
  if (![capital, entryPrice, stopPrice].every(Number.isFinite) || capital <= 0 || entryPrice <= 0 || stopPrice <= 0 || entryPrice === stopPrice) {
    return { error: '请输入大于 0 且有效的本金、开仓价和不同的止损价。' };
  }
  const unitLoss = Math.abs(entryPrice - stopPrice) + TAKER_FEE * (entryPrice + stopPrice);
  const riskBudget = capital * RISK_FRACTION;
  const theoreticalMargin = (riskBudget / unitLoss) * entryPrice / LEVERAGE;
  const margin = Math.floor(Math.min(theoreticalMargin, capital) * 100) / 100;
  if (margin < 0.01) return { error: '按当前价格计算的投入金额不足 0.01 USDT。' };
  const notional = margin * LEVERAGE;
  const quantity = notional / entryPrice;
  const stopLoss = quantity * unitLoss;
  return { margin, leverage: LEVERAGE, quantity, notional, stopLoss, riskPercent: stopLoss / capital * 100 };
}
```

`package.json` sets `"type": "module"` and `"test": "node --test"`.

- [ ] **Step 4: Run the calculator tests and confirm both cases pass**

Run: `npm test`
Expected: PASS with two tests and no failures.

### Task 2: Chinese Calculator Page

**Files:**
- Create: `index.html`
- Create: `styles.css`
- Create: `src/app.js`
- Consume: `src/calculator.js`

**Interfaces:**
- `src/app.js` reads the three fields `capital`, `entry-price`, and `stop-price`, calls `calculatePosition`, and updates the result elements or an accessible error message on every input event.

- [ ] **Step 1: Create semantic input, result, and disclosure markup**

Use labeled numeric inputs with decimal steps, a `role="status"` error region, result values for margin/leverage/notional/stop loss/risk rate, and a visible disclosure that fees are assumed at 0.05% per side while slippage and funding are excluded; label contract quantity as theoretical and advise rounding down to pair precision.

- [ ] **Step 2: Connect form input to the tested calculator and format results**

On each input event, clear previous output first; show the returned error or render all result values using `Intl.NumberFormat('zh-CN', { maximumFractionDigits: 4 })` and a separate `zh-CN` USDT currency formatter.

- [ ] **Step 3: Style a compact responsive trading tool and inspect it at desktop and narrow widths**

Use a restrained green accent for position outputs, neutral white surfaces, and red only for validation; preserve readable labels and avoid horizontal overflow at 375px viewport width.

### Task 3: GitHub Pages and Repository Handoff

**Files:**
- Create: `.github/workflows/pages.yml`
- Create: `README.md`

**Interfaces:**
- The workflow runs `npm test` on pushes and pull requests to `main`; push-to-main deploys the repository root with `actions/upload-pages-artifact` and `actions/deploy-pages`.

- [ ] **Step 1: Document the calculator assumptions and run instructions**

README lists the three inputs, the 80x target, 1% risk cap, 0.05% Binance taker fee per side, excluded factors, and `npm test`.

- [ ] **Step 2: Add least-privilege Pages deployment workflow**

Grant `contents: read`, `pages: write`, and `id-token: write`; gate deployment to `main`, stage only the HTML, CSS, and browser modules in `_site/`, then use the official Pages configure/upload/deploy actions.

- [ ] **Step 3: Run all tests and inspect the complete static site before publishing**

Run: `npm test`
Expected: PASS with all calculator cases and no failures; confirm all asset URLs are root-relative and the page works from a subpath.
