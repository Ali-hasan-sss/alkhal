import { PrismaClient, type Prisma } from '@prisma/client';
import { hash } from '@node-rs/argon2';

const prisma = new PrismaClient();

const PERMISSIONS: Array<{ code: string; nameAr: string; nameEn: string; module: string }> = [
  { code: 'settings.manage', nameAr: 'إدارة الإعدادات', nameEn: 'Manage settings', module: 'settings' },
  { code: 'users.manage', nameAr: 'إدارة المستخدمين', nameEn: 'Manage users', module: 'users' },
  { code: 'roles.manage', nameAr: 'إدارة الأدوار', nameEn: 'Manage roles', module: 'roles' },
  { code: 'sales.create', nameAr: 'إنشاء مبيعات', nameEn: 'Create sales', module: 'sales' },
  { code: 'sales.view', nameAr: 'عرض المبيعات', nameEn: 'View sales', module: 'sales' },
  { code: 'sales.refund', nameAr: 'استرجاع المبيعات', nameEn: 'Refund sales', module: 'sales' },
  { code: 'sales.cancel', nameAr: 'إلغاء المبيعات', nameEn: 'Cancel sales', module: 'sales' },
  { code: 'drawer.collect', nameAr: 'استلام الصندوق', nameEn: 'Collect cash drawer', module: 'sales' },
  { code: 'pos.access', nameAr: 'الوصول لنقطة البيع', nameEn: 'Access POS', module: 'pos' },
  { code: 'inventory.view', nameAr: 'عرض المخزون', nameEn: 'View inventory', module: 'inventory' },
  { code: 'inventory.adjust', nameAr: 'تعديل المخزون', nameEn: 'Adjust inventory', module: 'inventory' },
  { code: 'inventory.count', nameAr: 'جرد المخزون', nameEn: 'Count inventory', module: 'inventory' },
  { code: 'purchases.create', nameAr: 'إنشاء مشتريات', nameEn: 'Create purchases', module: 'purchases' },
  { code: 'purchases.view', nameAr: 'عرض المشتريات', nameEn: 'View purchases', module: 'purchases' },
  { code: 'purchases.post', nameAr: 'ترحيل المشتريات', nameEn: 'Post purchases', module: 'purchases' },
  { code: 'purchases.cancel', nameAr: 'إلغاء المشتريات', nameEn: 'Cancel purchases', module: 'purchases' },
  { code: 'suppliers.manage', nameAr: 'إدارة الموردين', nameEn: 'Manage suppliers', module: 'suppliers' },
  { code: 'production.create', nameAr: 'إنشاء إنتاج', nameEn: 'Create production', module: 'production' },
  { code: 'production.complete', nameAr: 'إتمام الإنتاج', nameEn: 'Complete production', module: 'production' },
  { code: 'production.cancel', nameAr: 'إلغاء الإنتاج', nameEn: 'Cancel production', module: 'production' },
  { code: 'recipes.manage', nameAr: 'إدارة الوصفات', nameEn: 'Manage recipes', module: 'recipes' },
  { code: 'products.manage', nameAr: 'إدارة المنتجات', nameEn: 'Manage products', module: 'products' },
  { code: 'ingredients.manage', nameAr: 'إدارة المواد', nameEn: 'Manage ingredients', module: 'ingredients' },
  { code: 'expenses.create', nameAr: 'إنشاء مصروف', nameEn: 'Create expenses', module: 'expenses' },
  { code: 'expenses.view', nameAr: 'عرض المصروفات', nameEn: 'View expenses', module: 'expenses' },
  { code: 'employees.manage', nameAr: 'إدارة الموظفين', nameEn: 'Manage employees', module: 'employees' },
  { code: 'employees.pay', nameAr: 'صرف الرواتب', nameEn: 'Pay employees', module: 'employees' },
  { code: 'reports.view', nameAr: 'عرض التقارير', nameEn: 'View reports', module: 'reports' },
  { code: 'debts.view', nameAr: 'عرض الديون', nameEn: 'View debts', module: 'debts' },
  { code: 'debts.settle', nameAr: 'تسديد الديون', nameEn: 'Settle debts', module: 'debts' },
  { code: 'audit.view', nameAr: 'عرض سجل التدقيق', nameEn: 'View audit log', module: 'audit' },
  { code: 'waste.create', nameAr: 'تسجيل هدر', nameEn: 'Create waste', module: 'waste' },
  { code: 'waste.view', nameAr: 'عرض الهدر', nameEn: 'View waste', module: 'waste' },
];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  OWNER: PERMISSIONS.map((p) => p.code),
  MANAGER: PERMISSIONS.map((p) => p.code).filter((c) => c !== 'roles.manage'),
  CASHIER: ['pos.access', 'sales.create', 'sales.view'],
  KITCHEN: ['production.create', 'production.complete', 'inventory.view', 'recipes.manage'],
  INVENTORY_MANAGER: [
    'inventory.view',
    'inventory.adjust',
    'inventory.count',
    'purchases.create',
    'purchases.view',
    'purchases.post',
    'suppliers.manage',
    'ingredients.manage',
    'waste.create',
    'waste.view',
    'production.create',
    'production.complete',
  ],
  ACCOUNTANT: [
    'reports.view',
    'expenses.create',
    'expenses.view',
    'purchases.view',
    'sales.view',
    'debts.view',
    'debts.settle',
    'employees.pay',
    'audit.view',
  ],
};

