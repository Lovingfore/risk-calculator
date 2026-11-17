const RANGE_MS = new Map([
  ['24h', 24 * 60 * 60 * 1000], ['7d', 7 * 24 * 60 * 60 * 1000],
  ['30d', 30 * 24 * 60 * 60 * 1000], ['180d', 180 * 24 * 60 * 60 * 1000],
  ['1y', 365 * 24 * 60 * 60 * 1000], ['3y', 3 * 365 * 24 * 60 * 60 * 1000], ['5y', 5 * 365 * 24 * 60 * 60 * 1000],
]);

const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

export function drawBalanceChart(samples, range, context, options = {}) {
  const duration = RANGE_MS.get(range);
  if (!duration) throw new Error('Unsupported history range');
  const canvas = context.canvas;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const ratio = Math.max(1, globalThis.devicePixelRatio || 1);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.font = '11px Inter, "Noto Sans SC", sans-serif';
  context.lineWidth = 1;

  const mobile = width < 520;
  const plot = { left: mobile ? 48 : 58, right: 12, top: 15, bottom: 31 };
  plot.width = Math.max(1, width - plot.left - plot.right);
  plot.height = Math.max(1, height - plot.top - plot.bottom);
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const start = now - duration;
  const points = samples.filter(sample => Number.isFinite(Date.parse(sample.timestamp))
    && Number.isFinite(sample.balance) && Date.parse(sample.timestamp) >= start && Date.parse(sample.timestamp) <= now);
  const values = points.map(point => point.balance);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const pad = values.length ? Math.max((max - min) * 0.12, max * 0.001, 1) : 1;
  const low = Math.max(0, min - pad);
  const high = max + pad;
  const x = timestamp => plot.left + ((timestamp - start) / duration) * plot.width;
  const y = balance => plot.top + ((high - balance) / (high - low)) * plot.height;
  const colors = getComputedStyle(canvas);
  context.strokeStyle = colors.getPropertyValue('--chart-grid').trim() || '#e5eae6';
  context.fillStyle = colors.getPropertyValue('--muted').trim() || '#6c7972';
  context.textBaseline = 'middle';
  context.save();
  context.translate(10, plot.top + plot.height / 2);
  context.rotate(-Math.PI / 2);
  context.textAlign = 'center';
  context.fillText('USDT', 0, 0);
  context.restore();
  const formatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  for (let row = 0; row <= 3; row += 1) {
    const py = plot.top + (plot.height * row) / 3;
    const value = high - ((high - low) * row) / 3;
    context.beginPath(); context.moveTo(plot.left, py); context.lineTo(width - plot.right, py); context.stroke();
    context.textAlign = 'right'; context.fillText(formatter.format(value), plot.left - 8, py);
  }
  const ticks = width < 420 ? 2 : 4;
  for (let tick = 0; tick <= ticks; tick += 1) {
    const time = start + (duration * tick) / ticks;
    const px = x(time);
    context.beginPath(); context.moveTo(px, plot.top); context.lineTo(px, plot.top + plot.height); context.stroke();
    context.textAlign = tick === 0 ? 'left' : tick === ticks ? 'right' : 'center';
    context.fillText(formatDate(time, range), px, height - 13);
  }
  if (!points.length) {
    context.textAlign = 'center'; context.fillStyle = '#6c7972';
    context.fillText(options.emptyMessage || (options.hasHistory ? '此时间范围暂无记录' : '解锁后显示余额记录'), width / 2, height / 2);
    return { points: [], plot, x, y };
  }
  context.beginPath();
  points.forEach((point, index) => {
    const px = x(Date.parse(point.timestamp)); const py = y(point.balance);
    if (index === 0) context.moveTo(px, py); else context.lineTo(px, py);
  });
  context.strokeStyle = '#18734c'; context.lineWidth = 2; context.lineJoin = 'round'; context.stroke();
  context.fillStyle = '#18734c';
  const last = points.at(-1);
  context.beginPath(); context.arc(x(Date.parse(last.timestamp)), y(last.balance), 3.5, 0, Math.PI * 2); context.fill();
  return { points, plot, x, y, range, formatBalance: value => numberFormat.format(value) };
}

export function formatDate(value, range) {
  const date = new Date(value);
  const options = range === '24h'
    ? { hour: '2-digit', minute: '2-digit' }
    : range === '7d' || range === '30d' ? { month: 'numeric', day: 'numeric' }
      : { year: '2-digit', month: 'numeric' };
  return new Intl.DateTimeFormat('zh-CN', options).format(date);
}
