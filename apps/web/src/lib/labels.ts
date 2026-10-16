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

export const PURCHASE_STATUS_AR: Record<string, string> = {
  DRAFT: 'مسودة',
  POSTED: 'مرحّل',
  PARTIALLY_PAID: 'مدفوع جزئياً',
  PAID: 'مدفوع',
  CANCELLED: 'ملغى',
};

export const PRODUCTION_STATUS_AR: Record<string, string> = {
  DRAFT: 'مسودة',
  IN_PROGRESS: 'قيد التنفيذ',
  COMPLETED: 'مكتمل',
  CANCELLED: 'ملغى',
};

export const STOCK_COUNT_STATUS_AR: Record<string, string> = {
  DRAFT: 'مسودة',
  COUNTED: 'تم العد',
  APPROVED: 'معتمد',
  CANCELLED: 'ملغى',
};

export const DEBT_STATUS_AR: Record<string, string> = {
  OPEN: 'مفتوح',
  SETTLED: 'مسدد',
  CANCELLED: 'ملغى',
};

export const OVERHEAD_METHOD_AR: Record<string, string> = {
  BY_REVENUE: 'حسب الإيرادات',
  BY_SALES_QUANTITY: 'حسب كمية المبيعات',
  BY_DIRECT_COST: 'حسب التكلفة المباشرة',
};

export const PRODUCT_TYPE_AR: Record<string, string> = {
  STANDARD: 'عادي',
  ADDON: 'إضافة',
  MODIFIER: 'معدل',
};

export const INVENTORY_MODE_AR: Record<string, string> = {
  RECIPE: 'حسب الوصفة',
  DIRECT: 'خصم مادة مباشرة',
  NONE: 'بدون مخزون',
};

export const PRICING_METHOD_AR: Record<string, string> = {
  FIXED_PRICE: 'سعر ثابت',
  MARKUP_PERCENT: 'إضافة على التكلفة',
  GROSS_MARGIN_PERCENT: 'هامش ربح',
};

export const INGREDIENT_TYPE_AR: Record<string, string> = {
  RAW: 'مادة أولية',
  PREPARED: 'مادة محضّرة',
  PACKAGING: 'تغليف',
};

export const PAYMENT_METHOD_AR: Record<string, string> = {
  CASH: 'نقد',
  CARD: 'بطاقة',
  OTHER: 'أخرى',
  DEBT: 'دين',
};

export const DEFAULT_CURRENCY = 'SYP';
export const DEFAULT_CURRENCY_SYMBOL = 'ل.س';
export const CURRENCY_NAME_AR = 'الليرة السورية';

export const OVERHEAD_METHOD_HINT_AR: Record<string, string> = {
  BY_REVENUE: 'تُوزَّع التكاليف الثابتة بنسبة إيرادات كل منتج من إجمالي الإيرادات.',
  BY_SALES_QUANTITY: 'تُوزَّع التكاليف الثابتة بنسبة عدد الوحدات المباعة لكل منتج.',
  BY_DIRECT_COST: 'تُوزَّع التكاليف الثابتة بنسبة التكلفة المباشرة (المواد) لكل منتج.',
};

export const EMPLOYEE_STATUS_AR: Record<string, string> = {
  ACTIVE: 'نشط',
  INACTIVE: 'موقوف',
  LOCKED: 'مقفول',
};

export const WAGE_TYPE_AR: Record<string, string> = {
  MONTHLY: 'شهري',
  HOURLY: 'بالساعة',
  DAILY: 'يومي',
};
