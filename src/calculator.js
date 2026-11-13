const LEVERAGE = 80;
const TAKER_FEE = 0.0005;
const RISK_FRACTION = 0.01;

export function calculatePosition({ capital, entryPrice, stopPrice }) {
  if (![capital, entryPrice, stopPrice].every(Number.isFinite)
    || capital <= 0
    || entryPrice <= 0
    || stopPrice <= 0
    || entryPrice === stopPrice) {
    return { error: '请输入大于 0 且有效的本金、开仓价和不同的止损价。' };
  }

  const unitLoss = Math.abs(entryPrice - stopPrice) + TAKER_FEE * (entryPrice + stopPrice);
  const riskBudget = capital * RISK_FRACTION;
  const unroundedMargin = Math.min((riskBudget / unitLoss) * entryPrice / LEVERAGE, capital);

  if (!Number.isFinite(unroundedMargin) || unroundedMargin > Number.MAX_VALUE / 100) {
    return { error: '输入数值范围过大，无法安全计算。' };
  }

  const margin = Math.floor(unroundedMargin * 100) / 100;

  if (margin < 0.01) {
    return { error: '按当前价格计算的投入金额不足 0.01 USDT。' };
  }

  const notional = margin * LEVERAGE;
  const quantity = notional / entryPrice;
  const stopLoss = quantity * unitLoss;

  return {
    margin,
    leverage: LEVERAGE,
    quantity,
    notional,
    stopLoss,
    riskPercent: stopLoss / capital * 100,
  };
}
