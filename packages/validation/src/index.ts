import { z } from 'zod';

export const moneySchema = z
  .string()
  .or(z.number())
  .transform((v) => String(v))
  .refine((v) => !Number.isNaN(Number(v)), 'INVALID_NUMBER');

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(20),
});

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  nameAr: z.string().min(1),
  nameEn: z.string().min(1),
  roleId: z.string().uuid(),
});

export const updateUserSchema = z.object({
  nameAr: z.string().min(1).optional(),
  nameEn: z.string().min(1).optional(),
  roleId: z.string().uuid().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'LOCKED']).optional(),
  password: z.string().min(8).max(128).optional(),
});

export const updateRestaurantSchema = z.object({
  nameAr: z.string().min(1).optional(),
  nameEn: z.string().min(1).optional(),
  currency: z.string().length(3).optional(),
  currencySymbol: z.string().min(1).optional(),
  timezone: z.string().min(1).optional(),
  taxEnabled: z.boolean().optional(),
  taxRate: moneySchema.optional(),
  overheadAllocationMethod: z
    .enum(['BY_REVENUE', 'BY_SALES_QUANTITY', 'BY_DIRECT_COST'])
    .optional(),
  locale: z.enum(['ar', 'en']).optional(),
});

export const createCategorySchema = z.object({
  code: z.string().min(1),
  nameAr: z.string().min(1),
  nameEn: z.string().min(1),
  sortOrder: z.number().int().optional(),
  color: z.string().optional(),
  active: z.boolean().optional(),
});

export const updateCategorySchema = createCategorySchema.partial();

export const createUnitSchema = z.object({
  code: z.string().min(1),
  nameAr: z.string().min(1),
  nameEn: z.string().min(1),
  symbol: z.string().min(1),
  unitType: z.enum(['WEIGHT', 'VOLUME', 'COUNT']),
});

export const createUnitConversionSchema = z.object({
  fromUnitId: z.string().uuid(),
  toUnitId: z.string().uuid(),
  factor: moneySchema,
  ingredientId: z.string().uuid().optional(),
});

export const createIngredientSchema = z.object({
  sku: z.string().min(1),
  nameAr: z.string().min(1),
  nameEn: z.string().min(1),
  categoryId: z.string().uuid().optional(),
  type: z.enum(['RAW', 'PREPARED', 'PACKAGING']).default('RAW'),
  baseUnitId: z.string().uuid(),
  minimumStock: moneySchema.default('0'),
  reorderPoint: moneySchema.default('0'),
  targetStock: moneySchema.default('0'),
  costPerKg: moneySchema.refine((v) => Number(v) > 0, 'COST_PER_KG_REQUIRED'),
  active: z.boolean().optional(),
});

export const updateIngredientSchema = createIngredientSchema.partial();

export const productComponentSchema = z
  .object({
    recipeId: z.string().uuid().optional(),
    ingredientId: z.string().uuid().optional(),
    quantity: moneySchema,
    unitId: z.string().uuid(),
    isPackaging: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  })
  .refine((row) => Boolean(row.recipeId) !== Boolean(row.ingredientId), {
    message: 'COMPONENT_SOURCE_REQUIRED',
  });

export const createProductSchema = z.object({
  sku: z.string().min(1),
  nameAr: z.string().min(1),
  nameEn: z.string().min(1),
  categoryId: z.string().uuid(),
  type: z.enum(['STANDARD', 'ADDON', 'MODIFIER']).default('STANDARD'),
  inventoryMode: z.enum(['RECIPE', 'DIRECT', 'NONE']).default('RECIPE'),
  directIngredientId: z.string().uuid().optional(),
  pricingMethod: z.enum(['FIXED_PRICE', 'MARKUP_PERCENT', 'GROSS_MARGIN_PERCENT']),
  targetMarginPercent: moneySchema.default('0'),
  markupPercent: moneySchema.default('0'),
  sellingPrice: moneySchema,
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  variants: z
    .array(
      z.object({
        sku: z.string().min(1),
        nameAr: z.string().min(1),
        nameEn: z.string().min(1),
        sellingPrice: moneySchema,
      }),
    )
    .optional(),
  components: z.array(productComponentSchema).optional(),
});

