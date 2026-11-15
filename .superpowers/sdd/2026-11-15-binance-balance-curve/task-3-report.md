# Task 3 Report: Chinese Balance History UI

## Result

Added a Chinese balance history panel below the existing calculator. The panel provides password unlock, latest balance and adjacent-sample delta, sample time and freshness status, all eight requested ranges, and an adaptive Canvas chart with time/USDT axes and pointer/touch tooltips. Hourly and daily resolution appears in each point tooltip.

The browser reads only the fixed `history.jsonl` and `latest.json` URLs from the `balance-history` branch. Both records are decrypted in page memory; the password input is cleared immediately and the derived key is not persisted or transmitted. A missing pair of remote files produces an unconfigured state. Latest balance refreshes every 30 seconds, and samples older than 15 minutes are marked stale.

## Verification

- `node --check src/balance-app.js`, `node --check src/balance-chart.js`, and `node --check src/app.js` passed.
- `node --test` passed: 28 tests, 0 failures. This includes the adjacent-sample helper test supplied in the shared worktree.
- `git diff --check` passed; only Git line-ending conversion warnings were reported.
- Confirmed the existing calculator module was not modified.
- Static review confirmed there are no storage APIs or endpoints beyond the two fixed encrypted files.
- A desktop/mobile browser screenshot check could not be performed because the computer-use environment reported no available browser surface.

## Files

- `index.html`
- `styles.css`
- `src/balance-app.js`
- `src/balance-chart.js`
