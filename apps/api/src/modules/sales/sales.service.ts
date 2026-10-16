import { Inject, Injectable } from '@nestjs/common';
import {
  collectDrawerSchema,
  holdOrderSchema,
  posCheckoutSchema,
  refundSaleSchema,
  settleDebtSchema,
} from '@alkhal/validation';
import {
  calculateGrossProfit,
  calculateSaleLineTotal,
  calculateSaleTotals,
  convertQuantity,
  d,
  resolveSaleCustomerName,
  roundMoney,
} from '@alkhal/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { ProductionService } from '../production/production.service';
import { RecipesService } from '../recipes/recipes.service';
import { AuditService } from '../audit/audit.service';
import { Errors } from '../../common/errors';
import type { AuthUser } from '../../common/guards/jwt.strategy';

@Injectable()
export class SalesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(InventoryService) private readonly inventory: InventoryService,
    @Inject(ProductionService) private readonly production: ProductionService,
    @Inject(RecipesService) private readonly recipes: RecipesService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async catalog(restaurantId: string) {
    const [categories, products, prepareable] = await Promise.all([
      this.prisma.category.findMany({
        where: { restaurantId, active: true, code: { notIn: ['raw', 'prepared'] } },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.product.findMany({
        where: { restaurantId, active: true },
        include: {
          variants: { where: { active: true } },
          category: true,
          directIngredient: { include: { inventoryBalance: true } },
        },
        orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
      }),
      this.production.prepareableQuantities(restaurantId),
    ]);
    const availability = Object.fromEntries(
      products.map((product) => {
        if (product.inventoryMode === 'DIRECT' && product.directIngredient) {
          return [
            product.id,
            {
              mode: 'DIRECT',
              quantity: product.directIngredient.inventoryBalance?.quantity.toString() ?? '0',
            },
          ];
        }
        if (product.inventoryMode === 'RECIPE') {
          const hint = prepareable[product.id];
          const qty = hint?.prepareable ?? '0';
          return [
            product.id,
            {
              mode: 'RECIPE',
              // Sellable from current BOM stock (make-to-order). Prep is only for prepared materials.
              quantity: qty,
              prepareable: qty,
              limitingIngredient: hint?.limitingIngredient ?? null,
            },
          ];
        }
        return [product.id, { mode: product.inventoryMode, quantity: null }];
      }),
    );
    return { categories, products, availability };
  }

  async cashierDrawer(user: AuthUser) {
    const drawer = await this.drawerForUser(user.restaurantId, user.id);
    return {
      cashDue: drawer.cashDue,
      saleCount: drawer.saleCount,
      from: drawer.from.toISOString(),
      to: drawer.to.toISOString(),
      currencySymbol: drawer.currencySymbol,
    };
  }

  async cashiers(restaurantId: string) {
    return this.prisma.user.findMany({
      where: {
        restaurantId,
        OR: [
          { sales: { some: {} } },
          { role: { permissions: { some: { permission: { code: 'pos.access' } } } } },
        ],
      },
      select: { id: true, nameAr: true, role: { select: { code: true, nameAr: true } } },
      orderBy: { nameAr: 'asc' },
    });
  }

  async listDrawers(restaurantId: string) {
    const cashiers = await this.cashiers(restaurantId);
    const drawers = [];
    for (const cashier of cashiers) {
      const drawer = await this.drawerForUser(restaurantId, cashier.id);
      drawers.push({
        cashierUserId: cashier.id,
        cashierNameAr: cashier.nameAr,
        roleNameAr: cashier.role.nameAr,
        cashDue: drawer.cashDue,
        saleCount: drawer.saleCount,
        from: drawer.from.toISOString(),
        to: drawer.to.toISOString(),
        currencySymbol: drawer.currencySymbol,
      });
    }
    return drawers;
  }

  async collectDrawer(actor: AuthUser, input: unknown) {
    const dto = collectDrawerSchema.parse(input);
    const cashier = await this.prisma.user.findFirst({
      where: { id: dto.cashierUserId, restaurantId: actor.restaurantId },
    });
    if (!cashier) {
      throw Errors.notFound('User');
    }
    const drawer = await this.drawerForUser(actor.restaurantId, cashier.id);
    if (d(drawer.cashDue).lessThanOrEqualTo(0)) {
      throw Errors.badRequest('DRAWER_EMPTY', 'لا يوجد مبلغ صندوق لاستلامه', 'Cash drawer is empty');
    }
    const handover = await this.prisma.cashHandover.create({
      data: {
        restaurantId: actor.restaurantId,
        cashierUserId: cashier.id,
        receivedById: actor.id,
        amount: drawer.cashDue,
        saleCount: drawer.saleCount,
        periodFrom: drawer.from,
        periodTo: new Date(),
        notes: dto.notes,
      },
      include: {
        cashier: { select: { nameAr: true } },
        receivedBy: { select: { nameAr: true } },
      },
    });
    await this.audit.log({
      restaurantId: actor.restaurantId,
      userId: actor.id,
      action: 'CREATE',
      entity: 'CashHandover',
      entityId: handover.id,
      after: { cashierUserId: cashier.id, amount: drawer.cashDue },
    });
    return {
      ...handover,
      cashDue: '0',
    };
  }

  list(restaurantId: string, status?: string, userId?: string) {
    return this.prisma.sale.findMany({
      where: {
        restaurantId,
        ...(status ? { status: status as never } : { status: { not: 'DRAFT' } }),
        ...(userId ? { userId } : {}),
      },
      include: { items: true, payments: true, user: { select: { id: true, nameAr: true, nameEn: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async get(restaurantId: string, id: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id, restaurantId },
      include: { items: true, payments: true, user: { select: { nameAr: true, nameEn: true, email: true } } },
    });
    if (!sale) {
      throw Errors.notFound('Sale');
    }
    return sale;
  }

  async checkout(user: AuthUser, input: unknown) {
    const dto = posCheckoutSchema.parse(input);
    return this.prisma.$transaction(async (tx) => {
      const receiptNumber = await this.nextReceipt(user.restaurantId, tx);
      const built = await this.buildLines(user.restaurantId, dto.items, tx);
      const totals = calculateSaleTotals(
        built.lines.map((l) => ({
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discountAmount: l.discountAmount,
        })),
        dto.discountTotal,
      );
      const payTotal = dto.payments.reduce((acc, p) => acc.plus(d(p.amount)), d(0));
      if (roundMoney(payTotal).lessThan(totals.total)) {
        throw Errors.badRequest('PAYMENT_SHORT', 'المبلغ المدفوع أقل من الإجمالي', 'Payment is less than total');
      }

      const isDebt = dto.payments.some((payment) => payment.method === 'DEBT');
      const customerName = resolveSaleCustomerName(dto.customerName, isDebt);
      if (isDebt && !customerName) {
        throw Errors.badRequest(
          'CUSTOMER_NAME_REQUIRED',
          'اسم الزبون مطلوب عند البيع بالدين',
          'Customer name is required for credit sales',
        );
      }

      const sale = await tx.sale.create({
        data: {
          restaurantId: user.restaurantId,
          receiptNumber,
          status: 'COMPLETED',
          customerName,
          notes: dto.notes,
          subtotal: totals.subtotal.toString(),
          discountTotal: totals.discountTotal.toString(),
          total: totals.total.toString(),
          cogs: built.cogs.toString(),
          grossProfit: calculateGrossProfit(totals.total, built.cogs).toString(),
          userId: user.id,
          completedAt: new Date(),
          items: {
            create: built.lines.map((line) => ({
              productId: line.productId,
              variantId: line.variantId,
              nameAr: line.nameAr,
              nameEn: line.nameEn,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              discountAmount: line.discountAmount,
              lineTotal: line.lineTotal,
              unitCost: line.unitCost,
              lineCogs: line.lineCogs,
              lineGrossProfit: line.lineGrossProfit,
              notes: line.notes,
            })),
          },
          payments: {
            create: dto.payments.map((p) => ({
              method: p.method,
              amount: p.amount,
            })),
          },
        },
        include: { items: true, payments: true },
      });

      if (isDebt) {
        const debtAmount = dto.payments
          .filter((payment) => payment.method === 'DEBT')
          .reduce((acc, payment) => acc.plus(d(payment.amount)), d(0));
        await tx.customerDebt.create({
          data: {
            restaurantId: user.restaurantId,
            saleId: sale.id,
            customerName,
            amount: roundMoney(debtAmount).toString(),
            remainingAmount: roundMoney(debtAmount).toString(),
          },
        });
      }

      for (const explosion of built.explosions) {
        await this.inventory.applyChange(
          {
            restaurantId: user.restaurantId,
            ingredientId: explosion.ingredientId,
            type: 'SALE',
            quantityInDocumentUnit: explosion.quantityBase.toString(),
            documentUnitId: explosion.baseUnitId,
            documentType: 'Sale',
            documentId: sale.id,
            userId: user.id,
          },
          tx,
        );
      }

      await this.audit.log(
        {
          restaurantId: user.restaurantId,
          userId: user.id,
          action: 'SALE_COMPLETED',
          entity: 'Sale',
          entityId: sale.id,
          after: { total: sale.total.toString(), cogs: sale.cogs.toString() },
        },
        tx,
      );
      return sale;
    });
  }

  async hold(user: AuthUser, input: unknown) {
    const dto = holdOrderSchema.parse(input);
    const receiptNumber = await this.nextReceipt(user.restaurantId, this.prisma, 'H');
    const built = await this.buildLines(user.restaurantId, dto.items, this.prisma);
    const totals = calculateSaleTotals(
      built.lines.map((l) => ({
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discountAmount: l.discountAmount,
      })),
    );
    return this.prisma.sale.create({
      data: {
        restaurantId: user.restaurantId,
        receiptNumber,
        status: 'HELD',
        customerName: dto.customerName,
        notes: dto.notes,
        subtotal: totals.subtotal.toString(),
        discountTotal: totals.discountTotal.toString(),
        total: totals.total.toString(),
        userId: user.id,
        items: {
          create: built.lines.map((line) => ({
            productId: line.productId,
            variantId: line.variantId,
            nameAr: line.nameAr,
            nameEn: line.nameEn,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            discountAmount: line.discountAmount,
            lineTotal: line.lineTotal,
            unitCost: line.unitCost,
            lineCogs: line.lineCogs,
            lineGrossProfit: line.lineGrossProfit,
            notes: line.notes,
          })),
        },
      },
      include: { items: true },
    });
  }

  held(restaurantId: string) {
    return this.prisma.sale.findMany({
      where: { restaurantId, status: 'HELD' },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async recall(user: AuthUser, id: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id, restaurantId: user.restaurantId, status: 'HELD' },
      include: { items: true },
    });
    if (!sale) {
      throw Errors.notFound('HeldOrder');
    }
    return sale;
  }

  async cancel(user: AuthUser, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({
        where: { id, restaurantId: user.restaurantId },
        include: { items: true },
      });
      if (!sale) {
        throw Errors.notFound('Sale');
      }
      if (sale.status === 'HELD' || sale.status === 'DRAFT') {
        return tx.sale.update({
          where: { id },
          data: { status: 'CANCELLED', cancelledAt: new Date() },
        });
      }
      if (sale.status !== 'COMPLETED') {
        throw Errors.conflict('SALE_NOT_CANCELLABLE', 'لا يمكن إلغاء هذه الفاتورة', 'Sale cannot be cancelled');
      }
      await this.restoreInventory(user, sale.id, tx);
      await this.voidSaleDebt(user.restaurantId, sale.id, tx);
      const cancelled = await tx.sale.update({
        where: { id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      await this.audit.log(
        {
          restaurantId: user.restaurantId,
          userId: user.id,
          action: 'CANCEL',
          entity: 'Sale',
          entityId: id,
        },
        tx,
      );
      return cancelled;
    });
  }

  async refund(user: AuthUser, id: string, input: unknown) {
    const dto = refundSaleSchema.parse(input);
    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({
        where: { id, restaurantId: user.restaurantId, status: { in: ['COMPLETED', 'PARTIALLY_REFUNDED'] } },
      });
      if (!sale) {
        throw Errors.notFound('Sale');
      }
      await this.restoreInventory(user, sale.id, tx);
      await this.voidSaleDebt(user.restaurantId, sale.id, tx);
      const updated = await tx.sale.update({
        where: { id },
        data: { status: 'REFUNDED', notes: dto.reason },
      });
      await this.audit.log(
        {
          restaurantId: user.restaurantId,
          userId: user.id,
          action: 'REFUND',
          entity: 'Sale',
          entityId: id,
          after: { reason: dto.reason },
        },
        tx,
      );
      return updated;
    });
  }

  async listDebts(restaurantId: string, status?: string) {
    const debts = await this.prisma.customerDebt.findMany({
      where: {
        restaurantId,
        ...(status ? { status: status as 'OPEN' | 'SETTLED' | 'CANCELLED' } : {}),
      },
      include: {
        sale: {
          select: {
            receiptNumber: true,
            completedAt: true,
            total: true,
            user: { select: { nameAr: true } },
          },
        },
        settlements: {
          orderBy: { paidAt: 'desc' },
          include: { user: { select: { nameAr: true } } },
        },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });

    const customers = new Map<
      string,
      { customerName: string; remaining: ReturnType<typeof d>; amount: ReturnType<typeof d>; openCount: number }
    >();
    let outstanding = d(0);
    for (const debt of debts) {
      if (debt.status !== 'OPEN') {
        continue;
      }
      const remaining = d(debt.remainingAmount.toString());
      outstanding = outstanding.plus(remaining);
      const current = customers.get(debt.customerName) ?? {
        customerName: debt.customerName,
        remaining: d(0),
        amount: d(0),
        openCount: 0,
      };
      current.remaining = current.remaining.plus(remaining);
      current.amount = current.amount.plus(d(debt.amount.toString()));
      current.openCount += 1;
      customers.set(debt.customerName, current);
    }

    return {
      summary: {
        outstanding: roundMoney(outstanding).toString(),
        openCustomerCount: customers.size,
        openCount: [...customers.values()].reduce((sum, row) => sum + row.openCount, 0),
      },
      customers: [...customers.values()]
        .sort((a, b) => b.remaining.minus(a.remaining).toNumber())
        .map((row) => ({
          customerName: row.customerName,
          remaining: roundMoney(row.remaining).toString(),
          amount: roundMoney(row.amount).toString(),
          openCount: row.openCount,
        })),
      debts,
    };
  }

  async settleDebt(user: AuthUser, id: string, input: unknown) {
    const dto = settleDebtSchema.parse(input);
    return this.prisma.$transaction(async (tx) => {
      const debt = await tx.customerDebt.findFirst({
        where: { id, restaurantId: user.restaurantId },
      });
      if (!debt) {
        throw Errors.notFound('CustomerDebt');
      }
      if (debt.status !== 'OPEN') {
        throw Errors.conflict('DEBT_NOT_OPEN', 'هذا الدين غير مفتوح للتسديد', 'Debt is not open');
      }
      const remaining = d(debt.remainingAmount.toString());
      const pay = dto.amount ? d(dto.amount) : remaining;
      if (pay.lte(0)) {
        throw Errors.badRequest('INVALID_AMOUNT', 'مبلغ التسديد غير صالح', 'Settlement amount is invalid');
      }
      if (pay.gt(remaining)) {
        throw Errors.badRequest(
          'AMOUNT_EXCEEDS_DEBT',
          'المبلغ أكبر من المتبقي على الدين',
          'Amount exceeds remaining debt',
        );
      }
      const nextRemaining = roundMoney(remaining.minus(pay));
      const settled = nextRemaining.lte(0);
      await tx.customerDebtSettlement.create({
        data: {
          debtId: debt.id,
          amount: roundMoney(pay).toString(),
          method: dto.method,
          notes: dto.notes,
          userId: user.id,
        },
      });
      const updated = await tx.customerDebt.update({
        where: { id: debt.id },
        data: {
          remainingAmount: nextRemaining.toString(),
          status: settled ? 'SETTLED' : 'OPEN',
          settledAt: settled ? new Date() : null,
        },
        include: {
          sale: { select: { receiptNumber: true, completedAt: true, total: true } },
          settlements: { orderBy: { paidAt: 'desc' } },
        },
      });
      await this.audit.log(
        {
          restaurantId: user.restaurantId,
          userId: user.id,
          action: 'UPDATE',
          entity: 'CustomerDebt',
          entityId: debt.id,
          after: { amount: roundMoney(pay).toString(), remaining: nextRemaining.toString() },
        },
        tx,
      );
      return updated;
    });
  }

  private async voidSaleDebt(
    restaurantId: string,
    saleId: string,
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
  ) {
    await tx.customerDebt.updateMany({
      where: { restaurantId, saleId, status: 'OPEN' },
      data: { status: 'CANCELLED', remainingAmount: 0, settledAt: new Date() },
    });
  }

  private async restoreInventory(
    user: AuthUser,
    saleId: string,
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
  ) {
    const original = await tx.inventoryTransaction.findMany({
      where: { documentType: 'Sale', documentId: saleId, type: 'SALE' },
    });
    for (const row of original) {
      await this.inventory.applyChange(
        {
          restaurantId: user.restaurantId,
          ingredientId: row.ingredientId,
          type: 'REFUND',
          quantityInDocumentUnit: d(row.quantity.toString()).abs().toString(),
          documentUnitId: row.unitId,
          incomingUnitCost: row.unitCost.toString(),
          documentType: 'Sale',
          documentId: saleId,
          userId: user.id,
          notes: 'Refund/cancel restore',
        },
        tx,
      );
    }
  }

  private async nextReceipt(
    restaurantId: string,
    db: PrismaService | Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    prefix = 'S',
  ) {
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const start = `${prefix}-${day}-`;
    const last = await db.sale.findFirst({
      where: { restaurantId, receiptNumber: { startsWith: start } },
      orderBy: { receiptNumber: 'desc' },
    });
    const seq = last ? Number(last.receiptNumber.slice(start.length)) + 1 : 1;
    return `${start}${String(seq).padStart(4, '0')}`;
  }

  private async buildLines(
    restaurantId: string,
    items: Array<{
      productId: string;
      variantId?: string;
      quantity: string;
      discountAmount?: string;
      notes?: string;
      modifiers?: Array<{ productId: string; quantity: string }>;
    }>,
    db: PrismaService | Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
  ) {
    const conversions = await this.inventory.loadConversions(restaurantId, db);
    const lines: Array<{
      productId: string;
      variantId?: string;
      nameAr: string;
      nameEn: string;
      quantity: string;
      unitPrice: string;
      discountAmount: string;
      lineTotal: string;
      unitCost: string;
      lineCogs: string;
      lineGrossProfit: string;
      notes?: string;
    }> = [];
    const explosions: Array<{ ingredientId: string; quantityBase: ReturnType<typeof d>; baseUnitId: string }> = [];
    let cogs = d(0);

    const explode = async (productId: string, variantId: string | undefined, qty: ReturnType<typeof d>) => {
      const product = await db.product.findFirst({
        where: { id: productId, restaurantId },
        include: {
          recipes: { include: { items: { include: { ingredient: { include: { inventoryBalance: true } } } } } },
          directIngredient: { include: { inventoryBalance: true } },
        },
      });
      if (!product) {
        throw Errors.notFound('Product');
      }

      let lineCogs = d(0);
      if (product.inventoryMode === 'DIRECT' && product.directIngredient) {
        const ing = product.directIngredient;
        const unitCost = d((ing.inventoryBalance?.averageCost ?? ing.averageCost).toString());
        const qtyBase = qty;
        lineCogs = qtyBase.times(unitCost);
        explosions.push({ ingredientId: ing.id, quantityBase: qtyBase, baseUnitId: ing.baseUnitId });
      } else if (product.inventoryMode === 'RECIPE') {
        const bom = await this.recipes.productBom(restaurantId, product.id, db);
        const cost = await this.recipes.costProduct(restaurantId, product.id, db);
        const recipe = bom.source === 'RECIPE' ? bom.product.recipes?.[0] : null;
        // COMPONENTS lines are per sellable unit; RECIPE BOM is per batch outputQuantity.
        const scale =
          bom.source === 'RECIPE' && recipe
            ? qty.dividedBy(d(recipe.outputQuantity.toString() || '1'))
            : qty;
        for (const line of bom.lines) {
          const qtyBase = convertQuantity(
            d(line.quantity).times(scale).toString(),
            line.unitId,
            line.ingredient.baseUnitId,
            conversions,
            line.ingredientId,
          );
          explosions.push({
            ingredientId: line.ingredientId,
            quantityBase: qtyBase,
            baseUnitId: line.ingredient.baseUnitId,
          });
        }
        if (bom.source === 'RECIPE' && recipe) {
          const batchCost = d(cost.unitCost);
          const perUnit = batchCost.dividedBy(d(recipe.outputQuantity.toString() || '1'));
          lineCogs = perUnit.times(qty);
        } else {
          lineCogs = d(cost.unitCost).times(qty);
        }
      }
      return { product, lineCogs };
    };

    for (const item of items) {
      const qty = d(item.quantity);
      const { product, lineCogs } = await explode(item.productId, item.variantId, qty);
      let extraCogs = d(0);
      if (item.modifiers) {
        for (const mod of item.modifiers) {
          const exploded = await explode(mod.productId, undefined, d(mod.quantity).times(qty));
          extraCogs = extraCogs.plus(exploded.lineCogs);
        }
      }
      const variant = item.variantId
        ? await db.productVariant.findFirst({ where: { id: item.variantId, productId: product.id } })
        : null;
      const unitPrice = (variant?.sellingPrice ?? product.sellingPrice).toString();
      const discountAmount = item.discountAmount ?? '0';
      const lineTotal = calculateSaleLineTotal({
        quantity: qty,
        unitPrice,
        discountAmount,
      });
      const totalCogs = roundMoney(lineCogs.plus(extraCogs));
      cogs = cogs.plus(totalCogs);
      lines.push({
        productId: product.id,
        variantId: item.variantId,
        nameAr: variant?.nameAr ?? product.nameAr,
        nameEn: variant?.nameEn ?? product.nameEn,
        quantity: qty.toString(),
        unitPrice,
        discountAmount,
        lineTotal: lineTotal.toString(),
        unitCost: qty.isZero() ? '0' : totalCogs.dividedBy(qty).toString(),
        lineCogs: totalCogs.toString(),
        lineGrossProfit: calculateGrossProfit(lineTotal, totalCogs).toString(),
        notes: item.notes,
      });
    }

    return { lines, explosions, cogs: roundMoney(cogs) };
  }

  private async drawerForUser(restaurantId: string, userId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { timezone: true, currencySymbol: true },
    });
    const timeZone = restaurant?.timezone || 'Asia/Jerusalem';
    const dayStart = startOfZonedDay(timeZone);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const lastHandover = await this.prisma.cashHandover.findFirst({
      where: { restaurantId, cashierUserId: userId },
      orderBy: { createdAt: 'desc' },
    });
    const from =
      lastHandover && lastHandover.createdAt > dayStart ? lastHandover.createdAt : dayStart;
    const sales = await this.prisma.sale.findMany({
      where: {
        restaurantId,
        userId,
        status: 'COMPLETED',
        completedAt: { gte: from, lt: dayEnd },
      },
      include: { payments: true },
    });
    let cashDue = d(0);
    for (const sale of sales) {
      for (const payment of sale.payments) {
        if (payment.method === 'CASH') {
          cashDue = cashDue.plus(payment.amount.toString());
        }
      }
    }
    return {
      cashDue: roundMoney(cashDue).toString(),
      saleCount: sales.length,
      from,
      to: dayEnd,
      currencySymbol: restaurant?.currencySymbol || 'ل.س',
    };
  }
}

function zonedOffsetMs(date: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - date.getTime();
}

function startOfZonedDay(timeZone: string, now = new Date()) {
  const offset = zonedOffsetMs(now, timeZone);
  const zoned = new Date(now.getTime() + offset);
  const startUtc = Date.UTC(zoned.getUTCFullYear(), zoned.getUTCMonth(), zoned.getUTCDate());
  return new Date(startUtc - offset);
}
