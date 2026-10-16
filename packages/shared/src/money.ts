import Decimal from 'decimal.js';
import { MONEY_SCALE, PERCENT_SCALE, QUANTITY_SCALE, UNIT_COST_SCALE } from '@alkhal/types';

Decimal.set({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
});

export type DecimalInput = Decimal.Value;

export function d(value: DecimalInput): Decimal {
  if (value instanceof Decimal) {
    return value;
  }
  return new Decimal(value);
}

export function roundMoney(value: DecimalInput): Decimal {
  return d(value).toDecimalPlaces(MONEY_SCALE, Decimal.ROUND_HALF_UP);
}

export function roundUnitCost(value: DecimalInput): Decimal {
  return d(value).toDecimalPlaces(UNIT_COST_SCALE, Decimal.ROUND_HALF_UP);
}

export function roundQuantity(value: DecimalInput): Decimal {
  return d(value).toDecimalPlaces(QUANTITY_SCALE, Decimal.ROUND_HALF_UP);
}

export function roundPercent(value: DecimalInput): Decimal {
  return d(value).toDecimalPlaces(PERCENT_SCALE, Decimal.ROUND_HALF_UP);
}

export function moneyToString(value: DecimalInput): string {
  return roundMoney(value).toFixed(MONEY_SCALE);
}

export function quantityToString(value: DecimalInput): string {
  return roundQuantity(value).toFixed(QUANTITY_SCALE);
}

export function unitCostToString(value: DecimalInput): string {
  return roundUnitCost(value).toFixed(UNIT_COST_SCALE);
}

export function isZero(value: DecimalInput): boolean {
  return d(value).isZero();
}

export function isPositive(value: DecimalInput): boolean {
  return d(value).greaterThan(0);
}

export function isNegative(value: DecimalInput): boolean {
  return d(value).lessThan(0);
}

export function max(a: DecimalInput, b: DecimalInput): Decimal {
  const left = d(a);
  const right = d(b);
  return left.greaterThan(right) ? left : right;
}

export function min(a: DecimalInput, b: DecimalInput): Decimal {
  const left = d(a);
  const right = d(b);
  return left.lessThan(right) ? left : right;
}

export { Decimal };
