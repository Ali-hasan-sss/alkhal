import type { OverheadAllocationMethod } from '@alkhal/types';
import { d, Decimal, isZero, roundMoney, type DecimalInput } from './money';

export interface AllocationShare {
  key: string;
  revenue?: DecimalInput;
  quantity?: DecimalInput;
  directCost?: DecimalInput;
}

export function allocateOverhead(
  totalOverhead: DecimalInput,
  method: OverheadAllocationMethod,
  shares: AllocationShare[],
): Map<string, Decimal> {
  const result = new Map<string, Decimal>();
  const overhead = d(totalOverhead);

  if (shares.length === 0 || overhead.isZero()) {
    for (const share of shares) {
      result.set(share.key, roundMoney(0));
    }
    return result;
  }

  const weights = shares.map((share) => {
    switch (method) {
      case 'BY_REVENUE':
        return d(share.revenue ?? 0);
      case 'BY_SALES_QUANTITY':
        return d(share.quantity ?? 0);
      case 'BY_DIRECT_COST':
        return d(share.directCost ?? 0);
      default: {
        const _exhaustive: never = method;
        return _exhaustive;
      }
    }
  });

  const totalWeight = weights.reduce((acc, w) => acc.plus(w), d(0));
  if (totalWeight.isZero()) {
    const even = roundMoney(overhead.dividedBy(shares.length));
    for (const share of shares) {
      result.set(share.key, even);
    }
    return result;
  }

  let allocated = d(0);
  shares.forEach((share, index) => {
    const isLast = index === shares.length - 1;
    if (isLast) {
      result.set(share.key, roundMoney(overhead.minus(allocated)));
      return;
    }
    const amount = roundMoney(overhead.times(weights[index]!).dividedBy(totalWeight));
    allocated = allocated.plus(amount);
    result.set(share.key, amount);
  });

  return result;
}

export { isZero };