async function hashPassword(password: string) {
  return hash(password, {
    memoryCost: 19456,
    timeCost: 2,
    outputLen: 32,
    parallelism: 1,
  });
}

async function ensureCashierUser(restaurantId: string, passwordHash: string) {
  const cashierRole = await prisma.role.findFirst({ where: { restaurantId, code: 'CASHIER' } });
  if (!cashierRole) {
    return;
  }
  const email = 'cashier@alkhal.local';
  const existing = await prisma.user.findFirst({ where: { restaurantId, email } });
  if (existing) {
    return;
  }
  await prisma.user.create({
    data: {
      restaurantId,
      email,
      passwordHash,
      nameAr: 'كاشير',
      nameEn: 'Cashier',
      roleId: cashierRole.id,
    },
  });
  console.log('Created cashier user: cashier@alkhal.local / same seed password');
}

const DEMO_STOCK: Record<string, { quantity: number; averageCost: number }> = {
  'FLR-001': { quantity: 50000, averageCost: 0.004 },
  'MOZ-001': { quantity: 10000, averageCost: 0.035 },
  'CHK-001': { quantity: 15000, averageCost: 0.028 },
  'MET-001': { quantity: 8000, averageCost: 0.045 },
  'CHP-001': { quantity: 20000, averageCost: 0.008 },
  'TAH-001': { quantity: 5000, averageCost: 0.022 },
  'TOM-001': { quantity: 12000, averageCost: 0.006 },
  'CUC-001': { quantity: 8000, averageCost: 0.004 },
  'OIL-001': { quantity: 15000, averageCost: 0.012 },
  'SLT-001': { quantity: 3000, averageCost: 0.002 },
  'YST-001': { quantity: 1000, averageCost: 0.03 },
  'SPC-001': { quantity: 1000, averageCost: 0.04 },
  'GRL-001': { quantity: 1500, averageCost: 0.02 },
  'PCK-001': { quantity: 4000, averageCost: 0.008 },
  'BRD-001': { quantity: 80, averageCost: 1.5 },
  'WTR-001': { quantity: 100000, averageCost: 0 },
  'ORG-001': { quantity: 200, averageCost: 0.08 },
  'SAU-001': { quantity: 8000, averageCost: 0.01 },
  'PKG-001': { quantity: 200, averageCost: 0.4 },
  'CLB-001': { quantity: 48, averageCost: 3 },
  'WAT-BOT': { quantity: 48, averageCost: 2 },
};

async function ensureDemoStock(restaurantId: string) {
  const ingredients = await prisma.ingredient.findMany({
    where: { restaurantId, sku: { in: Object.keys(DEMO_STOCK) } },
    select: { id: true, sku: true },
  });
  for (const ingredient of ingredients) {
    const stock = DEMO_STOCK[ingredient.sku];
    if (!stock) {
      continue;
    }
    await prisma.ingredient.update({
      where: { id: ingredient.id },
      data: { averageCost: stock.averageCost, lastPurchaseCost: stock.averageCost },
    });
    await prisma.inventoryBalance.upsert({
      where: { ingredientId: ingredient.id },
      create: {
        restaurantId,
        ingredientId: ingredient.id,
        quantity: stock.quantity,
        averageCost: stock.averageCost,
      },
      update: {
        quantity: stock.quantity,
        averageCost: stock.averageCost,
      },
    });
  }
  console.log(`Demo stock loaded for ${ingredients.length} raw materials (prepared items stay at 0).`);
}

async function ensurePermissions(restaurantId: string) {
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      create: permission,
      update: {
        nameAr: permission.nameAr,
        nameEn: permission.nameEn,
        module: permission.module,
      },
    });
  }
  const permissionByCode = Object.fromEntries(
    (await prisma.permission.findMany()).map((row) => [row.code, row.id]),
  );
  const roles = await prisma.role.findMany({ where: { restaurantId } });
  for (const role of roles) {
    const codes = ROLE_PERMISSIONS[role.code];
    if (!codes) {
      continue;
    }
    for (const code of codes) {
      const permissionId = permissionByCode[code];
      if (!permissionId) {
        continue;
      }
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        create: { roleId: role.id, permissionId },
        update: {},
      });
    }
  }
}

