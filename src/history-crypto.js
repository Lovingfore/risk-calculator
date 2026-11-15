export const HISTORY_SALT = 'orrPBxe+IZqgiFr6LM4zFA==';

const ITERATIONS = 600_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function cryptoApi() {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto is unavailable');
  return globalThis.crypto;
}

function toBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value) {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error('Invalid encrypted record');
  }
  const binary = atob(value);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function validateSample(sample) {
  if (!sample || typeof sample !== 'object' || Array.isArray(sample)) throw new Error('Invalid sample');
  const { timestamp, balance, resolution } = sample;
  if (typeof timestamp !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(timestamp)
    || !Number.isFinite(Date.parse(timestamp)) || new Date(timestamp).toISOString() !== timestamp) {
    throw new Error('Invalid sample timestamp');
  }
  if (typeof balance !== 'number' || !Number.isFinite(balance) || balance < 0) throw new Error('Invalid sample balance');
  if (!['raw', 'hourly', 'daily'].includes(resolution)) throw new Error('Invalid sample resolution');
  return { timestamp, balance, resolution };
}

export async function deriveHistoryKey(password) {
  if (typeof password !== 'string' || password.length < 32) throw new Error('History password must be at least 32 characters');
  const api = cryptoApi();
  const material = await api.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return api.subtle.deriveKey(
    { name: 'PBKDF2', salt: fromBase64(HISTORY_SALT), iterations: ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptSample(sample, key) {
  const validSample = validateSample(sample);
  const api = cryptoApi();
  const iv = api.getRandomValues(new Uint8Array(12));
  const ciphertext = await api.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(validSample)),
  );
  return { version: 1, iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) };
}

export async function decryptSample(record, key) {
  if (!record || typeof record !== 'object' || record.version !== 1) throw new Error('Invalid encrypted record');
  const iv = fromBase64(record.iv);
  const ciphertext = fromBase64(record.ciphertext);
  if (iv.length !== 12 || ciphertext.length < 16) throw new Error('Invalid encrypted record');
  const plaintext = await cryptoApi().subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  let sample;
  try {
    sample = JSON.parse(decoder.decode(plaintext));
  } catch {
    throw new Error('Invalid encrypted sample');
  }
  return validateSample(sample);
}
