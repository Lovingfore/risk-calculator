import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deriveHistoryKey, encryptSample, decryptSample } from '../src/history-crypto.js';
import { buildSignedBalanceRequest, collectBalance } from '../scripts/collect-balance.js';

const API_KEY = 'fixture-api-key-123';
const API_SECRET = 'fixture-api-secret-456';
const PASSWORD = 'history-password-for-tests-000000';
const NOW = Date.parse('2026-11-15T12:34:56.789Z');
const ENV = {
  BINANCE_API_KEY: API_KEY,
  BINANCE_API_SECRET: API_SECRET,
  BALANCE_HISTORY_PASSWORD: PASSWORD,
};

async function temporaryDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), 'balance-collector-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('builds the signed USD-M balance URL and read-only API key header', () => {
  const { url, headers } = buildSignedBalanceRequest({ apiKey: API_KEY, apiSecret: API_SECRET, timestamp: NOW });
  const signedQuery = `timestamp=${NOW}`;
  const expectedSignature = createHmac('sha256', API_SECRET).update(signedQuery).digest('hex');
  assert.equal(url, `https://fapi.binance.com/fapi/v3/balance?${signedQuery}&signature=${expectedSignature}`);
  assert.deepEqual(headers, { 'X-MBX-APIKEY': API_KEY });
});

test('rejects missing required secrets before making a request', async t => {
  const historyDirectory = await temporaryDirectory(t);
  for (const name of ['BINANCE_API_KEY', 'BINANCE_API_SECRET', 'BALANCE_HISTORY_PASSWORD']) {
    let requested = false;
    await assert.rejects(collectBalance({
      env: { ...ENV, [name]: '' }, historyDirectory, now: NOW,
      fetchImpl: async () => { requested = true; throw new Error('must not request'); },
    }));
    assert.equal(requested, false, `${name} must be validated before the network request`);
  }
  assert.deepEqual(await readdir(historyDirectory), []);
});

test('fetches USDT, encrypts it, compacts prior history, and writes both data files', async t => {
  const historyDirectory = await temporaryDirectory(t);
  const key = await deriveHistoryKey(PASSWORD);
  const prior = { timestamp: '2026-11-15T12:29:00.000Z', balance: 100, resolution: 'raw' };
  const priorRecord = await encryptSample(prior, key);
  await writeFile(join(historyDirectory, 'history.jsonl'), `${JSON.stringify(priorRecord)}\n`);
  const calls = [];
  const result = await collectBalance({
    env: ENV,
    historyDirectory,
    now: NOW,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => [
        { asset: 'BTC', balance: '0.5' }, { asset: 'USDT', balance: '1234.5600' },
      ] };
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, 'GET');
  assert.deepEqual(calls[0].options.headers, { 'X-MBX-APIKEY': API_KEY });
  assert.equal(result.timestamp, new Date(NOW).toISOString());
  const historyLines = (await readFile(join(historyDirectory, 'history.jsonl'), 'utf8')).trim().split('\n');
  assert.ok(historyLines.includes(JSON.stringify(priorRecord)), 'retained samples should keep their existing encrypted record');
  const history = await Promise.all(historyLines.map(line => decryptSample(JSON.parse(line), key)));
  const latest = await decryptSample(JSON.parse(await readFile(join(historyDirectory, 'latest.json'), 'utf8')), key);
  assert.deepEqual(history, [prior, { timestamp: new Date(NOW).toISOString(), balance: 1234.56, resolution: 'raw' }]);
  assert.deepEqual(latest, history[1]);
});

test('failed Binance responses preserve both existing files and expose no sensitive values', async t => {
  const historyDirectory = await temporaryDirectory(t);
  const existingHistory = '{"version":1,"iv":"existing-history"}\n';
  const existingLatest = '{"version":1,"iv":"existing-latest"}';
  await writeFile(join(historyDirectory, 'history.jsonl'), existingHistory);
  await writeFile(join(historyDirectory, 'latest.json'), existingLatest);
  for (const fetchImpl of [
    async () => { throw new Error(`${API_KEY} ${API_SECRET} ${PASSWORD} ${NOW} 1234.56`); },
    async () => ({ ok: false, status: 401, json: async () => ({ msg: `${API_SECRET} 1234.56` }) }),
    async () => ({ ok: true, json: async () => [{ asset: 'BTC', balance: '1234.56' }] }),
  ]) {
    let failure;
    try {
      await collectBalance({ env: ENV, historyDirectory, now: NOW, fetchImpl });
    } catch (error) {
      failure = error;
    }
    assert.ok(failure, 'collection should fail');
    assert.doesNotMatch(String(failure), new RegExp(API_KEY));
    assert.doesNotMatch(String(failure), new RegExp(API_SECRET));
    assert.doesNotMatch(String(failure), new RegExp(PASSWORD));
    assert.doesNotMatch(String(failure), /1234\.56|signature=/i);
    assert.equal(await readFile(join(historyDirectory, 'history.jsonl'), 'utf8'), existingHistory);
    assert.equal(await readFile(join(historyDirectory, 'latest.json'), 'utf8'), existingLatest);
  }
});