export const updateProductSchema = createProductSchema.partial();

export const recipeItemSchema = z.object({
  ingredientId: z.string().uuid(),
  quantity: moneySchema,
  unitId: z.string().uuid(),
  isPackaging: z.boolean().optional(),
  notes: z.string().optional(),
});

export const createRecipeObject = z.object({
  nameAr: z.string().min(1),
  nameEn: z.string().min(1),
  productId: z.string().uuid().nullable().optional(),
  variantId: z.string().uuid().nullable().optional(),
  outputIngredientId: z.string().uuid().nullable().optional(),
  outputQuantity: moneySchema,
  outputUnitId: z.string().uuid(),
  wasteAllowancePercent: moneySchema.default('0'),
  notes: z.string().optional(),
  active: z.boolean().optional(),
  items: z.array(recipeItemSchema).min(1),
});

export const createRecipeSchema = createRecipeObject.refine(
  (row) => Boolean(row.productId) || Boolean(row.outputIngredientId),
  { message: 'RECIPE_TARGET_REQUIRED' },
);

export const updateRecipeSchema = createRecipeObject.partial().extend({
  items: z.array(recipeItemSchema).min(1).optional(),
});

export const createSupplierSchema = z.object({
  nameAr: z.string().min(1),
  nameEn: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  active: z.boolean().optional(),
});

export const purchaseItemSchema = z.object({
  ingredientId: z.string().uuid(),
  quantity: moneySchema,
  unitId: z.string().uuid(),
  unitCost: moneySchema,
  discountAmount: moneySchema.optional(),
  taxAmount: moneySchema.optional(),
});

export const createPurchaseSchema = z.object({
  supplierId: z.string().uuid(),
  invoiceNumber: z.string().min(1),
  invoiceDate: z.coerce.date(),
  dueDate: z.coerce.date().optional(),
  notes: z.string().optional(),
  items: z.array(purchaseItemSchema).min(1),
});

export const supplierPaymentSchema = z.object({
  amount: moneySchema,
  method: z.enum(['CASH', 'CARD', 'OTHER']),
  paidAt: z.coerce.date().optional(),
  notes: z.string().optional(),
});

export const createProductionSchema = z
  .object({
    recipeId: z.string().uuid().optional(),
    productId: z.string().uuid().optional(),
    plannedQuantity: moneySchema,
    notes: z.string().optional(),
  })
  .refine((row) => Boolean(row.recipeId) || Boolean(row.productId), {
    message: 'PRODUCTION_TARGET_REQUIRED',
  });

export const completeProductionSchema = z.object({
  actualQuantity: moneySchema,
  wasteQuantity: moneySchema.default('0'),
  notes: z.string().optional(),
});

export const runProductionSchema = z
  .object({
    recipeId: z.string().uuid().optional(),
    productId: z.string().uuid().optional(),
    plannedQuantity: moneySchema,
    actualQuantity: moneySchema.optional(),
    wasteQuantity: moneySchema.default('0'),
    notes: z.string().optional(),
  })
  .refine((row) => Boolean(row.recipeId) || Boolean(row.productId), {
    message: 'PRODUCTION_TARGET_REQUIRED',
  });

export const wasteProductionYieldSchema = z.object({
  quantity: moneySchema.refine((v) => Number(v) > 0, 'WASTE_QTY_REQUIRED'),
  notes: z.string().optional(),
});

export const createWasteSchema = z.object({
  ingredientId: z.string().uuid(),
  quantity: moneySchema,
  unitId: z.string().uuid(),
  reasonId: z.string().uuid(),
  notes: z.string().optional(),
  occurredAt: z.coerce.date().optional(),
});

export const createStockCountSchema = z.object({
  notes: z.string().optional(),
  items: z.array(
    z.object({
      ingredientId: z.string().uuid(),
      actualQuantity: moneySchema,
    }),
  ),
});

