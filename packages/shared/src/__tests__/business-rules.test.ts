import { describe, expect, it } from 'vitest';
import { d, moneyToString, roundMoney, roundUnitCost } from '../money';
import {
  averageCostFromCostPerKg,
  calculateRecipeCost,
  costPerKgFromAverageCost,
  defaultBaseUnitsPerKilogram,
  limitedRecipeServings,
  maxServingsFromStock,
  suggestedPurchaseQuantity,
  unitCostFromTotal,
  weightedAverageCost,
} from '../costing';
import {
  buildPricingResult,
  calculateGrossMarginPercent,
  calculateGrossProfit,
  calculateNetOperatingProfit,
  calculateSuggestedPrice,
  priceFromGrossMargin,
  priceImpactFromCostIncrease,
} from '../pricing';
import { convertQuantity, type UnitConversionRecord } from '../units';
import { allocateOverhead } from '../overhead';
import { calculatePurchaseLineTotal, calculateSaleTotals, resolveSaleCustomerName } from '../sales';

describe('weighted average cost', () => {
  it('averages two equal lots', () => {
    const avg = weightedAverageCost(10, 5, 10, 7);
    expect(avg.toString()).toBe(roundUnitCost(6).toString());
  });

  it('does not change average when incoming quantity is zero', () => {
    expect(weightedAverageCost(10, 5, 0, 99).toString()).toBe(roundUnitCost(5).toString());
  });

  it('uses incoming cost when current quantity is zero', () => {
    expect(weightedAverageCost(0, 0, 8, 4.5).toString()).toBe(roundUnitCost(4.5).toString());
  });
});

describe('pricing', () => {
  it('computes selling price from 40% gross margin', () => {
    const price = priceFromGrossMargin(2, 40);
    expect(moneyToString(price)).toBe('3.33');
  });

  it('computes markup price', () => {
    const price = calculateSuggestedPrice({
      cost: 10,
      method: 'MARKUP_PERCENT',
      markupPercent: 50,
    });
    expect(moneyToString(price)).toBe('15.00');
  });

  it('keeps fixed price', () => {
    const price = calculateSuggestedPrice({
      cost: 10,
      method: 'FIXED_PRICE',
      fixedPrice: 12.5,
    });
    expect(moneyToString(price)).toBe('12.50');
  });

  it('rejects invalid gross margin', () => {
    expect(() => priceFromGrossMargin(2, 100)).toThrow('GROSS_MARGIN_INVALID');
  });

  it('builds pricing comparison', () => {
    const result = buildPricingResult(2, 3.33, 'GROSS_MARGIN_PERCENT', {
      targetMarginPercent: 40,
    });
    expect(moneyToString(result.suggestedPrice)).toBe('3.33');
    expect(moneyToString(result.grossProfit)).toBe('1.33');
  });

  it('computes profit impact when ingredient prices rise', () => {
    const impact = priceImpactFromCostIncrease(2, 2.5, 3.33);
    expect(moneyToString(impact.profitChange)).toBe('-0.50');
  });
});

describe('gross and net profit', () => {
  it('separates gross profit from net operating profit', () => {
    const revenue = 1000;
    const cogs = 400;
    const expenses = 250;
    const gross = calculateGrossProfit(revenue, cogs);
    const margin = calculateGrossMarginPercent(revenue, cogs);
    const net = calculateNetOperatingProfit(gross, expenses);
    expect(moneyToString(gross)).toBe('600.00');
    expect(margin.toNumber()).toBe(60);
    expect(moneyToString(net)).toBe('350.00');
  });
});

describe('cost per kilogram', () => {
  it('converts 25 per kg into 0.025 per gram', () => {
    const perGram = averageCostFromCostPerKg(25, 1000);
    expect(perGram.toNumber()).toBe(0.025);
    expect(costPerKgFromAverageCost(perGram, 1000).toNumber()).toBe(25);
  });

  it('keeps cost unchanged when the base unit is already kg', () => {
    expect(averageCostFromCostPerKg(12.5, 1).toNumber()).toBe(12.5);
  });

  it('uses 1000 ml per kg for liquids', () => {
    expect(defaultBaseUnitsPerKilogram('ml')?.toNumber()).toBe(1000);
    expect(averageCostFromCostPerKg(8, 1000).toNumber()).toBe(0.008);
  });

  it('has no default kg factor for piece units', () => {
    expect(defaultBaseUnitsPerKilogram('piece')).toBeNull();
  });
});

