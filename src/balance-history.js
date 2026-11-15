const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const FIVE_MINUTES = 5 * 60 * 1000;
const THIRTY_DAYS = 30 * DAY;
const YEAR = 365 * DAY;
const FIVE_YEARS = 1825 * DAY;
export const DEFAULT_HISTORY_RANGE = '24h';
const ranges = new Map([
  ['1h', HOUR], ['24h', DAY], ['7d', 7 * DAY], ['30d', THIRTY_DAYS],
  ['180d', 180 * DAY], ['1y', YEAR], ['3y', 3 * YEAR], ['5y', FIVE_YEARS],
]);

function isValidSample(sample) {
  if (!sample || typeof sample !== 'object' || Array.isArray(sample)) return false;
  const { timestamp, balance, resolution } = sample;
  return typeof timestamp === 'string'
    && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(timestamp)
    && Number.isFinite(Date.parse(timestamp))
    && new Date(timestamp).toISOString() === timestamp
    && typeof balance === 'number'
    && Number.isFinite(balance)
    && balance >= 0
    && ['raw', 'hourly', 'daily'].includes(resolution);
}

export function parseUsdMBalance(payload) {
  if (!Array.isArray(payload)) throw new Error('Invalid Binance balance response');
  const wallets = payload.filter(item => item && item.asset === 'USDT');
  if (wallets.length !== 1) throw new Error('USDT balance is missing or ambiguous');
  const value = wallets[0].balance;
  if (!(typeof value === 'string' && /^(?:\d+\.?\d*|\.\d+)$/.test(value))
    && typeof value !== 'number') throw new Error('Invalid USDT balance');
  const balance = Number(value);
  if (!Number.isFinite(balance) || balance < 0) throw new Error('Invalid USDT balance');
  return balance;
}

export function compactHistory(samples, now) {
  if (!Array.isArray(samples) || !Number.isFinite(now)) throw new Error('Invalid history input');
  const hourly = new Map();
  const daily = new Map();
  const raw = new Map();
  for (const sample of samples) {
    if (!isValidSample(sample)) continue;
    const time = Date.parse(sample.timestamp);
    const age = now - time;
    if (age < 0 || age > FIVE_YEARS) continue;
    if (age <= THIRTY_DAYS) {
      const bucket = Math.floor(time / FIVE_MINUTES);
      const prior = raw.get(bucket);
      if (!prior || time > Date.parse(prior.timestamp)) raw.set(bucket, { timestamp: sample.timestamp, balance: sample.balance, resolution: 'raw' });
    } else if (age <= YEAR) {
      const bucket = Math.floor(time / HOUR);
      const prior = hourly.get(bucket);
      if (!prior || time > Date.parse(prior.timestamp)) hourly.set(bucket, { timestamp: sample.timestamp, balance: sample.balance, resolution: 'hourly' });
    } else {
      const date = new Date(time);
      const bucket = `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`;
      const prior = daily.get(bucket);
      if (!prior || time > Date.parse(prior.timestamp)) daily.set(bucket, { timestamp: sample.timestamp, balance: sample.balance, resolution: 'daily' });
    }
  }
  return [...raw.values(), ...hourly.values(), ...daily.values()].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

export function filterHistory(samples, range, now) {
  const duration = ranges.get(range);
  if (!duration) throw new Error('Unsupported history range');
  if (!Array.isArray(samples) || !Number.isFinite(now)) throw new Error('Invalid history input');
  const cutoff = now - duration;
  return samples.filter(sample => isValidSample(sample)
    && Date.parse(sample.timestamp) >= cutoff
    && Date.parse(sample.timestamp) <= now)
    .map(({ timestamp, balance, resolution }) => ({ timestamp, balance, resolution }));
}

export function getLatestSample(samples) {
  if (!Array.isArray(samples)) throw new Error('Invalid history input');
  const ordered = samples.filter(isValidSample)
    .sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
  const current = ordered.at(-1) ?? null;
  const previous = ordered.at(-2) ?? null;
  return {
    current,
    previous,
    delta: current && previous ? current.balance - previous.balance : null,
  };
}
