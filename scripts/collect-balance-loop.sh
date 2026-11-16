#!/usr/bin/env bash
set -euo pipefail

readonly interval_seconds=300
readonly max_cycles=68
readonly workspace="${GITHUB_WORKSPACE:?}"
readonly history_directory="${RUNNER_TEMP:?}/risk-calculator-balance"
readonly collector_script="${RUNNER_TEMP}/risk-calculator-collector/scripts/collect-balance.js"
readonly dispatch_script="collect-balance.yml"

if [[ "$GITHUB_EVENT_NAME" == "schedule" ]]; then
  cycles=$max_cycles
  continue_loop=true
elif [[ "${CONTINUE_LOOP:-false}" == "true" ]]; then
  cycles="${COLLECTION_CYCLES:-$max_cycles}"
  continue_loop=true
else
  cycles=1
  continue_loop=false
fi

if [[ ! "$cycles" =~ ^[0-9]+$ ]] || (( cycles < 1 || cycles > max_cycles )); then
  echo "::error::Collection cycles must be between 1 and $max_cycles."
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

successful_cycles=0
for ((cycle = 1; cycle <= cycles; cycle += 1)); do
  cycle_started=$(date +%s)
  if (cd "$history_directory" && node "$collector_script"); then
    cp "$history_directory/history.jsonl" "$workspace/history.jsonl"
    cp "$history_directory/latest.json" "$workspace/latest.json"
    git -C "$workspace" add -- history.jsonl latest.json
    if ! git -C "$workspace" diff --cached --quiet; then
      git -C "$workspace" commit -m "Update encrypted balance history"
      git -C "$workspace" push origin HEAD:balance-history
    fi
    successful_cycles=$((successful_cycles + 1))
    echo "Balance sample $cycle/$cycles published."
  else
    echo "::warning::Balance sample $cycle/$cycles failed; the collector will retry in five minutes."
  fi

  if (( cycle < cycles )); then
    elapsed=$(( $(date +%s) - cycle_started ))
    sleep_seconds=$((interval_seconds - elapsed))
    if (( sleep_seconds > 0 )); then sleep "$sleep_seconds"; fi
  fi
done

if (( successful_cycles == 0 )); then
  echo "::error::No balance samples were published in this collector batch."
  exit 1
fi

if [[ "$continue_loop" == "true" ]]; then
  curl --fail --silent --show-error -o /dev/null \
    -X POST \
    -H "Authorization: Bearer ${ACTIONS_DISPATCH_TOKEN:?}" \
    -H 'Accept: application/vnd.github+json' \
    -H 'Content-Type: application/json' \
    -H 'X-GitHub-Api-Version: 2022-11-28' \
    "${GITHUB_API_URL:?}/repos/${GITHUB_REPOSITORY:?}/actions/workflows/${dispatch_script}/dispatches" \
    -d '{"ref":"main","inputs":{"continue_loop":"true","collection_cycles":"68"}}'
  echo "Next collector batch queued."
fi
