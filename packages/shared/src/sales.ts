import { d, Decimal, roundMoney, type DecimalInput } from './money';
import { DEFAULT_WALK_IN_CUSTOMER_NAME } from '@alkhal/types';

export interface SaleLineInput {
  quantity: DecimalInput;
  unitPrice: DecimalInput;
  discountAmount?: DecimalInput;
}

export interface SaleTotals {
  subtotal: Decimal;
  discountTotal: Decimal;
  total: Decimal;
}

export function calculateSaleLineTotal(line: SaleLineInput): Decimal {
  const gross = d(line.quantity).times(d(line.unitPrice));
  const discount = d(line.discountAmount ?? 0);
  return roundMoney(gross.minus(discount));
}

export function calculateSaleTotals(lines: SaleLineInput[], orderDiscount?: DecimalInput): SaleTotals {
  let subtotal = d(0);
  let lineDiscounts = d(0);
  for (const line of lines) {
    const gross = d(line.quantity).times(d(line.unitPrice));
    subtotal = subtotal.plus(gross);
    lineDiscounts = lineDiscounts.plus(d(line.discountAmount ?? 0));
  }
  const extra = d(orderDiscount ?? 0);
  const discountTotal = roundMoney(lineDiscounts.plus(extra));
  const total = roundMoney(subtotal.minus(discountTotal));
  return {
    subtotal: roundMoney(subtotal),
    discountTotal,
    total,
  };
}

export function resolveSaleCustomerName(customerName: string | undefined, isDebt: boolean): string {
  const name = customerName?.trim() ?? '';
  if (isDebt) {
    return name;
  }
  return name || DEFAULT_WALK_IN_CUSTOMER_NAME;
}

export function calculatePurchaseLineTotal(
  quantity: DecimalInput,
  unitCost: DecimalInput,
  discountAmount?: DecimalInput,
  taxAmount?: DecimalInput,
): Decimal {
  return roundMoney(
    d(quantity).times(d(unitCost)).minus(d(discountAmount ?? 0)).plus(d(taxAmount ?? 0)),
  );
}