async function main() {
  const existing = await prisma.restaurant.findFirst({ where: { nameEn: 'Al-Khal' } });
  const password = process.env.SEED_OWNER_PASSWORD ?? 'ChangeMe!123';
  const email = process.env.SEED_OWNER_EMAIL ?? 'owner@alkhal.local';
  const passwordHash = await hashPassword(password);
  if (existing) {
    await prisma.restaurant.update({
      where: { id: existing.id },
      data: { currency: 'SYP', currencySymbol: 'ل.س', timezone: 'Asia/Damascus' },
    });
    await ensureCashierUser(existing.id, passwordHash);
    await ensurePermissions(existing.id);
    await ensureDemoStock(existing.id);
    console.log('Restaurant already exists. Currency and demo stock refreshed.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    const restaurant = await tx.restaurant.create({
      data: {
        nameAr: 'الخال',
        nameEn: 'Al-Khal',
        currency: 'SYP',
        currencySymbol: 'ل.س',
        timezone: 'Asia/Damascus',
        locale: 'ar',
        overheadAllocationMethod: 'BY_REVENUE',
      },
    });

    const permissions = await Promise.all(
      PERMISSIONS.map((p) => tx.permission.create({ data: p })),
    );
    const permissionByCode = Object.fromEntries(permissions.map((p) => [p.code, p.id]));

    const roles = await Promise.all(
      (
        [
          { code: 'OWNER', nameAr: 'المالك', nameEn: 'Owner' },
          { code: 'MANAGER', nameAr: 'مدير', nameEn: 'Manager' },
          { code: 'CASHIER', nameAr: 'كاشير', nameEn: 'Cashier' },
          { code: 'KITCHEN', nameAr: 'مطبخ', nameEn: 'Kitchen' },
          { code: 'INVENTORY_MANAGER', nameAr: 'مدير مخزون', nameEn: 'Inventory manager' },
          { code: 'ACCOUNTANT', nameAr: 'محاسب', nameEn: 'Accountant' },
        ] as const
      ).map((role) =>
        tx.role.create({
          data: {
            restaurantId: restaurant.id,
            code: role.code,
            nameAr: role.nameAr,
            nameEn: role.nameEn,
            permissions: {
              create: ROLE_PERMISSIONS[role.code]!.map((code) => ({
                permissionId: permissionByCode[code]!,
              })),
            },
          },
        }),
      ),
    );
    const ownerRole = roles.find((r) => r.code === 'OWNER')!;
    const cashierRole = roles.find((r) => r.code === 'CASHIER')!;

    const owner = await tx.user.create({
      data: {
        restaurantId: restaurant.id,
        email,
        passwordHash,
        nameAr: 'المالك',
        nameEn: 'Owner',
        roleId: ownerRole.id,
      },
    });
    await tx.user.create({
      data: {
        restaurantId: restaurant.id,
        email: 'cashier@alkhal.local',
        passwordHash,
        nameAr: 'كاشير',
        nameEn: 'Cashier',
        roleId: cashierRole.id,
      },
    });

    const units = await createUnits(tx, restaurant.id);
    await createUnitConversions(tx, restaurant.id, units);

    const categories = await createCategories(tx, restaurant.id);
    await createExpenseCategories(tx, restaurant.id);
    await createWasteReasons(tx, restaurant.id);

    const ingredients = await createIngredients(tx, restaurant.id, units, categories);
    await createPreparedAndProducts(tx, restaurant.id, units, categories, ingredients);

    await tx.employee.create({
      data: {
        restaurantId: restaurant.id,
        userId: owner.id,
        nameAr: 'المالك',
        nameEn: 'Owner',
        jobTitleAr: 'مالك',
        jobTitleEn: 'Owner',
        wageType: 'MONTHLY',
        monthlySalary: 0,
        status: 'ACTIVE',
      },
    });

    await tx.supplier.create({
      data: {
        restaurantId: restaurant.id,
        nameAr: 'مورد عام',
        nameEn: 'General supplier',
        phone: '000000000',
      },
    });
  });

  console.log(`Seeded Al-Khal. Owner login: ${email}`);
}

type Tx = Prisma.TransactionClient;

async function createUnits(tx: Tx, restaurantId: string) {
  const defs = [
    { code: 'g', nameAr: 'غرام', nameEn: 'Gram', symbol: 'g', unitType: 'WEIGHT' as const, isSystem: true },
    { code: 'kg', nameAr: 'كيلوغرام', nameEn: 'Kilogram', symbol: 'kg', unitType: 'WEIGHT' as const, isSystem: true },
    { code: 'ml', nameAr: 'ملليلتر', nameEn: 'Milliliter', symbol: 'ml', unitType: 'VOLUME' as const, isSystem: true },
    { code: 'liter', nameAr: 'لتر', nameEn: 'Liter', symbol: 'L', unitType: 'VOLUME' as const, isSystem: true },
    { code: 'piece', nameAr: 'قطعة', nameEn: 'Piece', symbol: 'pcs', unitType: 'COUNT' as const, isSystem: true },
    { code: 'box', nameAr: 'علبة', nameEn: 'Box', symbol: 'box', unitType: 'COUNT' as const, isSystem: true },
    { code: 'pack', nameAr: 'ربطة', nameEn: 'Pack', symbol: 'pack', unitType: 'COUNT' as const, isSystem: true },
    { code: 'carton', nameAr: 'كرتونة', nameEn: 'Carton', symbol: 'ctn', unitType: 'COUNT' as const, isSystem: true },
    { code: 'bag', nameAr: 'كيس', nameEn: 'Bag', symbol: 'bag', unitType: 'COUNT' as const, isSystem: false },
  ];
  const created = await Promise.all(
    defs.map((u) => tx.unit.create({ data: { restaurantId, ...u } })),
  );
  return Object.fromEntries(created.map((u) => [u.code, u]));
}

