import { createHmac, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compactHistory, parseUsdMBalance } from '../src/balance-history.js';
import { deriveHistoryKey, decryptSample, encryptSample } from '../src/history-crypto.js';

const API_URL = 'https://fapi.binance.com/fapi/v3/balance';
const defaultFileOps = { writeFile, rename, rm };

export function buildSignedBalanceRequest({ apiKey, apiSecret, timestamp }) {
  if (typeof apiKey !== 'string' || apiKey.length === 0
    || typeof apiSecret !== 'string' || apiSecret.length === 0
    || !Number.isFinite(Number(timestamp))) {
    throw new Error('Invalid Binance request configuration');
  }
  const query = new URLSearchParams({ timestamp: String(timestamp) }).toString();
  const signature = createHmac('sha256', apiSecret).update(query).digest('hex');
  return {
    url: `${API_URL}?${query}&signature=${signature}`,
    headers: { 'X-MBX-APIKEY': apiKey },
  };
}

function validateEnvironment(env) {
  const apiKey = env?.BINANCE_API_KEY;
  const apiSecret = env?.BINANCE_API_SECRET;
  const password = env?.BALANCE_HISTORY_PASSWORD;
  if (typeof apiKey !== 'string' || apiKey.trim() === '') throw new Error('Missing required environment variable: BINANCE_API_KEY');
  if (typeof apiSecret !== 'string' || apiSecret.trim() === '') throw new Error('Missing required environment variable: BINANCE_API_SECRET');
  if (typeof password !== 'string' || password.length < 32) throw new Error('BALANCE_HISTORY_PASSWORD must be at least 32 characters');
  return { apiKey, apiSecret, password };
}

async function readHistory(path, key) {
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  const records = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      throw new Error('Invalid encrypted history');
    }
    records.push(await decryptSample(record, key));
  }
  return records;
}

async function replaceFiles(directory, files, fileOps) {
  const id = randomUUID();
  const staged = files.map(([name]) => resolve(directory, `.${name}.${id}.tmp`));
  const backups = files.map(([name]) => resolve(directory, `.${name}.${id}.bak`));
  const destinations = files.map(([name]) => resolve(directory, name));
  const backedUp = [];
  const installed = [];
  const preserveBackups = new Set();
  try {
    await Promise.all(files.map(([, contents], index) => fileOps.writeFile(staged[index], contents, { encoding: 'utf8', flag: 'wx' })));
    for (let index = 0; index < files.length; index += 1) {
      try {
        await fileOps.rename(destinations[index], backups[index]);
        backedUp[index] = true;
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
        backedUp[index] = false;
      }
    }
    for (let index = 0; index < files.length; index += 1) {
      await fileOps.rename(staged[index], destinations[index]);
      installed[index] = true;
    }
  } catch (error) {
    for (let index = 0; index < destinations.length; index += 1) {
      if (installed[index]) await fileOps.rm(destinations[index], { force: true }).catch(() => {});
      if (backedUp[index]) {
        try {
          await fileOps.rename(backups[index], destinations[index]);
        } catch {
          preserveBackups.add(backups[index]);
        }
      }
    }
    throw error;
  } finally {
    const cleanup = [...staged, ...backups.filter(path => !preserveBackups.has(path))];
    await Promise.all(cleanup.map(path => fileOps.rm(path, { force: true }).catch(() => {})));
  }
}

export async function collectBalance({ env, historyDirectory, fetchImpl = globalThis.fetch, now = Date.now(), fileOps = defaultFileOps }) {
  const { apiKey, apiSecret, password } = validateEnvironment(env);
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required');
  if (typeof historyDirectory !== 'string' || historyDirectory.length === 0) throw new Error('A history directory is required');
  if (!Number.isFinite(now) || !Number.isFinite(new Date(now).getTime())) throw new Error('Invalid collection timestamp');

  try {
    const key = await deriveHistoryKey(password);
    const request = buildSignedBalanceRequest({ apiKey, apiSecret, timestamp: now });
    const response = await fetchImpl(request.url, { method: 'GET', headers: request.headers });
    if (!response?.ok) throw new Error('Binance request failed');
    const balance = parseUsdMBalance(await response.json());
    const sample = { timestamp: new Date(now).toISOString(), balance, resolution: 'raw' };
    const historyPath = resolve(historyDirectory, 'history.jsonl');
    const existing = await readHistory(historyPath, key);
    const compacted = compactHistory([...existing, sample], now);
    const [records, latest] = await Promise.all([
      Promise.all(compacted.map(item => encryptSample(item, key))),
      encryptSample(sample, key),
    ]);
    const historyText = records.map(record => JSON.stringify(record)).join('\n') + (records.length ? '\n' : '');
    await mkdir(historyDirectory, { recursive: true });
    await replaceFiles(historyDirectory, [
      ['history.jsonl', historyText],
      ['latest.json', JSON.stringify(latest)],
    ], fileOps);
    return sample;
  } catch {
    throw new Error('Binance balance collection failed');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await collectBalance({ env: process.env, historyDirectory: process.cwd() });
    process.stdout.write('Balance history updated.\n');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
