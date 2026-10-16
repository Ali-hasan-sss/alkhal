export function labelAr(map: Record<string, string>, value?: string | null) {
  if (!value) {
    return '—';
  }
  return map[value] ?? value;
}

export const SALE_STATUS_AR: Record<string, string> = {
  DRAFT: 'مسودة',
  HELD: 'معلّق',
  COMPLETED: 'مكتمل',
  CANCELLED: 'ملغى',
  REFUNDED: 'مسترجع',
  PARTIALLY_REFUNDED: 'مسترجع جزئياً',
};

export const PRODUCTION_STATUS_AR: Record<string, string> = {
  DRAFT: 'مسودة',
  IN_PROGRESS: 'قيد التنفيذ',
  COMPLETED: 'مكتمل',
  CANCELLED: 'ملغى',
};

export const DEBT_STATUS_AR: Record<string, string> = {
  OPEN: 'مفتوح',
  SETTLED: 'مسدد',
  CANCELLED: 'ملغى',
};

export const PRICING_METHOD_AR: Record<string, string> = {
  FIXED_PRICE: 'سعر ثابت',
  MARKUP_PERCENT: 'إضافة على التكلفة',
  GROSS_MARGIN_PERCENT: 'هامش ربح',
};

export const OVERHEAD_METHOD_AR: Record<string, string> = {
  BY_REVENUE: 'حسب الإيرادات',
  BY_SALES_QUANTITY: 'حسب كمية المبيعات',
  BY_DIRECT_COST: 'حسب التكلفة المباشرة',
};

export const DEFAULT_CURRENCY_SYMBOL = 'ل.س';
export const CURRENCY_NAME_AR = 'الليرة السورية';

export const PAYMENT_METHOD_AR: Record<string, string> = {
  CASH: 'نقد',
  CARD: 'بطاقة',
  OTHER: 'أخرى',
  DEBT: 'دين',
};
