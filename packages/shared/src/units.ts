import { d, Decimal, roundQuantity, type DecimalInput } from './money';

export interface UnitConversionRecord {
  fromUnitId: string;
  toUnitId: string;
  factor: DecimalInput;
  ingredientId?: string | null;
}

export class UnitConversionError extends Error {
  constructor(
    message: string,
    public readonly fromUnitId: string,
    public readonly toUnitId: string,
  ) {
    super(message);
    this.name = 'UnitConversionError';
  }
}

/**
 * Converts quantity from one unit to another.
 * Ingredient-specific conversions take precedence over global ones.
 * Direct and reverse factors are supported. Two-hop via an intermediate unit is supported.
 */
export function convertQuantity(
  quantity: DecimalInput,
  fromUnitId: string,
  toUnitId: string,
  conversions: UnitConversionRecord[],
  ingredientId?: string | null,
): Decimal {
  if (fromUnitId === toUnitId) {
    return roundQuantity(quantity);
  }

  const qty = d(quantity);
  const factor = findConversionFactor(fromUnitId, toUnitId, conversions, ingredientId);
  if (!factor) {
    throw new UnitConversionError(
      `No conversion from unit ${fromUnitId} to ${toUnitId}`,
      fromUnitId,
      toUnitId,
    );
  }
  return roundQuantity(qty.times(factor));
}

export function findConversionFactor(
  fromUnitId: string,
  toUnitId: string,
  conversions: UnitConversionRecord[],
  ingredientId?: string | null,
): Decimal | null {
  if (fromUnitId === toUnitId) {
    return d(1);
  }

  const scoped = conversions.filter(
    (c) => !c.ingredientId || (ingredientId && c.ingredientId === ingredientId),
  );

  const preferIngredient = (a: UnitConversionRecord, b: UnitConversionRecord) => {
    const aSpecific = a.ingredientId ? 1 : 0;
    const bSpecific = b.ingredientId ? 1 : 0;
    return bSpecific - aSpecific;
  };

  const direct = scoped
    .filter((c) => c.fromUnitId === fromUnitId && c.toUnitId === toUnitId)
    .sort(preferIngredient)[0];
  if (direct) {
    return d(direct.factor);
  }

  const reverse = scoped
    .filter((c) => c.fromUnitId === toUnitId && c.toUnitId === fromUnitId)
    .sort(preferIngredient)[0];
  if (reverse) {
    const factor = d(reverse.factor);
    if (factor.isZero()) {
      return null;
    }
    return d(1).dividedBy(factor);
  }

  const outgoing = scoped.filter((c) => c.fromUnitId === fromUnitId || c.toUnitId === fromUnitId);
  for (const hop of outgoing) {
    const mid = hop.fromUnitId === fromUnitId ? hop.toUnitId : hop.fromUnitId;
    if (mid === fromUnitId || mid === toUnitId) {
      continue;
    }
    const first = findDirectOrReverse(fromUnitId, mid, scoped);
    const second = findDirectOrReverse(mid, toUnitId, scoped);
    if (first && second) {
      return first.times(second);
    }
  }

  return null;
}

function findDirectOrReverse(
  fromUnitId: string,
  toUnitId: string,
  conversions: UnitConversionRecord[],
): Decimal | null {
  const direct = conversions.find((c) => c.fromUnitId === fromUnitId && c.toUnitId === toUnitId);
  if (direct) {
    return d(direct.factor);
  }
  const reverse = conversions.find((c) => c.fromUnitId === toUnitId && c.toUnitId === fromUnitId);
  if (reverse) {
    const factor = d(reverse.factor);
    return factor.isZero() ? null : d(1).dividedBy(factor);
  }
  return null;
}

export const BASE_UNIT_CONVERSIONS: Array<{
  fromCode: string;
  toCode: string;
  factor: string;
}> = [
  { fromCode: 'kg', toCode: 'g', factor: '1000' },
  { fromCode: 'liter', toCode: 'ml', factor: '1000' },
];