async function createUnitConversions(
  tx: Tx,
  restaurantId: string,
  units: Record<string, { id: string }>,
) {
  await tx.unitConversion.createMany({
    data: [
      { restaurantId, fromUnitId: units.kg!.id, toUnitId: units.g!.id, factor: 1000 },
      { restaurantId, fromUnitId: units.liter!.id, toUnitId: units.ml!.id, factor: 1000 },
    ],
  });
}

async function createCategories(tx: Tx, restaurantId: string) {
  const defs = [
    { code: 'pizza', nameAr: 'بيتزا', nameEn: 'Pizza', sortOrder: 1 },
    { code: 'pastries', nameAr: 'معجنات', nameEn: 'Pastries', sortOrder: 2 },
    { code: 'falafel', nameAr: 'فلافل', nameEn: 'Falafel', sortOrder: 3 },
    { code: 'hummus', nameAr: 'حمص', nameEn: 'Hummus', sortOrder: 4 },
    { code: 'sandwiches', nameAr: 'سندويشات', nameEn: 'Sandwiches', sortOrder: 5 },
    { code: 'drinks', nameAr: 'مشروبات', nameEn: 'Drinks', sortOrder: 6 },
    { code: 'addons', nameAr: 'إضافات', nameEn: 'Add-ons', sortOrder: 7 },
    { code: 'raw', nameAr: 'مواد أولية', nameEn: 'Raw materials', sortOrder: 90 },
    { code: 'prepared', nameAr: 'مواد محضّرة', nameEn: 'Prepared materials', sortOrder: 91 },
  ];
  const created = await Promise.all(
    defs.map((c) => tx.category.create({ data: { restaurantId, ...c } })),
  );
  return Object.fromEntries(created.map((c) => [c.code, c]));
}

async function createExpenseCategories(tx: Tx, restaurantId: string) {
  const defs = [
    { code: 'electricity', nameAr: 'كهرباء', nameEn: 'Electricity' },
    { code: 'water', nameAr: 'ماء', nameEn: 'Water' },
    { code: 'rent', nameAr: 'إيجار', nameEn: 'Rent' },
    { code: 'salaries', nameAr: 'رواتب', nameEn: 'Salaries' },
    { code: 'gas', nameAr: 'غاز', nameEn: 'Gas' },
    { code: 'internet', nameAr: 'إنترنت', nameEn: 'Internet' },
    { code: 'maintenance', nameAr: 'صيانة', nameEn: 'Maintenance' },
    { code: 'cleaning', nameAr: 'تنظيف', nameEn: 'Cleaning' },
    { code: 'marketing', nameAr: 'تسويق', nameEn: 'Marketing' },
    { code: 'transportation', nameAr: 'مواصلات', nameEn: 'Transportation' },
    { code: 'packaging', nameAr: 'تغليف', nameEn: 'Packaging' },
    { code: 'other', nameAr: 'أخرى', nameEn: 'Other' },
  ];
  await tx.expenseCategory.createMany({
    data: defs.map((c) => ({ restaurantId, ...c })),
  });
}

async function createWasteReasons(tx: Tx, restaurantId: string) {
  const defs: Array<{ code: 'EXPIRED' | 'BURNED' | 'DAMAGED' | 'PREPARATION_WASTE' | 'SPOILED' | 'WRONG_ORDER' | 'SPILLAGE' | 'OTHER'; nameAr: string; nameEn: string }> = [
    { code: 'EXPIRED', nameAr: 'منتهي الصلاحية', nameEn: 'Expired' },
    { code: 'BURNED', nameAr: 'محروق', nameEn: 'Burned' },
    { code: 'DAMAGED', nameAr: 'تالف', nameEn: 'Damaged' },
    { code: 'PREPARATION_WASTE', nameAr: 'هدر تحضير', nameEn: 'Preparation waste' },
    { code: 'SPOILED', nameAr: 'فاسد', nameEn: 'Spoiled' },
    { code: 'WRONG_ORDER', nameAr: 'طلب خاطئ', nameEn: 'Wrong order' },
    { code: 'SPILLAGE', nameAr: 'انسكاب', nameEn: 'Spillage' },
    { code: 'OTHER', nameAr: 'أخرى', nameEn: 'Other' },
  ];
  await tx.wasteReason.createMany({
    data: defs.map((r) => ({ restaurantId, ...r })),
  });
}

