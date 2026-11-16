import { deriveHistoryKey, decryptSample } from './history-crypto.js';
import { DEFAULT_HISTORY_RANGE, filterHistory, getLatestSample } from './balance-history.js';
import { drawBalanceChart } from './balance-chart.js';
import {
  createBalanceTargets,
  getCompletedTargetCount,
  getTargetPage,
  getTargetPageForBalance,
  TARGET_PAGE_SIZE,
} from './balance-targets.js';

const BASE_URL = 'https://raw.githubusercontent.com/Lovingfore/risk-calculator/balance-history/';
const HISTORY_URL = `${BASE_URL}history.jsonl`;
const LATEST_URL = `${BASE_URL}latest.json`;
const POLL_MS = 30_000;
const STALE_MS = 15 * 60_000;
const form = document.querySelector('#history-unlock');
const passwordInput = document.querySelector('#history-password');
const status = document.querySelector('#history-status');
const canvas = document.querySelector('#balance-chart');
const tooltip = document.querySelector('#chart-tooltip');
const summary = document.querySelector('#balance-summary');
const rangeButtons = [...document.querySelectorAll('[data-range]')];
const balanceDashboard = document.querySelector('#balance-dashboard');
const targetsPanel = document.querySelector('#balance-targets');
const targetRows = document.querySelector('#target-rows');
const targetProgress = document.querySelector('#targets-progress');
const targetPageLabel = document.querySelector('#target-page');
const previousTargetPage = document.querySelector('#target-previous');
const nextTargetPage = document.querySelector('#target-next');
const balanceTargets = createBalanceTargets();
const fmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let samples = [];
let key = null;
let range = DEFAULT_HISTORY_RANGE;
let latestTimestamp = null;
let pollTimer = null;
let chartState = null;
let targetPage = 1;

function setStatus(message, kind = '') {
  status.textContent = message;
  status.classList.toggle('is-error', kind === 'error');
  status.classList.toggle('is-warning', kind === 'warning');
}

function draw() {
  if (!canvas) return;
  chartState = drawBalanceChart(filterHistory(samples, range, Date.now()), range, canvas.getContext('2d'), {
    hasHistory: samples.length > 0,
  });
  tooltip.hidden = true;
}

function updateSummary() {
  const { current, delta } = getLatestSample(samples);
  summary.hidden = !current;
  if (!current) return;
  document.querySelector('#balance-value').textContent = fmt.format(current.balance);
  const deltaElement = document.querySelector('#balance-delta');
  deltaElement.textContent = delta === null ? '暂无相邻采样' : `${delta > 0 ? '+' : ''}${fmt.format(delta)} USDT`;
  deltaElement.classList.toggle('is-positive', delta > 0);
  deltaElement.classList.toggle('is-negative', delta < 0);
  const time = document.querySelector('#balance-time');
  time.dateTime = current.timestamp;
  time.textContent = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(current.timestamp));
  latestTimestamp = current.timestamp;
  checkStale();
}

function clearTargets() {
  targetPage = 1;
  if (targetRows) targetRows.replaceChildren();
  if (targetsPanel) targetsPanel.hidden = true;
  balanceDashboard?.classList.remove('has-targets');
}

function renderTargets() {
  if (!targetsPanel || !targetRows) return;
  const { current } = getLatestSample(samples);
  if (!current) {
    clearTargets();
    return;
  }

  const completedCount = getCompletedTargetCount(current.balance);
  const totalPages = Math.ceil(balanceTargets.length / TARGET_PAGE_SIZE);
  const visibleTargets = getTargetPage(balanceTargets, targetPage, TARGET_PAGE_SIZE);
  targetRows.replaceChildren(...visibleTargets.map(target => {
    const row = document.createElement('tr');
    const completed = target.number <= completedCount;
    row.classList.toggle('is-complete', completed);
    row.setAttribute('aria-label', `第 ${target.number} 行${completed ? '，已完成' : ''}`);
    for (const value of [target.number, fmt.format(target.principal), fmt.format(target.afterGrowth)]) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    }
    return row;
  }));
  targetProgress.textContent = `已完成 ${completedCount} / ${balanceTargets.length}`;
  targetPageLabel.textContent = `${targetPage} / ${totalPages}`;
  previousTargetPage.disabled = targetPage <= 1;
  nextTargetPage.disabled = targetPage >= totalPages;
  targetsPanel.hidden = false;
  balanceDashboard?.classList.add('has-targets');
}

function checkStale() {
  if (!latestTimestamp) return;
  const age = Date.now() - Date.parse(latestTimestamp);
  if (age > STALE_MS) setStatus('最新采样已超过 15 分钟，数据可能已过期。', 'warning');
  else setStatus(`余额历史已解锁 · 最近更新 ${Math.max(0, Math.floor(age / 60_000))} 分钟前`);
}

async function readJson(url, cacheBust = false) {
  const requestUrl = cacheBust ? `${url}?t=${Date.now()}` : url;
  const response = await fetch(requestUrl, { cache: 'no-store' });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('远端加密记录暂时无法读取。');
  return response.json();
}

