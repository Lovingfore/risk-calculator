#!/usr/bin/env bash
set -euo pipefail

: "${CLASH_SUBSCRIPTION_URL:?CLASH_SUBSCRIPTION_URL is required}"

work="$RUNNER_TEMP/binance-mihomo"
mkdir -p "$work/providers"
mihomo_secret="$(openssl rand -hex 24)"

MIHOMO_HOME="$work" MIHOMO_SECRET="$mihomo_secret" node --input-type=module <<'NODE'
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const subscription = new URL(process.env.CLASH_SUBSCRIPTION_URL);
if (subscription.protocol !== 'https:') {
  throw new Error('The Clash subscription must use HTTPS');
}

const config = `mixed-port: 7890
allow-lan: false
bind-address: 127.0.0.1
mode: rule
log-level: error
external-controller: 127.0.0.1:9090
secret: ${JSON.stringify(process.env.MIHOMO_SECRET)}
proxy-providers:
  clash-subscription:
    type: http
    url: ${JSON.stringify(subscription.href)}
    path: ./providers/subscription.yaml
    interval: 3600
    format: yaml
    header:
      User-Agent:
        - mihomo/1.19.34
    health-check:
      enable: false
      interval: 600
      url: https://www.gstatic.com/generate_204
proxy-groups:
  - name: BINANCE_TEST
    type: select
    use:
      - clash-subscription
rules:
  - MATCH,BINANCE_TEST
`;

await writeFile(join(process.env.MIHOMO_HOME, 'config.yaml'), config, { mode: 0o600 });
NODE

archive="$work/mihomo.gz"
binary="$work/mihomo"
curl --fail --silent --show-error --location --retry 2 \
  https://github.com/MetaCubeX/mihomo/releases/download/v1.19.34/mihomo-linux-amd64-v1.19.34.gz \
  --output "$archive"
printf '%s  %s\n' \
  223fab877e5795ce780ba39902e5f0b1113c1256ae244a7160f1165e017e9ccc \
  "$archive" | sha256sum --check --status
gzip --decompress --stdout "$archive" > "$binary"
chmod 700 "$binary"

"$binary" -d "$work" -f "$work/config.yaml" > "$work/mihomo.log" 2>&1 &
export MIHOMO_SECRET="$mihomo_secret"

MIHOMO_READY=false
for attempt in $(seq 1 60); do
  if curl --fail --silent \
    --header "Authorization: Bearer $MIHOMO_SECRET" \
    http://127.0.0.1:9090/proxies/BINANCE_TEST \
    --output /dev/null; then
    MIHOMO_READY=true
    break
  fi
  sleep 1
done
if [[ "$MIHOMO_READY" != true ]]; then
  echo "::error::Mihomo did not load the subscription provider."
  exit 1
fi

NODE_USE_ENV_PROXY=1 \
HTTPS_PROXY=http://127.0.0.1:7890 \
HTTP_PROXY=http://127.0.0.1:7890 \
NO_PROXY=127.0.0.1,localhost \
node --input-type=module <<'NODE'
const groupUrl = 'http://127.0.0.1:9090/proxies/BINANCE_TEST';
const providerUrl = 'http://127.0.0.1:9090/providers/proxies/clash-subscription';
const headers = { Authorization: `Bearer ${process.env.MIHOMO_SECRET}` };
const japanPattern = /日本|Japan|\bJP\b|Tokyo|Osaka|🇯🇵/iu;
let providerNodes = [];

for (let attempt = 0; attempt < 60; attempt += 1) {
  try {
    const response = await fetch(providerUrl, { headers });
    if (response.ok) {
      const provider = await response.json();
      if (Array.isArray(provider.proxies)) providerNodes = provider.proxies;
      if (providerNodes.length > 0) break;
    }
  } catch {}
  await new Promise(resolve => setTimeout(resolve, 1000));
}

const japanNodes = providerNodes
  .map(proxy => proxy?.name)
  .filter(name => typeof name === 'string' && japanPattern.test(name));
console.log(`SUBSCRIPTION_NODE_COUNT=${providerNodes.length}`);
console.log(`JAPAN_NODE_COUNT=${japanNodes.length}`);
if (japanNodes.length === 0) throw new Error('No Japan-labeled nodes were found in the subscription');

const limit = Math.min(japanNodes.length, 20);
let selectedNode = null;
for (let index = 0; index < limit; index += 1) {
  const nodeName = japanNodes[index];
  const selected = await fetch(groupUrl, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nodeName }),
  });
  if (!selected.ok) {
    console.log(`JAPAN_NODE_${index + 1}_SELECT_HTTP=${selected.status}`);
    continue;
  }

  let status = 'NETWORK_ERROR';
  try {
    const ping = await fetch('https://fapi.binance.com/fapi/v1/ping', {
      signal: AbortSignal.timeout(12000),
    });
    status = String(ping.status);
    await ping.body?.cancel();
  } catch {}

  console.log(`JAPAN_NODE_${index + 1}_HTTP=${status}`);
  if (status === '200') {
    selectedNode = nodeName;
    break;
  }
}

if (!selectedNode) throw new Error('No tested Japan-labeled node returned HTTP 200 from Binance');
console.log(`JAPAN_NODE_SELECTED=${selectedNode}`);
console.log('BINANCE_FAPI_HTTP=200');
NODE