async function createIngredients(
  tx: Tx,
  restaurantId: string,
  units: Record<string, { id: string }>,
  categories: Record<string, { id: string }>,
) {
  const raw = [
    { sku: 'FLR-001', nameAr: 'طحين', nameEn: 'Flour', unit: 'g', reorder: 5000, target: 25000, min: 3000 },
    { sku: 'MOZ-001', nameAr: 'موزاريلا', nameEn: 'Mozzarella', unit: 'g', reorder: 2000, target: 10000, min: 1500 },
    { sku: 'CHK-001', nameAr: 'دجاج', nameEn: 'Chicken', unit: 'g', reorder: 3000, target: 15000, min: 2000 },
    { sku: 'MET-001', nameAr: 'لحم', nameEn: 'Meat', unit: 'g', reorder: 2000, target: 8000, min: 1000 },
    { sku: 'CHP-001', nameAr: 'حمص حب', nameEn: 'Chickpeas', unit: 'g', reorder: 4000, target: 20000, min: 2500 },
    { sku: 'TAH-001', nameAr: 'طحينة', nameEn: 'Tahini', unit: 'g', reorder: 1000, target: 5000, min: 500 },
    { sku: 'TOM-001', nameAr: 'بندورة', nameEn: 'Tomato', unit: 'g', reorder: 3000, target: 12000, min: 2000 },
    { sku: 'CUC-001', nameAr: 'خيار', nameEn: 'Cucumber', unit: 'g', reorder: 2000, target: 8000, min: 1000 },
    { sku: 'OIL-001', nameAr: 'زيت', nameEn: 'Oil', unit: 'ml', reorder: 3000, target: 15000, min: 2000 },
    { sku: 'SLT-001', nameAr: 'ملح', nameEn: 'Salt', unit: 'g', reorder: 500, target: 3000, min: 200 },
    { sku: 'YST-001', nameAr: 'خميرة', nameEn: 'Yeast', unit: 'g', reorder: 200, target: 1000, min: 100 },
    { sku: 'SPC-001', nameAr: 'بهارات', nameEn: 'Spices', unit: 'g', reorder: 200, target: 1000, min: 100 },
    { sku: 'GRL-001', nameAr: 'ثوم', nameEn: 'Garlic', unit: 'g', reorder: 300, target: 1500, min: 150 },
    { sku: 'PCK-001', nameAr: 'مخلل', nameEn: 'Pickles', unit: 'g', reorder: 1000, target: 4000, min: 500 },
    { sku: 'BRD-001', nameAr: 'خبز', nameEn: 'Bread', unit: 'piece', reorder: 20, target: 80, min: 10 },
    { sku: 'WTR-001', nameAr: 'ماء', nameEn: 'Water', unit: 'ml', reorder: 0, target: 0, min: 0 },
    { sku: 'ORG-001', nameAr: 'زعتر بري / أوريجانو', nameEn: 'Oregano', unit: 'g', reorder: 50, target: 200, min: 20 },
    { sku: 'SAU-001', nameAr: 'صلصة بندورة جاهزة', nameEn: 'Tomato sauce base', unit: 'g', reorder: 2000, target: 8000, min: 1000 },
    { sku: 'PKG-001', nameAr: 'تغليف', nameEn: 'Packaging', unit: 'piece', reorder: 50, target: 200, min: 20 },
    { sku: 'CLB-001', nameAr: 'كولا', nameEn: 'Cola', unit: 'piece', reorder: 12, target: 48, min: 6 },
    { sku: 'WAT-BOT', nameAr: 'ماء معدني', nameEn: 'Bottled water', unit: 'piece', reorder: 12, target: 48, min: 6 },
  ];

  const created: Record<string, { id: string; sku: string; baseUnitId: string }> = {};
  for (const item of raw) {
    const type = item.sku.startsWith('PKG') ? 'PACKAGING' : 'RAW';
    const row = await tx.ingredient.create({
      data: {
        restaurantId,
        sku: item.sku,
        nameAr: item.nameAr,
        nameEn: item.nameEn,
        categoryId: categories.raw!.id,
        type,
        baseUnitId: units[item.unit]!.id,
        minimumStock: item.min,
        reorderPoint: item.reorder,
        targetStock: item.target,
        averageCost: DEMO_STOCK[item.sku]?.averageCost ?? 0,
        lastPurchaseCost: DEMO_STOCK[item.sku]?.averageCost ?? 0,
      },
    });
    created[item.sku] = row;
    await tx.inventoryBalance.create({
      data: {
        restaurantId,
        ingredientId: row.id,
        quantity: DEMO_STOCK[item.sku]?.quantity ?? 0,
        averageCost: DEMO_STOCK[item.sku]?.averageCost ?? 0,
      },
    });
  }

  await tx.unitConversion.createMany({
    data: [
      {
        restaurantId,
        fromUnitId: units.bag!.id,
        toUnitId: units.g!.id,
        factor: 25000,
        ingredientId: created['FLR-001']!.id,
      },
      {
        restaurantId,
        fromUnitId: units.carton!.id,
        toUnitId: units.liter!.id,
        factor: 12,
        ingredientId: created['OIL-001']!.id,
      },
    ],
  });

  return created;
}

