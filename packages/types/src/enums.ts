export const ROLE_CODES = [
  'OWNER',
  'MANAGER',
  'CASHIER',
  'KITCHEN',
  'INVENTORY_MANAGER',
  'ACCOUNTANT',
] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

export const PERMISSION_CODES = [
  'settings.manage',
  'users.manage',
  'roles.manage',
  'sales.create',
  'sales.view',
  'sales.refund',
  'sales.cancel',
  'drawer.collect',
  'pos.access',
  'inventory.view',
  'inventory.adjust',
  'inventory.count',
  'purchases.create',
  'purchases.view',
  'purchases.post',
  'purchases.cancel',
  'suppliers.manage',
  'production.create',
  'production.complete',
  'production.cancel',
  'recipes.manage',
  'products.manage',
  'ingredients.manage',
  'expenses.create',
  'expenses.view',
  'employees.manage',
  'employees.pay',
  'reports.view',
  'debts.view',
  'debts.settle',
  'audit.view',
  'waste.create',
  'waste.view',
] as const;
export type PermissionCode = (typeof PERMISSION_CODES)[number];

export const INVENTORY_TRANSACTION_TYPES = [
  'PURCHASE',
  'SALE',
  'PRODUCTION_CONSUMPTION',
  'PRODUCTION_OUTPUT',
  'WASTE',
  'RETURN',
  'ADJUSTMENT',
  'STOCK_COUNT',
  'TRANSFER',
  'REFUND',
  'PURCHASE_REVERSAL',
  'PRODUCTION_REVERSAL',
] as const;
export type InventoryTransactionType = (typeof INVENTORY_TRANSACTION_TYPES)[number];

export const PRICING_METHODS = [
  'FIXED_PRICE',
  'MARKUP_PERCENT',
  'GROSS_MARGIN_PERCENT',
] as const;
export type PricingMethod = (typeof PRICING_METHODS)[number];

export const OVERHEAD_ALLOCATION_METHODS = [
  'BY_REVENUE',
  'BY_SALES_QUANTITY',
  'BY_DIRECT_COST',
] as const;
export type OverheadAllocationMethod = (typeof OVERHEAD_ALLOCATION_METHODS)[number];

export const PURCHASE_STATUSES = [
  'DRAFT',
  'POSTED',
  'PARTIALLY_PAID',
  'PAID',
  'CANCELLED',
] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

export const SALE_STATUSES = [
  'DRAFT',
  'HELD',
  'COMPLETED',
  'CANCELLED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];

export const PRODUCTION_STATUSES = ['DRAFT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export type ProductionStatus = (typeof PRODUCTION_STATUSES)[number];

export const STOCK_COUNT_STATUSES = ['DRAFT', 'COUNTED', 'APPROVED', 'CANCELLED'] as const;
export type StockCountStatus = (typeof STOCK_COUNT_STATUSES)[number];

export const PAYMENT_METHODS = ['CASH', 'CARD', 'OTHER', 'DEBT'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const CUSTOMER_DEBT_STATUSES = ['OPEN', 'SETTLED', 'CANCELLED'] as const;
export type CustomerDebtStatus = (typeof CUSTOMER_DEBT_STATUSES)[number];

export const DEFAULT_WALK_IN_CUSTOMER_NAME = 'زبون';

export const EXPENSE_PAYMENT_METHODS = ['CASH', 'CARD', 'BANK_TRANSFER', 'OTHER'] as const;
export type ExpensePaymentMethod = (typeof EXPENSE_PAYMENT_METHODS)[number];

export const WASTE_REASON_CODES = [
  'EXPIRED',
  'BURNED',
  'DAMAGED',
  'PREPARATION_WASTE',
  'SPOILED',
  'WRONG_ORDER',
  'SPILLAGE',
  'OTHER',
] as const;
export type WasteReasonCode = (typeof WASTE_REASON_CODES)[number];

export const INGREDIENT_TYPES = ['RAW', 'PREPARED', 'PACKAGING'] as const;
export type IngredientType = (typeof INGREDIENT_TYPES)[number];

export const PRODUCT_TYPES = ['STANDARD', 'ADDON', 'MODIFIER'] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const PRODUCT_INVENTORY_MODES = ['RECIPE', 'DIRECT', 'NONE'] as const;
export type ProductInventoryMode = (typeof PRODUCT_INVENTORY_MODES)[number];

export const UNIT_TYPES = ['WEIGHT', 'VOLUME', 'COUNT'] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

export const WAGE_TYPES = ['MONTHLY', 'DAILY', 'HOURLY'] as const;
export type WageType = (typeof WAGE_TYPES)[number];

export const EMPLOYEE_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export const USER_STATUSES = ['ACTIVE', 'INACTIVE', 'LOCKED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const AUDIT_ACTIONS = [
  'LOGIN',
  'LOGOUT',
  'CREATE',
  'UPDATE',
  'DELETE',
  'POST',
  'CANCEL',
  'REFUND',
  'STOCK_ADJUSTMENT',
  'PURCHASE_POSTED',
  'SALE_COMPLETED',
  'EXPENSE_CREATED',
  'PRODUCTION_COMPLETED',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const DEFAULT_UNIT_CODES = [
  'kg',
  'g',
  'liter',
  'ml',
  'piece',
  'box',
  'pack',
  'carton',
] as const;
export type DefaultUnitCode = (typeof DEFAULT_UNIT_CODES)[number];

export const CATEGORY_CODES = [
  'pizza',
  'pastries',
  'falafel',
  'hummus',
  'sandwiches',
  'drinks',
  'addons',
] as const;

export const MONEY_SCALE = 2;
export const UNIT_COST_SCALE = 6;
export const QUANTITY_SCALE = 4;
export const PERCENT_SCALE = 4;
