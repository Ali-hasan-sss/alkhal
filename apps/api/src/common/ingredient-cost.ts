import {
  averageCostFromCostPerKg,
  convertQuantity,
  costPerKgFromAverageCost,
  d,
  defaultBaseUnitsPerKilogram,
  type Decimal,
  type UnitConversionRecord,
} from '@alkhal/shared';

type UnitRow = { id: string; code: string };
type ConversionRow = {
  fromUnitId: string;
  toUnitId: string;
  factor: { toString(): string } | string | number;
  ingredientId?: string | null;
};

export function toConversionRecords(rows: ConversionRow[]): UnitConversionRecord[] {
  return rows.map((row) => ({
    fromUnitId: row.fromUnitId,
    toUnitId: row.toUnitId,
    factor: row.factor.toString(),
    ingredientId: row.ingredientId,
  }));
}

export function resolveBaseUnitsPerKg(
  baseUnit: UnitRow,
  kgUnit: UnitRow | undefined,
  conversions: UnitConversionRecord[],
): Decimal {
  if (kgUnit) {
    try {
      return convertQuantity(1, kgUnit.id, baseUnit.id, conversions);
    } catch {
      // fall through to unit-code defaults
    }
  }
  return defaultBaseUnitsPerKilogram(baseUnit.code) ?? d(1);
}

export function unitCostFromCostPerKg(
  costPerKg: string | number,
  baseUnit: UnitRow,
  kgUnit: UnitRow | undefined,
  conversions: UnitConversionRecord[],
): string {
  const factor = resolveBaseUnitsPerKg(baseUnit, kgUnit, conversions);
  return averageCostFromCostPerKg(costPerKg, factor).toString();
}

export function displayCostPerKg(
  averageCost: { toString(): string } | string | number,
  baseUnit: UnitRow,
  kgUnit: UnitRow | undefined,
  conversions: UnitConversionRecord[],
): string {
  const factor = resolveBaseUnitsPerKg(baseUnit, kgUnit, conversions);
  return costPerKgFromAverageCost(averageCost.toString(), factor).toString();
}