async function loadHistory(derivedKey) {
  const [text, latestRecord] = await Promise.all([
    fetch(HISTORY_URL, { cache: 'no-store' }).then(response => {
      if (response.status === 404) return null;
      if (!response.ok) throw new Error('远端加密记录暂时无法读取。');
      return response.text();
    }),
    readJson(LATEST_URL, true),
  ]);
  if (text === null && latestRecord === null) return { configured: false, samples: [] };
  if (text === null || latestRecord === null) throw new Error('余额历史文件不完整，暂时无法加载。');
  const records = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { records.push(await decryptSample(JSON.parse(line), derivedKey)); }
    catch { throw new Error('密码不正确或历史记录已损坏。'); }
  }
  let latest;
  try { latest = await decryptSample(latestRecord, derivedKey); }
  catch { throw new Error('密码不正确或最新记录已损坏。'); }
  const merged = new Map(records.map(sample => [sample.timestamp, sample]));
  merged.set(latest.timestamp, latest);
  return { configured: true, samples: [...merged.values()].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)) };
}

async function refreshLatest() {
  if (!key) return;
  try {
    const record = await readJson(LATEST_URL, true);
    if (!record) {
      if (latestTimestamp && Date.now() - Date.parse(latestTimestamp) > STALE_MS) {
        setStatus('最新采样已超过 15 分钟，数据可能已过期。', 'warning');
      } else {
        setStatus('最新余额暂时不可用，将在下一轮重试。', 'error');
      }
      return;
    }
    const latest = await decryptSample(record, key);
    const index = samples.findIndex(sample => sample.timestamp === latest.timestamp);
    if (index < 0) samples.push(latest); else samples[index] = latest;
    samples.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    updateSummary(); renderTargets(); draw();
  } catch {
    if (latestTimestamp && Date.now() - Date.parse(latestTimestamp) > STALE_MS) {
      setStatus('最新采样已超过 15 分钟，数据可能已过期。', 'warning');
    } else {
      setStatus('最新余额刷新失败，将在下一轮重试。', 'error');
    }
  }
}

async function deriveKeyFromInput() {
  let password = passwordInput.value;
  passwordInput.value = '';
  try {
    return await deriveHistoryKey(password);
  } finally {
    password = '';
  }
}

form?.addEventListener('submit', async event => {
  event.preventDefault();
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  key = null;
  samples = [];
  clearTargets();
  summary.hidden = true;
  draw();
  setStatus('正在解锁并读取加密历史…');
  form.querySelector('button').disabled = true;
  try {
    const derivedKey = await deriveKeyFromInput();
    const result = await loadHistory(derivedKey);
    if (!result.configured) {
      key = null; samples = []; summary.hidden = true; draw();
      clearTargets();
      setStatus('余额历史尚未配置，等待加密记录发布。', 'warning');
      return;
    }
    key = derivedKey; samples = result.samples;
    const { current } = getLatestSample(samples);
    if (current) targetPage = getTargetPageForBalance(current.balance);
    updateSummary(); renderTargets(); draw();
    pollTimer = window.setInterval(refreshLatest, POLL_MS);
    checkStale();
  } catch (error) {
    key = null; samples = []; summary.hidden = true; draw();
    clearTargets();
    setStatus(error.message || '无法解锁余额历史。', 'error');
  } finally {
    form.querySelector('button').disabled = false;
  }
});

rangeButtons.forEach(button => button.addEventListener('click', () => {
  range = button.dataset.range;
  rangeButtons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  draw();
}));

previousTargetPage?.addEventListener('click', () => {
  if (targetPage <= 1) return;
  targetPage -= 1;
  renderTargets();
});

nextTargetPage?.addEventListener('click', () => {
  if (targetPage >= Math.ceil(balanceTargets.length / TARGET_PAGE_SIZE)) return;
  targetPage += 1;
  renderTargets();
});

function showTooltip(event) {
  if (!chartState?.points.length) return;
  const rect = canvas.getBoundingClientRect();
  const px = event.clientX - rect.left;
  const point = chartState.points.reduce((best, item) => Math.abs(chartState.x(Date.parse(item.timestamp)) - px)
    < Math.abs(chartState.x(Date.parse(best.timestamp)) - px) ? item : best);
  tooltip.textContent = `${new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(point.timestamp))} · ${fmt.format(point.balance)} USDT · ${point.resolution === 'hourly' ? '按小时' : point.resolution === 'daily' ? '按日' : '原始采样'}`;
  tooltip.hidden = false;
  const left = Math.min(Math.max(4, px + 12), rect.width - Math.min(tooltip.offsetWidth, rect.width) - 4);
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${Math.max(4, Math.min(event.clientY - rect.top - 38, rect.height - 42))}px`;
}

canvas?.addEventListener('pointermove', showTooltip);
canvas?.addEventListener('pointerleave', () => { tooltip.hidden = true; });
let resizeFrame;
window.addEventListener('resize', () => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(draw);
});
window.addEventListener('beforeunload', () => {
  key = null; samples = [];
  if (pollTimer) clearInterval(pollTimer);
});

draw();
