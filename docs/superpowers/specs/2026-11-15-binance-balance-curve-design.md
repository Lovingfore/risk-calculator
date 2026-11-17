# Binance Balance Curve Design

## Goal

Extend the public GitHub Pages risk calculator with a private-to-the-key-holder history view for Binance USDⓈ-M account equity, including unrealized position profit and loss. The collector and encrypted history use GitHub services only, with no paid service or automatic upgrade. The equity is decrypted in the browser and shown below the existing position calculator.

## Scope

- Track USDⓈ-M Futures account equity computed as `totalWalletBalance + totalUnrealizedProfit` from Binance `GET /fapi/v3/account`.
- Mark equity samples explicitly and keep legacy wallet-only samples out of the equity chart, summary, and target progress; do not infer historic unrealized PnL.
- Do not track Spot, unrealized profit/loss, total margin balance, orders, or positions.
- Keep the current calculator and its fee-aware 80x sizing behavior unchanged.
- Add a historical line chart with ranges of 1 hour, 24 hours, 7 days, 30 days, 180 days, 1 year, 3 years, and 5 years.
- Do not add trade execution, withdrawals, notifications, or account login.

## Collection and Storage

1. A separate GitHub Actions workflow runs every five minutes using an offset schedule (`3-59/5 * * * *`) to avoid starting at the top of the hour. It may also support manual dispatch for setup verification.
2. The collector signs a read-only request to Binance Futures and selects the `USDT` wallet `balance` field. It records the sampled value and UTC timestamp only.
3. Each record is authenticated-encrypted with AES-256-GCM before it is written to the public `balance-history` branch. The record format includes a version, a random 96-bit IV, and ciphertext with the GCM tag appended. Timestamp and balance are both encrypted.
4. Derive the AES key from `BALANCE_HISTORY_PASSWORD` with PBKDF2-HMAC-SHA256, 600,000 iterations, and a public 16-byte random salt generated once for this project and shared by the browser and collector. Require a randomly generated password of at least 32 characters.
5. Keep the current rolling dataset at these resolutions, using the last valid observation in each UTC bucket:
   - 5-minute raw samples for the most recent 30 days.
   - Hourly samples older than 30 days and newer than 365 days.
   - Daily samples older than 365 days and newer than 1,825 days.
6. Store the latest sample separately as an encrypted small file so an open page can refresh it without downloading the full history each time. Read encrypted data from `raw.githubusercontent.com`; use a cache-busting query parameter when refreshing. The page downloads the full history at unlock and fetches only the latest sample every 30 seconds.
7. Retention applies to the current history dataset and chart. Earlier encrypted versions can remain in public Git commit history; those versions are still decryptable by whoever knows the history password. The design does not promise secure erasure of prior encrypted commits.

## Secrets and Access

Configure these repository Actions Secrets in GitHub; never put their values in source, issues, logs, or chat:

- `BINANCE_API_KEY`: a Binance key with reading permission only.
- `BINANCE_API_SECRET`: the matching signing secret.
- `BALANCE_HISTORY_PASSWORD`: a high-entropy password used to encrypt history and entered by the user in the page.

Disable Binance trading and withdrawal permissions. GitHub-hosted runners do not have a stable outbound IP, so this design cannot reliably use Binance's IP allowlist. The browser holds the history password only in memory for the current page session and sends no decrypted balance or password to a server. The public branch contains ciphertext and commit timing metadata, not plaintext balances. Because the page and Actions workflow are hosted in a public repository, maintainers must protect changes to the default branch and review any workflow change that can access Actions Secrets.

The GitHub-hosted standard runner is currently free for public repositories. GitHub's schedule minimum is five minutes; scheduled runs can be delayed or dropped under load, and the provider can change its service terms. Therefore this is a best-effort five-minute monitor, not a guaranteed real-time service or a promise of perpetual free hosting. The workflow must never upgrade the repository to paid usage.

## Page Behavior

- Add a balance section below the existing calculator.
- Require a history password before decrypting or displaying any balance values.
- Show the most recent account equity, its change from the previous equity sample, and the sample timestamp.
- Provide the seven approved time ranges as a compact segmented control. Plot actual sampled values without interpolation; identify hourly and daily resolutions for long ranges. Use a responsive canvas chart with time and USDT axes and a point tooltip.
- Keep the entered password in page memory only. Reloading requires entering it again.
- Poll the encrypted latest-sample file every 30 seconds while the page is open. A new point normally arrives every five minutes.
- Mark the latest value as delayed when its timestamp is older than 15 minutes. Never synthesize a balance for a missing sample.
- Handle an unconfigured history branch, wrong password, modified ciphertext, fetch errors, and stale samples with clear states. The collector validates required Actions Secrets before the Binance request and reports configuration or request failures without logging secret values. A failed Binance request or encryption step must not publish a new sample.

## Testing and Deployment

- Unit-test the existing position calculator without changing its behavior.
- Test Binance account response parsing with fixtures, including wallet balance plus signed unrealized profit and malformed values.
- Test AES-GCM encrypt/decrypt compatibility between Node.js and Web Crypto, incorrect passwords, and tampered records.
- Test UTC hourly/daily rollups, the 30-day/365-day/1,825-day retention boundaries, and range filtering with hand-derived samples.
- Keep the collector's Actions Secrets out of pull-request test jobs. The schedule/collector job runs only from the default branch; the history update receives only repository `contents: write` permission needed to update its data branch.
- Keep GitHub Pages deployment separate from collection so each balance sample does not redeploy the static site.
- Document the Binance key permissions and the three GitHub Secrets needed to activate collection. The collector cannot produce live data until the user configures those secrets.

## External References

- Binance USDⓈ-M Futures account endpoint: <https://developers.binance.com/docs/derivatives/usds-margined-futures/account/rest-api/Account-Information-V3>
- GitHub scheduled workflow limits and behavior: <https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#schedule>
- GitHub Actions billing for public-repository standard runners: <https://docs.github.com/en/billing/concepts/product-billing/github-actions>