test('reports only the Binance HTTP status and numeric error code', async t => {
  const historyDirectory = await temporaryDirectory(t);
  const responseText = `${API_KEY} ${API_SECRET} ${PASSWORD} 1234.56 signature=private`;
  await assert.rejects(collectBalance({
    env: ENV,
    historyDirectory,
    now: NOW,
    fetchImpl: async () => ({
      ok: false,
      status: 400,
      json: async () => ({ code: -2015, msg: responseText }),
    }),
  }), error => {
    assert.equal(error.message, 'Binance balance collection failed during Binance request (HTTP 400, Binance code -2015)');
    assert.doesNotMatch(error.message, new RegExp(API_KEY));
    assert.doesNotMatch(error.message, new RegExp(API_SECRET));
    assert.doesNotMatch(error.message, new RegExp(PASSWORD));
    assert.doesNotMatch(error.message, /1234\.56|signature=private/);
    return true;
  });
});

test('refuses to replace encrypted files when existing history cannot be decrypted', async t => {
  const historyDirectory = await temporaryDirectory(t);
  const existingHistory = '{"version":1,"iv":"not-a-record","ciphertext":"bad"}\n';
  const existingLatest = '{"version":1,"iv":"keep-me","ciphertext":"keep-me"}';
  await writeFile(join(historyDirectory, 'history.jsonl'), existingHistory);
  await writeFile(join(historyDirectory, 'latest.json'), existingLatest);
  await assert.rejects(collectBalance({
    env: ENV, historyDirectory, now: NOW,
    fetchImpl: async () => ({ ok: true, json: async () => [{ asset: 'USDT', balance: '99' }] }),
  }));
  assert.equal(await readFile(join(historyDirectory, 'history.jsonl'), 'utf8'), existingHistory);
  assert.equal(await readFile(join(historyDirectory, 'latest.json'), 'utf8'), existingLatest);
});

test('keeps an unrecoverable history backup when backup restoration fails', async t => {
  const historyDirectory = await temporaryDirectory(t);
  const key = await deriveHistoryKey(PASSWORD);
  const oldSample = { timestamp: '2026-11-15T12:29:00.000Z', balance: 456.78, resolution: 'raw' };
  const oldRecord = await encryptSample(oldSample, key);
  await writeFile(join(historyDirectory, 'history.jsonl'), `${JSON.stringify(oldRecord)}\n`);
  await writeFile(join(historyDirectory, 'latest.json'), JSON.stringify(oldRecord));
  let failedLatestInstall = false;
  let failedHistoryRestore = false;
  const fileOps = {
    writeFile,
    rm,
    rename: async (from, to) => {
      if (!failedLatestInstall && from.endsWith('.tmp') && to.endsWith('latest.json')) {
        failedLatestInstall = true;
        throw new Error(`${API_SECRET} storage failure`);
      }
      if (failedLatestInstall && !failedHistoryRestore
        && from.endsWith('.bak') && to.endsWith('history.jsonl')) {
        failedHistoryRestore = true;
        throw new Error(`${PASSWORD} restore failure`);
      }
      return rename(from, to);
    },
  };

  await assert.rejects(collectBalance({
    env: ENV,
    historyDirectory,
    now: NOW,
    fileOps,
    fetchImpl: async () => ({ ok: true, json: async () => [{ asset: 'USDT', balance: '789.01' }] }),
  }), error => {
    assert.match(error.message, /^Binance balance collection failed during /);
    assert.doesNotMatch(error.message, new RegExp(API_SECRET));
    assert.doesNotMatch(error.message, new RegExp(PASSWORD));
    return true;
  });
  assert.equal(failedLatestInstall, true);
  assert.equal(failedHistoryRestore, true);

  const names = await readdir(historyDirectory);
  const historyBackup = names.find(name => name.startsWith('.history.jsonl.') && name.endsWith('.bak'));
  assert.ok(historyBackup, 'the original history backup should remain on disk');
  const backedUpSamples = (await readFile(join(historyDirectory, historyBackup), 'utf8'))
    .trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(await Promise.all(backedUpSamples.map(record => decryptSample(record, key))), [oldSample]);
});
