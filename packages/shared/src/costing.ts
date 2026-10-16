import { d, Decimal, isZero, roundMoney, roundQuantity, roundUnitCost, type DecimalInput } from './money';

/**
 * Weighted average cost.
 * (currentQty * currentAvg + incomingQty * incomingCost) / (currentQty + incomingQty)
 *
 * Incoming quantity must be positive. Consumption does not change average cost.
 */
export function weightedAverageCost(
  currentQty: DecimalInput,
  currentAvgCost: DecimalInput,
  incomingQty: DecimalInput,
  incomingUnitCost: DecimalInput,
): Decimal {
  const qty = d(currentQty);
  const avg = d(currentAvgCost);
  const incoming = d(incomingQty);
  const incomingCost = d(incomingUnitCost);

  if (incoming.lessThanOrEqualTo(0)) {
    return roundUnitCost(avg);
  }

  const currentValue = maxZero(qty).times(avg);
  const incomingValue = incoming.times(incomingCost);
  const newQty = maxZero(qty).plus(incoming);

  if (newQty.isZero()) {
    return roundUnitCost(incomingCost);
  }

  return roundUnitCost(currentValue.plus(incomingValue).dividedBy(newQty));
}

function maxZero(value: Decimal): Decimal {
  return value.lessThan(0) ? d(0) : value;
}

export interface RecipeCostItem {
  quantityInBaseUnits: DecimalInput;
  unitCost: DecimalInput;
  isPackaging?: boolean;
}

export interface RecipeCostBreakdown {
  materialCost: Decimal;
  packagingCost: Decimal;
  directVariableCost: Decimal;
  wasteAllowanceCost: Decimal;
  allocatedOverhead: Decimal;
  totalCost: Decimal;
}

/**
 * Recipe cost from current ingredient costs.
 * wasteAllowancePercent is applied on material+packaging (direct variable cost).
 * allocatedOverhead is passed in (already computed for this product).
 */
export function calculateRecipeCost(
  items: RecipeCostItem[],
  options?: {
    wasteAllowancePercent?: DecimalInput;
    allocatedOverhead?: DecimalInput;
  },
): RecipeCostBreakdown {
  let material = d(0);
  let packaging = d(0);

  for (const item of items) {
    const line = d(item.quantityInBaseUnits).times(d(item.unitCost));
    if (item.isPackaging) {
      packaging = packaging.plus(line);
    } else {
      material = material.plus(line);
    }
  }

  const directVariable = material.plus(packaging);
  const wastePct = d(options?.wasteAllowancePercent ?? 0).dividedBy(100);
  const wasteAllowance = directVariable.times(wastePct);
  const overhead = d(options?.allocatedOverhead ?? 0);
  const total = directVariable.plus(wasteAllowance).plus(overhead);

  return {
    materialCost: roundUnitCost(material),
    packagingCost: roundUnitCost(packaging),
    directVariableCost: roundUnitCost(directVariable),
    wasteAllowanceCost: roundUnitCost(wasteAllowance),
    allocatedOverhead: roundUnitCost(overhead),
    totalCost: roundUnitCost(total),
  };
}

export function unitCostFromTotal(totalCost: DecimalInput, quantity: DecimalInput): Decimal {
  const qty = d(quantity);
  if (qty.isZero()) {
    return roundUnitCost(0);
  }
  return roundUnitCost(d(totalCost).dividedBy(qty));
}

export function lineCost(quantity: DecimalInput, unitCost: DecimalInput): Decimal {
  return roundUnitCost(d(quantity).times(d(unitCost)));
}

export function suggestedPurchaseQuantity(
  targetStock: DecimalInput,
  currentStock: DecimalInput,
): Decimal {
  const needed = d(targetStock).minus(d(currentStock));
  if (needed.lessThanOrEqualTo(0)) {
    return roundQuantity(0);
  }
  return roundQuantity(needed);
}

export function isAtOrBelowReorderPoint(
  currentStock: DecimalInput,
  reorderPoint: DecimalInput,
): boolean {
  return d(currentStock).lessThanOrEqualTo(d(reorderPoint));
}

/** Whole servings that `available` stock can cover. */
export function maxServingsFromStock(
  available: DecimalInput,
  quantityPerServing: DecimalInput,
): Decimal {
  const per = d(quantityPerServing);
  if (per.lessThanOrEqualTo(0)) {
    return d(0);
  }
  const raw = d(available).dividedBy(per);
  if (raw.lessThan(0)) {
    return d(0);
  }
  return raw.toDecimalPlaces(0, Decimal.ROUND_DOWN);
}

/**
 * How many recipe outputs can be made from current stock.
 * The limiting line is the ingredient that runs out first.
 */
export function limitedRecipeServings(
  lines: Array<{ available: DecimalInput; neededPerServing: DecimalInput }>,
): { servings: Decimal; limitingIndex: number | null } {
  if (lines.length === 0) {
    return { servings: d(0), limitingIndex: null };
  }
  let servings: Decimal | null = null;
  let limitingIndex: number | null = null;
  lines.forEach((line, index) => {
    const count = maxServingsFromStock(line.available, line.neededPerServing);
    if (servings === null || count.lessThan(servings)) {
      servings = count;
      limitingIndex = index;
    }
  });
  return { servings: servings ?? d(0), limitingIndex };
}

/**
 * How many base units equal 1 kg, used to convert "cost per kg" into
 * cost per recipe base unit (usually grams).
 * Liquids assume water density: 1 kg ≈ 1 liter = 1000 ml.
 * Returns null for count units (piece/box) that have no weight conversion.
 */
export function defaultBaseUnitsPerKilogram(unitCode: string): Decimal | null {
  switch (unitCode.toLowerCase()) {
    case 'g':
    case 'gram':
    case 'grams':
      return d(1000);
    case 'kg':
    case 'kilogram':
    case 'kilograms':
      return d(1);
    case 'ml':
    case 'milliliter':
    case 'millilitre':
      return d(1000);
    case 'l':
    case 'liter':
    case 'litre':
      return d(1);
    default:
      return null;
  }
}

/** Store cost per base unit from a user-entered cost per kilogram. */
export function averageCostFromCostPerKg(
  costPerKg: DecimalInput,
  baseUnitsPerKg: DecimalInput,
): Decimal {
  const factor = d(baseUnitsPerKg);
  if (factor.lessThanOrEqualTo(0)) {
    return roundUnitCost(costPerKg);
  }
  return roundUnitCost(d(costPerKg).dividedBy(factor));
}

/** Display cost per kilogram from stored cost per base unit. */
export function costPerKgFromAverageCost(
  averageCost: DecimalInput,
  baseUnitsPerKg: DecimalInput,
): Decimal {
  const factor = d(baseUnitsPerKg);
  if (factor.lessThanOrEqualTo(0)) {
    return roundMoney(averageCost);
  }
  return roundMoney(d(averageCost).times(factor));
}

export { isZero };