export const inventoryAdjustSchema = z.object({
  ingredientId: z.string().uuid(),
  quantity: moneySchema,
  notes: z.string().min(1),
});

export const inventoryReceiveSchema = z.object({
  ingredientId: z.string().uuid(),
  quantity: moneySchema.refine((v) => Number(v) > 0, 'RECEIVE_QTY_REQUIRED'),
  unitId: z.string().uuid().optional(),
  notes: z.string().optional(),
});

export const posItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  quantity: moneySchema,
  discountAmount: moneySchema.optional(),
  notes: z.string().optional(),
  modifiers: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: moneySchema.default('1'),
      }),
    )
    .optional(),
});

export const posPaymentMethodSchema = z.enum(['CASH', 'CARD', 'OTHER', 'DEBT']);

export const posCheckoutSchema = z.object({
  customerName: z.string().optional(),
  notes: z.string().optional(),
  discountTotal: moneySchema.optional(),
  items: z.array(posItemSchema).min(1),
  payments: z
    .array(
      z.object({
        method: posPaymentMethodSchema,
        amount: moneySchema,
      }),
    )
    .min(1),
});

export const settleDebtSchema = z.object({
  amount: moneySchema.optional(),
  method: z.enum(['CASH', 'CARD', 'OTHER']).default('CASH'),
  notes: z.string().optional(),
});

export const collectDrawerSchema = z.object({
  cashierUserId: z.string().uuid(),
  notes: z.string().optional(),
});

export const holdOrderSchema = z.object({
  customerName: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(posItemSchema).min(1),
});

export const refundSaleSchema = z.object({
  reason: z.string().min(1),
  items: z
    .array(
      z.object({
        saleItemId: z.string().uuid(),
        quantity: moneySchema,
      }),
    )
    .optional(),
});

export const createExpenseSchema = z.object({
  categoryId: z.string().uuid(),
  amount: moneySchema,
  expenseDate: z.coerce.date(),
  description: z.string().min(1),
  paid: z.boolean().default(true),
  paymentMethod: z.enum(['CASH', 'CARD', 'BANK_TRANSFER', 'OTHER']).default('CASH'),
});

export const createEmployeeSchema = z.object({
  nameAr: z.string().min(1),
  nameEn: z.string().min(1),
  phone: z.string().optional(),
  jobTitleAr: z.string().optional(),
  jobTitleEn: z.string().optional(),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  roleId: z.string().uuid(),
  wageType: z.enum(['MONTHLY', 'DAILY', 'HOURLY']),
  monthlySalary: moneySchema.default('0'),
  dailyWage: moneySchema.default('0'),
  hourlyWage: moneySchema.default('0'),
  hiredAt: z.coerce.date().optional(),
});

export const salaryPaymentSchema = z.object({
  employeeId: z.string().uuid(),
  amount: moneySchema,
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  notes: z.string().optional(),
});

export const dateRangeSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
});

export type LoginDto = z.infer<typeof loginSchema>;
export type CreateUserDto = z.infer<typeof createUserSchema>;
export type CreateIngredientDto = z.infer<typeof createIngredientSchema>;
export type CreateProductDto = z.infer<typeof createProductSchema>;
export type CreateRecipeDto = z.infer<typeof createRecipeSchema>;
export type CreatePurchaseDto = z.infer<typeof createPurchaseSchema>;
export type PosCheckoutDto = z.infer<typeof posCheckoutSchema>;
export type SettleDebtDto = z.infer<typeof settleDebtSchema>;
export type CreateProductionDto = z.infer<typeof createProductionSchema>;
export type CompleteProductionDto = z.infer<typeof completeProductionSchema>;
export type RunProductionDto = z.infer<typeof runProductionSchema>;
export type CreateWasteDto = z.infer<typeof createWasteSchema>;
export type CreateExpenseDto = z.infer<typeof createExpenseSchema>;
export type CreateEmployeeDto = z.infer<typeof createEmployeeSchema>;
