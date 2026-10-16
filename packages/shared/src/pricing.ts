import type { PricingMethod } from '@alkhal/types';
import { d, Decimal, isZero, roundMoney, roundPercent, type DecimalInput } from './money';

export interface PricingInput {
  cost: DecimalInput;
  method: PricingMethod;
  fixedPrice?: DecimalInput | null;
  markupPercent?: DecimalInput | null;
  targetMarginPercent?: DecimalInput | null;
}

export interface PricingResult {
  cost: Decimal;
  suggestedPrice: Decimal;
  currentSellingPrice: Decimal;
  grossProfit: Decimal;
  grossMarginPercent: Decimal;
  difference: Decimal;
}

/**
 * Selling Price = Total Cost / (1 - Target Gross Margin)
 * Example: cost 2, margin 40% => 2 / 0.60 = 3.33
 */
export function priceFromGrossMargin(
  cost: DecimalInput,
  targetMarginPercent: DecimalInput,
): Decimal {
  const costDec = d(cost);
  const margin = d(targetMarginPercent).dividedBy(100);
  if (margin.greaterThanOrEqualTo(1) || margin.lessThan(0)) {
    throw new Error('GROSS_MARGIN_INVALID');
  }
  const denominator = d(1).minus(margin);
  if (denominator.isZero()) {
    throw new Error('GROSS_MARGIN_INVALID');
  }
  return roundMoney(costDec.dividedBy(denominator));
}

export function priceFromMarkup(cost: DecimalInput, markupPercent: DecimalInput): Decimal {
  const costDec = d(cost);
  const markup = d(markupPercent).dividedBy(100);
  return roundMoney(costDec.times(d(1).plus(markup)));
}

export function calculateSuggestedPrice(input: PricingInput): Decimal {
  const cost = d(input.cost);
  switch (input.method) {
    case 'FIXED_PRICE':
      return roundMoney(input.fixedPrice ?? 0);
    case 'MARKUP_PERCENT':
      return priceFromMarkup(cost, input.markupPercent ?? 0);
    case 'GROSS_MARGIN_PERCENT':
      return priceFromGrossMargin(cost, input.targetMarginPercent ?? 0);
    default: {
      const _exhaustive: never = input.method;
      return _exhaustive;
    }
  }
}

export function calculateGrossProfit(revenue: DecimalInput, cogs: DecimalInput): Decimal {
  return roundMoney(d(revenue).minus(d(cogs)));
}

export function calculateGrossMarginPercent(revenue: DecimalInput, cogs: DecimalInput): Decimal {
  const rev = d(revenue);
  if (rev.isZero()) {
    return roundPercent(0);
  }
  return roundPercent(rev.minus(d(cogs)).dividedBy(rev).times(100));
}

export function calculateNetOperatingProfit(
  grossProfit: DecimalInput,
  operatingExpenses: DecimalInput,
): Decimal {
  return roundMoney(d(grossProfit).minus(d(operatingExpenses)));
}

export function buildPricingResult(
  cost: DecimalInput,
  currentSellingPrice: DecimalInput,
  method: PricingMethod,
  options?: {
    markupPercent?: DecimalInput | null;
    targetMarginPercent?: DecimalInput | null;
  },
): PricingResult {
  const costDec = roundMoney(cost);
  const current = roundMoney(currentSellingPrice);
  const suggested = calculateSuggestedPrice({
    cost: costDec,
    method,
    fixedPrice: current,
    markupPercent: options?.markupPercent,
    targetMarginPercent: options?.targetMarginPercent,
  });
  const profit = calculateGrossProfit(current, costDec);
  const margin = calculateGrossMarginPercent(current, costDec);
  return {
    cost: costDec,
    suggestedPrice: suggested,
    currentSellingPrice: current,
    grossProfit: profit,
    grossMarginPercent: margin,
    difference: roundMoney(current.minus(suggested)),
  };
}

export function isLowMargin(
  grossMarginPercent: DecimalInput,
  targetMarginPercent: DecimalInput,
): boolean {
  return d(grossMarginPercent).lessThan(d(targetMarginPercent));
}

export function priceImpactFromCostIncrease(
  currentCost: DecimalInput,
  newCost: DecimalInput,
  sellingPrice: DecimalInput,
): {
  currentProfit: Decimal;
  newProfit: Decimal;
  currentMargin: Decimal;
  newMargin: Decimal;
  profitChange: Decimal;
} {
  const price = d(sellingPrice);
  const currentProfit = calculateGrossProfit(price, currentCost);
  const newProfit = calculateGrossProfit(price, newCost);
  return {
    currentProfit,
    newProfit,
    currentMargin: calculateGrossMarginPercent(price, currentCost),
    newMargin: calculateGrossMarginPercent(price, newCost),
    profitChange: roundMoney(newProfit.minus(currentProfit)),
  };
}

export { isZero };
