import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveHistoryKey,
  encryptSample,
  decryptSample,
  HISTORY_SALT,
} from '../src/history-crypto.js';

const sample = { timestamp: '2026-11-15T12:34:56.000Z', balance: 1234.56, resolution: 'raw' };

test('encrypts and decrypts a sample with the correct password', async () => {
  const key = await deriveHistoryKey('a'.repeat(32));
  const record = await encryptSample(sample, key);
  assert.equal(record.version, 1);
  assert.equal(Buffer.from(record.iv, 'base64').byteLength, 12);
  assert.deepEqual(await decryptSample(record, key), sample);
});

test('rejects a sample encrypted with a different password', async () => {
  const record = await encryptSample(sample, await deriveHistoryKey('a'.repeat(32)));
  await assert.rejects(decryptSample(record, await deriveHistoryKey('b'.repeat(32))));
});

test('requires a history password of at least 32 characters', async () => {
  await assert.rejects(deriveHistoryKey('too short'), /at least 32 characters/);
});

test('rejects a modified ciphertext', async () => {
  const key = await deriveHistoryKey('a'.repeat(32));
  const record = await encryptSample(sample, key);
  const ciphertext = Buffer.from(record.ciphertext, 'base64');
  ciphertext[0] ^= 1;
  await assert.rejects(decryptSample({ ...record, ciphertext: ciphertext.toString('base64') }, key));
});

test('uses a stable public salt with enough entropy for shared derivation', async () => {
  assert.equal(typeof HISTORY_SALT, 'string');
  assert.equal(Buffer.from(HISTORY_SALT, 'base64').byteLength, 16);
  assert.deepEqual(await deriveHistoryKey('a'.repeat(32)), await deriveHistoryKey('a'.repeat(32)));
});

test('rejects invalid sample fields after authenticated decryption', async () => {
  const key = await deriveHistoryKey('a'.repeat(32));
  for (const invalid of [
    { ...sample, timestamp: 'not-a-date' },
    { ...sample, balance: -1 },
    { ...sample, balance: Infinity },
    { ...sample, resolution: 'weekly' },
  ]) {
    await assert.rejects(encryptSample(invalid, key));
  }
});

test('derives a key compatible with Node and browser Web Crypto', async () => {
  const key = await deriveHistoryKey('shared password '.repeat(2));
  const webCrypto = globalThis.crypto;
  const iv = webCrypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(sample));
  const browserCiphertext = await webCrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  const browserRecord = {
    version: 1,
    iv: Buffer.from(iv).toString('base64'),
    ciphertext: Buffer.from(browserCiphertext).toString('base64'),
  };
  assert.deepEqual(await decryptSample(browserRecord, key), sample);

  const nodeRecord = await encryptSample(sample, key);
  const nodePlaintext = await webCrypto.subtle.decrypt(
    { name: 'AES-GCM', iv: Buffer.from(nodeRecord.iv, 'base64') },
    key,
    Buffer.from(nodeRecord.ciphertext, 'base64'),
  );
  assert.deepEqual(JSON.parse(new TextDecoder().decode(nodePlaintext)), sample);
});
