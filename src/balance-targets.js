const STARTING_PRINCIPAL = 4000;
const GROWTH_RATE = 1.01;
const TARGET_COUNT = 630;
export const TARGET_PAGE_SIZE = 10;

export function createBalanceTargets() {
  const targets = [];
  let principal = STARTING_PRINCIPAL;

  for (let number = 1; number <= TARGET_COUNT; number += 1) {
    const afterGrowth = principal * GROWTH_RATE;
    targets.push({ number, principal, afterGrowth });
    principal = afterGrowth;
  }

  return targets;
}

const BALANCE_TARGETS = createBalanceTargets();

export function getCompletedTargetCount(balance) {
  if (!Number.isFinite(balance)) return 0;

  let low = 0;
  let high = BALANCE_TARGETS.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (BALANCE_TARGETS[middle].principal < balance) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function getTargetPageForBalance(balance) {
  if (!Number.isFinite(balance)) return 1;

  let low = 0;
  let high = BALANCE_TARGETS.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (BALANCE_TARGETS[middle].principal <= balance) low = middle + 1;
    else high = middle;
  }

  const totalPages = Math.ceil(BALANCE_TARGETS.length / TARGET_PAGE_SIZE);
  const currentRow = Math.max(1, low);
  return Math.min(Math.ceil(currentRow / TARGET_PAGE_SIZE), totalPages);
}

export function getTargetPage(targets, page, pageSize = TARGET_PAGE_SIZE) {
  const start = (page - 1) * pageSize;
  return targets.slice(start, start + pageSize);
}