async function createPreparedAndProducts(
  tx: Tx,
  restaurantId: string,
  units: Record<string, { id: string }>,
  categories: Record<string, { id: string }>,
  ingredients: Record<string, { id: string }>,
) {
  const dough = await tx.ingredient.create({
    data: {
      restaurantId,
      sku: 'PREP-DOUGH',
      nameAr: 'عجينة بيتزا',
      nameEn: 'Pizza dough',
      categoryId: categories.prepared!.id,
      type: 'PREPARED',
      baseUnitId: units.g!.id,
      minimumStock: 2000,
      reorderPoint: 3000,
      targetStock: 10000,
    },
  });
  const hummusMix = await tx.ingredient.create({
    data: {
      restaurantId,
      sku: 'PREP-HUMMUS',
      nameAr: 'خلطة حمص',
      nameEn: 'Hummus batch',
      categoryId: categories.prepared!.id,
      type: 'PREPARED',
      baseUnitId: units.g!.id,
      minimumStock: 1000,
      reorderPoint: 2000,
      targetStock: 8000,
    },
  });
  const tomatoSauce = await tx.ingredient.create({
    data: {
      restaurantId,
      sku: 'PREP-SAUCE',
      nameAr: 'صلصة بندورة',
      nameEn: 'Tomato sauce',
      categoryId: categories.prepared!.id,
      type: 'PREPARED',
      baseUnitId: units.g!.id,
      minimumStock: 500,
      reorderPoint: 1000,
      targetStock: 4000,
    },
  });
  const falafelMix = await tx.ingredient.create({
    data: {
      restaurantId,
      sku: 'PREP-FALAFEL',
      nameAr: 'خلطة فلافل',
      nameEn: 'Falafel mixture',
      categoryId: categories.prepared!.id,
      type: 'PREPARED',
      baseUnitId: units.g!.id,
      minimumStock: 1000,
      reorderPoint: 2000,
      targetStock: 8000,
    },
  });
  const garlicSauce = await tx.ingredient.create({
    data: {
      restaurantId,
      sku: 'PREP-GARLIC',
      nameAr: 'صلصة ثوم',
      nameEn: 'Garlic sauce',
      categoryId: categories.prepared!.id,
      type: 'PREPARED',
      baseUnitId: units.g!.id,
      minimumStock: 200,
      reorderPoint: 400,
      targetStock: 2000,
    },
  });

  for (const prep of [dough, hummusMix, tomatoSauce, falafelMix, garlicSauce]) {
    await tx.inventoryBalance.create({
      data: { restaurantId, ingredientId: prep.id, quantity: 0, averageCost: 0 },
    });
  }

  const doughRecipe = await tx.recipe.create({
    data: {
      restaurantId,
      nameAr: 'عجينة بيتزا 10كغ',
      nameEn: 'Pizza dough 10kg',
      outputIngredientId: dough.id,
      outputQuantity: 10000,
      outputUnitId: units.g!.id,
      wasteAllowancePercent: 2,
      items: {
        create: [
          { ingredientId: ingredients['FLR-001']!.id, quantity: 8000, unitId: units.g!.id },
          { ingredientId: ingredients['WTR-001']!.id, quantity: 4500, unitId: units.ml!.id },
          { ingredientId: ingredients['YST-001']!.id, quantity: 150, unitId: units.g!.id },
          { ingredientId: ingredients['SLT-001']!.id, quantity: 150, unitId: units.g!.id },
          { ingredientId: ingredients['OIL-001']!.id, quantity: 200, unitId: units.ml!.id },
        ],
      },
    },
  });

  const sauceRecipe = await tx.recipe.create({
    data: {
      restaurantId,
      nameAr: 'صلصة بيتزا',
      nameEn: 'Pizza sauce',
      outputIngredientId: tomatoSauce.id,
      outputQuantity: 4000,
      outputUnitId: units.g!.id,
      items: {
        create: [
          { ingredientId: ingredients['SAU-001']!.id, quantity: 3200, unitId: units.g!.id },
          { ingredientId: ingredients['TOM-001']!.id, quantity: 500, unitId: units.g!.id },
          { ingredientId: ingredients['GRL-001']!.id, quantity: 40, unitId: units.g!.id },
          { ingredientId: ingredients['OIL-001']!.id, quantity: 80, unitId: units.ml!.id },
          { ingredientId: ingredients['SLT-001']!.id, quantity: 20, unitId: units.g!.id },
          { ingredientId: ingredients['ORG-001']!.id, quantity: 10, unitId: units.g!.id },
        ],
      },
    },
  });

  await tx.recipe.create({
    data: {
      restaurantId,
      nameAr: 'صلصة ثوم',
      nameEn: 'Garlic sauce',
      outputIngredientId: garlicSauce.id,
      outputQuantity: 2000,
      outputUnitId: units.g!.id,
      items: {
        create: [
          { ingredientId: ingredients['GRL-001']!.id, quantity: 250, unitId: units.g!.id },
          { ingredientId: ingredients['OIL-001']!.id, quantity: 1200, unitId: units.ml!.id },
          { ingredientId: ingredients['SLT-001']!.id, quantity: 20, unitId: units.g!.id },
        ],
      },
    },
  });
  await tx.product.create({
    data: {
      restaurantId,
      sku: 'SAU-GAR',
      nameAr: 'صلصة ثوم',
      nameEn: 'Garlic sauce',
      categoryId: categories.addons!.id,
      inventoryMode: 'DIRECT',
      directIngredientId: garlicSauce.id,
      pricingMethod: 'FIXED_PRICE',
      sellingPrice: 6,
      sortOrder: 2,
    },
  });

  await tx.recipe.create({
    data: {
      restaurantId,
      nameAr: 'خلطة حمص',
      nameEn: 'Hummus batch',
      outputIngredientId: hummusMix.id,
      outputQuantity: 5000,
      outputUnitId: units.g!.id,
      items: {
        create: [
          { ingredientId: ingredients['CHP-001']!.id, quantity: 3000, unitId: units.g!.id },
          { ingredientId: ingredients['TAH-001']!.id, quantity: 800, unitId: units.g!.id },
          { ingredientId: ingredients['OIL-001']!.id, quantity: 200, unitId: units.ml!.id },
          { ingredientId: ingredients['GRL-001']!.id, quantity: 40, unitId: units.g!.id },
          { ingredientId: ingredients['SLT-001']!.id, quantity: 40, unitId: units.g!.id },
          { ingredientId: ingredients['WTR-001']!.id, quantity: 920, unitId: units.ml!.id },
        ],
      },
    },
  });

  await tx.product.create({
    data: {
      restaurantId,
      sku: 'PIZ-MAR',
      nameAr: 'بيتزا مارغريتا',
      nameEn: 'Margherita Pizza',
      categoryId: categories.pizza!.id,
      pricingMethod: 'GROSS_MARGIN_PERCENT',
      targetMarginPercent: 45,
      sellingPrice: 35,
      sortOrder: 1,
      components: {
        create: [
          { recipeId: doughRecipe.id, quantity: 250, unitId: units.g!.id, sortOrder: 0 },
          { recipeId: sauceRecipe.id, quantity: 80, unitId: units.g!.id, sortOrder: 1 },
          { ingredientId: ingredients['MOZ-001']!.id, quantity: 100, unitId: units.g!.id, sortOrder: 2 },
          { ingredientId: ingredients['OIL-001']!.id, quantity: 5, unitId: units.ml!.id, sortOrder: 3 },
          { ingredientId: ingredients['ORG-001']!.id, quantity: 1, unitId: units.g!.id, sortOrder: 4 },
          {
            ingredientId: ingredients['PKG-001']!.id,
            quantity: 1,
            unitId: units.piece!.id,
            isPackaging: true,
            sortOrder: 5,
          },
        ],
      },
    },
  });

  await tx.product.create({
    data: {
      restaurantId,
      sku: 'PIZ-CHK',
      nameAr: 'بيتزا دجاج',
      nameEn: 'Chicken Pizza',
      categoryId: categories.pizza!.id,
      pricingMethod: 'GROSS_MARGIN_PERCENT',
      targetMarginPercent: 45,
      sellingPrice: 42,
      sortOrder: 2,
      components: {
        create: [
          { recipeId: doughRecipe.id, quantity: 250, unitId: units.g!.id, sortOrder: 0 },
          { recipeId: sauceRecipe.id, quantity: 80, unitId: units.g!.id, sortOrder: 1 },
          { ingredientId: ingredients['MOZ-001']!.id, quantity: 90, unitId: units.g!.id, sortOrder: 2 },
          { ingredientId: ingredients['CHK-001']!.id, quantity: 120, unitId: units.g!.id, sortOrder: 3 },
          {
            ingredientId: ingredients['PKG-001']!.id,
            quantity: 1,
            unitId: units.piece!.id,
            isPackaging: true,
            sortOrder: 4,
          },
        ],
      },
    },
  });

  const falafelSandwich = await tx.product.create({
    data: {
      restaurantId,
      sku: 'SND-FAL',
      nameAr: 'سندويش فلافل',
      nameEn: 'Falafel Sandwich',
      categoryId: categories.falafel!.id,
      pricingMethod: 'GROSS_MARGIN_PERCENT',
      targetMarginPercent: 55,
      sellingPrice: 12,
      sortOrder: 1,
    },
  });
  await tx.recipe.create({
    data: {
      restaurantId,
      nameAr: 'وصفة سندويش فلافل',
      nameEn: 'Falafel sandwich recipe',
      productId: falafelSandwich.id,
      outputQuantity: 1,
      outputUnitId: units.piece!.id,
      items: {
        create: [
          { ingredientId: falafelMix.id, quantity: 120, unitId: units.g!.id },
          { ingredientId: ingredients['BRD-001']!.id, quantity: 1, unitId: units.piece!.id },
          { ingredientId: ingredients['TOM-001']!.id, quantity: 30, unitId: units.g!.id },
          { ingredientId: ingredients['CUC-001']!.id, quantity: 20, unitId: units.g!.id },
          { ingredientId: ingredients['PCK-001']!.id, quantity: 15, unitId: units.g!.id },
          { ingredientId: garlicSauce.id, quantity: 15, unitId: units.g!.id },
        ],
      },
    },
  });

  const hummus = await tx.product.create({
    data: {
      restaurantId,
      sku: 'HUM-001',
      nameAr: 'صحن حمص',
      nameEn: 'Hummus',
      categoryId: categories.hummus!.id,
      pricingMethod: 'GROSS_MARGIN_PERCENT',
      targetMarginPercent: 50,
      sellingPrice: 15,
      sortOrder: 1,
    },
  });
  await tx.recipe.create({
    data: {
      restaurantId,
      nameAr: 'وصفة صحن حمص',
      nameEn: 'Hummus plate recipe',
      productId: hummus.id,
      outputQuantity: 1,
      outputUnitId: units.piece!.id,
      items: {
        create: [
          { ingredientId: hummusMix.id, quantity: 200, unitId: units.g!.id },
          { ingredientId: ingredients['OIL-001']!.id, quantity: 10, unitId: units.ml!.id },
          { ingredientId: ingredients['BRD-001']!.id, quantity: 2, unitId: units.piece!.id },
        ],
      },
    },
  });

  const chickenSandwich = await tx.product.create({
    data: {
      restaurantId,
      sku: 'SND-CHK',
      nameAr: 'سندويش دجاج',
      nameEn: 'Chicken Sandwich',
      categoryId: categories.sandwiches!.id,
      pricingMethod: 'GROSS_MARGIN_PERCENT',
      targetMarginPercent: 50,
      sellingPrice: 18,
      sortOrder: 1,
    },
  });
  await tx.recipe.create({
    data: {
      restaurantId,
      nameAr: 'وصفة سندويش دجاج',
      nameEn: 'Chicken sandwich recipe',
      productId: chickenSandwich.id,
      outputQuantity: 1,
      outputUnitId: units.piece!.id,
      items: {
        create: [
          { ingredientId: ingredients['CHK-001']!.id, quantity: 150, unitId: units.g!.id },
          { ingredientId: ingredients['BRD-001']!.id, quantity: 1, unitId: units.piece!.id },
          { ingredientId: garlicSauce.id, quantity: 20, unitId: units.g!.id },
          { ingredientId: ingredients['PCK-001']!.id, quantity: 15, unitId: units.g!.id },
        ],
      },
    },
  });

  const pastry = await tx.product.create({
    data: {
      restaurantId,
      sku: 'PST-001',
      nameAr: 'معجنات',
      nameEn: 'Pastry',
      categoryId: categories.pastries!.id,
      pricingMethod: 'GROSS_MARGIN_PERCENT',
      targetMarginPercent: 50,
      sellingPrice: 8,
      sortOrder: 1,
    },
  });
  await tx.recipe.create({
    data: {
      restaurantId,
      nameAr: 'وصفة معجنات',
      nameEn: 'Pastry recipe',
      productId: pastry.id,
      outputQuantity: 1,
      outputUnitId: units.piece!.id,
      items: {
        create: [
          { ingredientId: ingredients['FLR-001']!.id, quantity: 80, unitId: units.g!.id },
          { ingredientId: ingredients['OIL-001']!.id, quantity: 10, unitId: units.ml!.id },
          { ingredientId: ingredients['MET-001']!.id, quantity: 40, unitId: units.g!.id },
        ],
      },
    },
  });

  await tx.product.create({
    data: {
      restaurantId,
      sku: 'DRK-COLA',
      nameAr: 'كولا',
      nameEn: 'Cola',
      categoryId: categories.drinks!.id,
      inventoryMode: 'DIRECT',
      directIngredientId: ingredients['CLB-001']!.id,
      pricingMethod: 'GROSS_MARGIN_PERCENT',
      targetMarginPercent: 35,
      sellingPrice: 5,
      sortOrder: 1,
    },
  });
  await tx.product.create({
    data: {
      restaurantId,
      sku: 'DRK-WAT',
      nameAr: 'ماء',
      nameEn: 'Water',
      categoryId: categories.drinks!.id,
      inventoryMode: 'DIRECT',
      directIngredientId: ingredients['WAT-BOT']!.id,
      pricingMethod: 'GROSS_MARGIN_PERCENT',
      targetMarginPercent: 35,
      sellingPrice: 3,
      sortOrder: 2,
    },
  });

  const extraCheese = await tx.product.create({
    data: {
      restaurantId,
      sku: 'ADD-CHS',
      nameAr: 'جبنة إضافية',
      nameEn: 'Extra cheese',
      categoryId: categories.addons!.id,
      type: 'ADDON',
      pricingMethod: 'FIXED_PRICE',
      sellingPrice: 4,
      sortOrder: 1,
    },
  });
  await tx.recipe.create({
    data: {
      restaurantId,
      nameAr: 'إضافة جبنة',
      nameEn: 'Extra cheese addon',
      productId: extraCheese.id,
      outputQuantity: 1,
      outputUnitId: units.piece!.id,
      items: {
        create: [{ ingredientId: ingredients['MOZ-001']!.id, quantity: 40, unitId: units.g!.id }],
      },
    },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
