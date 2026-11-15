# Task 1 Report: Crypto and Balance History Contracts

## Implementation

- Added `src/history-crypto.js` with a fixed public 16-byte salt, PBKDF2-HMAC-SHA256 key derivation (600,000 iterations), AES-256-GCM encryption, a random 96-bit IV per sample, strict `{ version, iv, ciphertext }` records, and validated `{ timestamp, balance, resolution }` payloads. Passwords shorter than 32 characters are rejected.
- Added `src/balance-history.js` to parse the unique USDT wallet `balance` field, reject malformed/error responses, compact history into UTC hourly and daily buckets, enforce the 30/365/1825-day cutoffs, and filter actual samples for all eight approved ranges.
- Added focused tests for crypto round trips, wrong passwords, ciphertext tampering, password length, malformed samples and Binance responses, UTC rollups, retention boundaries, chronological ordering, and all supported filters.

## TDD Evidence

**RED:** With both test files written and the implementation modules absent, the bundled Node 24.22.1 executable ran `--test`. The two new test files failed during ESM module resolution with `ERR_MODULE_NOT_FOUND` for `src/balance-history.js` and `src/history-crypto.js`; all five pre-existing calculator tests passed. This confirmed the requested behavior had no implementation yet.

**GREEN:** The first implementation run passed 12/13 focused tests. The one failure exposed an incorrect daily-rollup test fixture: its timestamps crossed a UTC date boundary, and its expected array was not chronological. The fixture was corrected to put both samples on the same UTC date and to expect ascending timestamp order. After the correction and a direct test for the 32-character password minimum, the focused and full suites passed.

## Verification

- Focused: bundled Node `--test test/history-crypto.test.js test/balance-history.test.js` — 14 passed, 0 failed.
- Full: bundled Node `--test` — 19 passed, 0 failed.
- Interoperability: the test encrypts via Web Crypto and decrypts through the module, then encrypts through the module and decrypts through Web Crypto; both directions passed using AES-GCM with the derived key and appended authentication tag.

## Self-Review

The output sample shape is constrained to the three contract fields. Invalid samples are omitted by history compaction/filtering, while invalid inputs to encryption and decryption fail. Bucket keys use UTC epoch hours and UTC calendar dates. Future samples are excluded from compaction and range results. No collector, page, or unrelated existing files were changed.