describe('recipe cost', () => {
  it('splits material, packaging, waste allowance and overhead', () => {
    const result = calculateRecipeCost(
      [
        { quantityInBaseUnits: 250, unitCost: 0.002 },
        { quantityInBaseUnits: 100, unitCost: 0.02 },
        { quantityInBaseUnits: 1, unitCost: 0.15, isPackaging: true },
      ],
      { wasteAllowancePercent: 5, allocatedOverhead: 0.1 },
    );
    expect(result.materialCost.toNumber()).toBeGreaterThan(0);
    expect(result.packagingCost.toNumber()).toBe(0.15);
    expect(result.wasteAllowanceCost.toNumber()).toBeGreaterThan(0);
    expect(result.totalCost.toNumber()).toBeGreaterThan(result.directVariableCost.toNumber());
  });

  it('computes unit cost from total', () => {
    expect(unitCostFromTotal(50, 10).toNumber()).toBe(5);
  });
});

describe('unit conversion', () => {
  const conversions: UnitConversionRecord[] = [
    { fromUnitId: 'kg', toUnitId: 'g', factor: 1000 },
    { fromUnitId: 'liter', toUnitId: 'ml', factor: 1000 },
    { fromUnitId: 'bag', toUnitId: 'g', factor: 25000, ingredientId: 'flour' },
    { fromUnitId: 'carton', toUnitId: 'liter', factor: 12, ingredientId: 'oil' },
  ];

  it('converts kg to grams', () => {
    expect(convertQuantity(2, 'kg', 'g', conversions).toNumber()).toBe(2000);
  });

  it('converts grams to kg via reverse factor', () => {
    expect(convertQuantity(500, 'g', 'kg', conversions).toNumber()).toBe(0.5);
  });

  it('uses ingredient-specific bag conversion', () => {
    expect(convertQuantity(1, 'bag', 'g', conversions, 'flour').toNumber()).toBe(25000);
  });

  it('converts oil carton to ml via two hops', () => {
    expect(convertQuantity(1, 'carton', 'ml', conversions, 'oil').toNumber()).toBe(12000);
  });

  it('throws when conversion is missing', () => {
    expect(() => convertQuantity(1, 'box', 'g', conversions)).toThrow();
  });
});

describe('overhead allocation', () => {
  it('allocates by revenue and remainder goes to last share', () => {
    const result = allocateOverhead(100, 'BY_REVENUE', [
      { key: 'pizza', revenue: 60 },
      { key: 'falafel', revenue: 40 },
    ]);
    expect(result.get('pizza')?.toString()).toBe(roundMoney(60).toString());
    expect(result.get('falafel')?.toString()).toBe(roundMoney(40).toString());
  });

  it('allocates by quantity', () => {
    const result = allocateOverhead(90, 'BY_SALES_QUANTITY', [
      { key: 'a', quantity: 2 },
      { key: 'b', quantity: 1 },
    ]);
    expect(d(result.get('a')!).plus(result.get('b')!).toNumber()).toBe(90);
  });
});

describe('sales and purchases', () => {
  it('totals a sale with line and order discounts', () => {
    const totals = calculateSaleTotals(
      [
        { quantity: 2, unitPrice: 10, discountAmount: 1 },
        { quantity: 1, unitPrice: 5 },
      ],
      2,
    );
    expect(moneyToString(totals.subtotal)).toBe('25.00');
    expect(moneyToString(totals.discountTotal)).toBe('3.00');
    expect(moneyToString(totals.total)).toBe('22.00');
  });

  it('computes purchase line with discount and tax', () => {
    expect(moneyToString(calculatePurchaseLineTotal(10, 5, 5, 2))).toBe('47.00');
  });
});

describe('sale customer name', () => {
  it('defaults cash sales without a name to walk-in customer', () => {
    expect(resolveSaleCustomerName(undefined, false)).toBe('زبون');
    expect(resolveSaleCustomerName('  ', false)).toBe('زبون');
  });

  it('keeps an explicit cash customer name', () => {
    expect(resolveSaleCustomerName(' أحمد ', false)).toBe('أحمد');
  });

  it('requires a name for debt sales', () => {
    expect(resolveSaleCustomerName(undefined, true)).toBe('');
    expect(resolveSaleCustomerName('ليلى', true)).toBe('ليلى');
  });
});

describe('low stock', () => {
  it('suggests purchase to reach target', () => {
    expect(suggestedPurchaseQuantity(20, 4).toNumber()).toBe(16);
  });
});

describe('recipe servings from stock', () => {
  it('floors dough stock into whole pizzas', () => {
    expect(maxServingsFromStock(10000, 250).toNumber()).toBe(40);
    expect(maxServingsFromStock(249, 250).toNumber()).toBe(0);
  });

  it('uses the scarcest ingredient as the limit', () => {
    const result = limitedRecipeServings([
      { available: 10000, neededPerServing: 250 },
      { available: 400, neededPerServing: 100 },
      { available: 1000, neededPerServing: 80 },
    ]);
    expect(result.servings.toNumber()).toBe(4);
    expect(result.limitingIndex).toBe(1);
  });
});
