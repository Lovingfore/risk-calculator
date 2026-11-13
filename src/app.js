import { calculatePosition } from './calculator.js';

const fields = {
  capital: document.querySelector('#capital'),
  entryPrice: document.querySelector('#entry-price'),
  stopPrice: document.querySelector('#stop-price'),
};

const outputs = {
  margin: document.querySelector('#margin-result'),
  leverage: document.querySelector('#leverage-result'),
  risk: document.querySelector('#risk-result'),
  notional: document.querySelector('#notional-result'),
  loss: document.querySelector('#loss-result'),
  quantity: document.querySelector('#quantity-result'),
};

const message = document.querySelector('#form-message');
const riskBar = document.querySelector('#risk-bar');
const riskTrack = document.querySelector('.risk-track');
const amountFormat = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const quantityFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 });
const percentFormat = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 3, maximumFractionDigits: 4 });

function setEmptyResults() {
  outputs.margin.innerHTML = '— <span>USDT</span>';
  outputs.leverage.textContent = '—';
  outputs.risk.textContent = '—';
  outputs.notional.textContent = '—';
  outputs.loss.textContent = '—';
  outputs.quantity.textContent = '—';
  riskBar.style.width = '0%';
  riskTrack.setAttribute('aria-valuenow', '0');
}

function updateResults() {
  if (Object.values(fields).some((field) => field.value.trim() === '')) {
    setEmptyResults();
    message.textContent = '填写三项参数后显示计算结果。';
    message.classList.remove('is-error');
    return;
  }

  const result = calculatePosition(Object.fromEntries(
    Object.entries(fields).map(([key, field]) => [key, Number(field.value)]),
  ));

  if (result.error) {
    setEmptyResults();
    message.textContent = result.error;
    message.classList.add('is-error');
    return;
  }

  outputs.margin.innerHTML = `${amountFormat.format(result.margin)} <span>USDT</span>`;
  outputs.leverage.textContent = `${result.leverage}x`;
  outputs.risk.textContent = `${percentFormat.format(result.riskPercent)}% / 1.000%`;
  outputs.notional.textContent = `${amountFormat.format(result.notional)} USDT`;
  outputs.loss.textContent = `${amountFormat.format(result.stopLoss)} USDT`;
  outputs.quantity.textContent = quantityFormat.format(Math.floor(result.quantity * 1e8) / 1e8);
  riskBar.style.width = `${Math.min(result.riskPercent, 1) * 100}%`;
  riskTrack.setAttribute('aria-valuenow', String(Math.min(result.riskPercent, 1)));
  message.textContent = '按 80x 目标杠杆计算，理论止损风险未超过本金的 1%。';
  message.classList.remove('is-error');
}

for (const field of Object.values(fields)) {
  field.addEventListener('input', updateResults);
}

document.querySelector('#calculator-form').addEventListener('submit', (event) => event.preventDefault());
setEmptyResults();
