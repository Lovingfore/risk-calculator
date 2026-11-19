#!/usr/bin/env bash
set -euo pipefail

readonly interval_seconds="${COLLECTION_INTERVAL_SECONDS:-300}"
readonly push_retry_delay_seconds="${PUSH_RETRY_DELAY_SECONDS:-5}"
readonly max_cycles=68
readonly workspace="${GITHUB_WORKSPACE:?}"
readonly history_directory="${RUNNER_TEMP:?}/risk-calculator-balance"
readonly collector_script="${RUNNER_TEMP}/risk-calculator-collector/scripts/collect-balance.js"

if [[ "$GITHUB_EVENT_NAME" == "schedule" ]]; then
  cycles=$max_cycles
elif [[ "${CONTINUE_LOOP:-false}" == "true" ]]; then
  cycles="${COLLECTION_CYCLES:-$max_cycles}"
else
  cycles=1
fi

if [[ ! "$cycles" =~ ^[0-9]+$ ]] || (( cycles < 1 || cycles > max_cycles )); then
  echo "::error::Collection cycles must be between 1 and $max_cycles."
  exit 1
fi

if [[ ! "$interval_seconds" =~ ^[0-9]+$ ]]; then
  echo "::error::Collection interval must be a non-negative integer."
  exit 1
fi

if [[ ! "$push_retry_delay_seconds" =~ ^[0-9]+$ ]]; then
  echo "::error::Push retry delay must be a non-negative integer."
  exit 1
fi

if [[ "${HISTORY_BRANCH_EXISTS:-false}" == "true" ]]; then
  git -C "$workspace" switch --force-create balance-history FETCH_HEAD
else
  git -C "$workspace" switch --orphan balance-history
  git -C "$workspace" rm -rf --ignore-unmatch .
fi

git -C "$workspace" config user.name "github-actions[bot]"
git -C "$workspace" config user.email "41898282+github-actions[bot]@users.noreply.github.com"

publish_history() {
  for attempt in 1 2 3; do
    # Only Binance requests need the proxy. Publish directly to GitHub, with a
    # deadline so a stalled connection cannot consume the rest of the batch.
    if timeout 60s git -C "$workspace" -c http.proxy= push origin HEAD:balance-history; then
      return 0
    fi
    echo "::warning::History push attempt $attempt/3 failed."
    if (( attempt < 3 && push_retry_delay_seconds > 0 )); then sleep "$push_retry_delay_seconds"; fi
  done
  return 1
}

published_samples=0
pending_samples=0
for ((cycle = 1; cycle <= cycles; cycle += 1)); do
  cycle_started=$(date +%s)
  if (cd "$history_directory" && node "$collector_script"); then
    cp "$history_directory/history.jsonl" "$workspace/history.jsonl"
    cp "$history_directory/latest.json" "$workspace/latest.json"
    git -C "$workspace" add -- history.jsonl latest.json
    if ! git -C "$workspace" diff --cached --quiet; then
      git -C "$workspace" commit -m "Update encrypted balance history"
    fi
    pending_samples=$((pending_samples + 1))
    echo "Balance sample $cycle/$cycles collected."
  else
    echo "::warning::Balance sample $cycle/$cycles failed; the collector will retry in five minutes."
  fi

  # Retry pending commits even when the next Binance request fails. New samples
  # append to the same local history until the complete backlog is published.
  if (( pending_samples > 0 )); then
    if publish_history; then
      published_samples=$((published_samples + pending_samples))
      echo "Published $pending_samples pending balance sample(s)."
      pending_samples=0
    else
      echo "::warning::Encrypted samples retained locally; publishing will retry next cycle."
    fi
  fi

  if (( cycle < cycles )); then
    elapsed=$(( $(date +%s) - cycle_started ))
    sleep_seconds=$((interval_seconds - elapsed))
    if (( sleep_seconds > 0 )); then sleep "$sleep_seconds"; fi
  fi
done

if (( pending_samples > 0 )); then
  if publish_history; then
    published_samples=$((published_samples + pending_samples))
    pending_samples=0
  else
    echo "::error::Encrypted samples could not be published; preserve the batch backup."
    exit 1
  fi
fi

if (( published_samples == 0 )); then
  echo "::error::No balance samples were published in this collector batch."
  exit 1
fi
