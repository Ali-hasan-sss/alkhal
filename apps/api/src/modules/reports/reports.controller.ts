import { Controller, Get, Query, UseGuards, Inject } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/guards/jwt.strategy';
import { allocateOverhead, buildPricingResult, d, priceFromGrossMargin, roundMoney } from '@alkhal/shared';
import { RecipesService } from '../recipes/recipes.service';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReportsController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RecipesService) private readonly recipes: RecipesService,
  ) {}

  @Get('reports/dashboard')
  @RequirePermissions('reports.view')
  async dashboard(@CurrentUser() user: AuthUser) {
    const { start, end } = this.todayRange();
    const restaurantId = user.restaurantId;
    const [sales, expenses, waste, lowStock, restaurant] = await Promise.all([
      this.prisma.sale.findMany({
        where: {
          restaurantId,
          status: 'COMPLETED',
          completedAt: { gte: start, lte: end },
        },
        include: { items: { include: { product: { include: { category: true } } } } },
      }),
      this.prisma.expense.findMany({
        where: { restaurantId, expenseDate: { gte: start, lte: end } },
        include: { category: true },
      }),
      this.prisma.waste.findMany({
        where: { restaurantId, occurredAt: { gte: start, lte: end } },
      }),
      this.prisma.inventoryBalance.findMany({
        where: { restaurantId },
        include: { ingredient: { include: { baseUnit: true } } },
      }),
      this.prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId } }),
    ]);

    const revenue = sales.reduce((a, s) => a.plus(s.total.toString()), d(0));
    const cogs = sales.reduce((a, s) => a.plus(s.cogs.toString()), d(0));
    const gross = revenue.minus(cogs);
    const expenseTotal = expenses.reduce((a, e) => a.plus(e.amount.toString()), d(0));
    const net = gross.minus(expenseTotal);
    const wasteCost = waste.reduce((a, w) => a.plus(w.totalCost.toString()), d(0));

    const byCategory = new Map<string, { nameAr: string; nameEn: string; total: ReturnType<typeof d> }>();
    const byProduct = new Map<string, { nameAr: string; qty: ReturnType<typeof d>; total: ReturnType<typeof d>; profit: ReturnType<typeof d> }>();
    for (const sale of sales) {
      for (const item of sale.items) {
        const cat = item.product.category;
        const prevCat = byCategory.get(cat.id) ?? { nameAr: cat.nameAr, nameEn: cat.nameEn, total: d(0) };
        prevCat.total = prevCat.total.plus(item.lineTotal.toString());
        byCategory.set(cat.id, prevCat);
        const prevProd = byProduct.get(item.productId) ?? {
          nameAr: item.nameAr,
          qty: d(0),
          total: d(0),
          profit: d(0),
        };
        prevProd.qty = prevProd.qty.plus(item.quantity.toString());
        prevProd.total = prevProd.total.plus(item.lineTotal.toString());
        prevProd.profit = prevProd.profit.plus(item.lineGrossProfit.toString());
        byProduct.set(item.productId, prevProd);
      }
    }

    const low = lowStock.filter((b) =>
      d(b.quantity.toString()).lessThanOrEqualTo(d(b.ingredient.reorderPoint.toString())),
    );

    const trend = await this.salesTrend(restaurantId, 14);

    return {
      today: {
        sales: roundMoney(revenue).toString(),
        orders: sales.length,
        cogs: roundMoney(cogs).toString(),
        grossProfit: roundMoney(gross).toString(),
        expenses: roundMoney(expenseTotal).toString(),
        netProfit: roundMoney(net).toString(),
        waste: roundMoney(wasteCost).toString(),
      },
      salesByCategory: [...byCategory.values()].map((c) => ({
        ...c,
        total: roundMoney(c.total).toString(),
      })),
      topProducts: [...byProduct.values()]
        .sort((a, b) => b.total.comparedTo(a.total))
        .slice(0, 8)
        .map((p) => ({
          nameAr: p.nameAr,
          quantity: p.qty.toString(),
          total: roundMoney(p.total).toString(),
          profit: roundMoney(p.profit).toString(),
        })),
      expensesByCategory: this.groupExpenses(expenses),
      lowStock: low.map((b) => ({
        id: b.ingredient.id,
        nameAr: b.ingredient.nameAr,
        nameEn: b.ingredient.nameEn,
        quantity: b.quantity.toString(),
        reorderPoint: b.ingredient.reorderPoint.toString(),
        targetStock: b.ingredient.targetStock.toString(),
        unit: b.ingredient.baseUnit.symbol,
      })),
      trend,
      overheadAllocationMethod: restaurant.overheadAllocationMethod,
    };
  }

  @Get('reports/pnl')
  @RequirePermissions('reports.view')
  async pnl(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const range = this.parseRange(from, to);
    const [sales, expenses, restaurant] = await Promise.all([
      this.prisma.sale.findMany({
        where: {
          restaurantId: user.restaurantId,
          status: 'COMPLETED',
          completedAt: { gte: range.start, lte: range.end },
        },
      }),
      this.prisma.expense.findMany({
        where: { restaurantId: user.restaurantId, expenseDate: { gte: range.start, lte: range.end } },
        include: { category: true },
      }),
      this.prisma.restaurant.findUniqueOrThrow({ where: { id: user.restaurantId } }),
    ]);
    const revenue = sales.reduce((a, s) => a.plus(s.total.toString()), d(0));
    const cogs = sales.reduce((a, s) => a.plus(s.cogs.toString()), d(0));
    const gross = revenue.minus(cogs);
    const opex = expenses.reduce((a, e) => a.plus(e.amount.toString()), d(0));
    return {
      from: range.start,
      to: range.end,
      revenue: roundMoney(revenue).toString(),
      cogs: roundMoney(cogs).toString(),
      grossProfit: roundMoney(gross).toString(),
      operatingExpenses: roundMoney(opex).toString(),
      netOperatingProfit: roundMoney(gross.minus(opex)).toString(),
      allocationMethod: restaurant.overheadAllocationMethod,
      expenses: this.groupExpenses(expenses),
    };
  }

  @Get('reports/sales')
  @RequirePermissions('reports.view')
  async salesReport(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const range = this.parseRange(from, to);
    const sales = await this.prisma.sale.findMany({
      where: {
        restaurantId: user.restaurantId,
        status: 'COMPLETED',
        completedAt: { gte: range.start, lte: range.end },
      },
      include: {
        items: { include: { product: { include: { category: true } } } },
        payments: true,
        user: { select: { nameAr: true, nameEn: true } },
      },
    });
    const byPayment = new Map<string, ReturnType<typeof d>>();
    const byEmployee = new Map<string, ReturnType<typeof d>>();
    for (const sale of sales) {
      for (const p of sale.payments) {
        byPayment.set(p.method, (byPayment.get(p.method) ?? d(0)).plus(p.amount.toString()));
      }
      const name = sale.user.nameAr;
      byEmployee.set(name, (byEmployee.get(name) ?? d(0)).plus(sale.total.toString()));
    }
    return {
      count: sales.length,
      byPayment: [...byPayment.entries()].map(([method, total]) => ({
        method,
        total: roundMoney(total).toString(),
      })),
      byEmployee: [...byEmployee.entries()].map(([name, total]) => ({
        name,
        total: roundMoney(total).toString(),
      })),
      sales,
    };
  }

  @Get('reports/inventory-valuation')
  @RequirePermissions('reports.view')
  async valuation(@CurrentUser() user: AuthUser) {
    const rows = await this.prisma.inventoryBalance.findMany({
      where: { restaurantId: user.restaurantId },
      include: { ingredient: { include: { baseUnit: true } } },
    });
    const items = rows.map((r) => {
      const value = d(r.quantity.toString()).times(d(r.averageCost.toString()));
      return {
        ingredientId: r.ingredientId,
        nameAr: r.ingredient.nameAr,
        nameEn: r.ingredient.nameEn,
        quantity: r.quantity.toString(),
        averageCost: r.averageCost.toString(),
        value: roundMoney(value).toString(),
        unit: r.ingredient.baseUnit.symbol,
      };
    });
    const total = items.reduce((a, i) => a.plus(i.value), d(0));
    return { total: roundMoney(total).toString(), items };
  }

  @Get('reports/product-costs')
  @RequirePermissions('reports.view')
  async productCosts(@CurrentUser() user: AuthUser) {
    const products = await this.prisma.product.findMany({
      where: { restaurantId: user.restaurantId, active: true },
      include: { category: true },
    });
    const overhead = await this.recipes.overheadPerUnit(user.restaurantId);
    const result = [];
    for (const product of products) {
      const cost = await this.recipes.costProduct(user.restaurantId, product.id);
      const overheadPerUnit = overhead.perUnit.get(product.id) ?? overhead.avgPerUnit;
      const fullCost = d(cost.unitCost.toString()).plus(overheadPerUnit);
      const targetMargin = Number(product.targetMarginPercent.toString()) > 0 ? product.targetMarginPercent.toString() : '40';
      const pricing = buildPricingResult(fullCost.toString(), product.sellingPrice.toString(), product.pricingMethod, {
        markupPercent: product.markupPercent.toString(),
        targetMarginPercent: targetMargin,
      });
      result.push({
        id: product.id,
        nameAr: product.nameAr,
        nameEn: product.nameEn,
        category: product.category.nameAr,
        cost: cost.unitCost.toString(),
        materialCost: cost.materialCost.toString(),
        packagingCost: cost.packagingCost.toString(),
        overheadPerUnit: roundMoney(overheadPerUnit).toString(),
        fullCost: roundMoney(fullCost).toString(),
        sellingPrice: product.sellingPrice.toString(),
        suggestedPrice: pricing.suggestedPrice.toString(),
        recommendedPrice: priceFromGrossMargin(fullCost, targetMargin).toString(),
        pricingMethod: product.pricingMethod,
        targetMarginPercent: product.targetMarginPercent.toString(),
        markupPercent: product.markupPercent.toString(),
        operatingProfit: roundMoney(d(product.sellingPrice.toString()).minus(fullCost)).toString(),
      });
    }
    return { overhead: { from: overhead.from, to: overhead.to, method: overhead.method, totalOverhead: overhead.totalOverhead }, products: result };
  }

  @Get('reports/overhead')
  @RequirePermissions('reports.view')
  async overhead(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const range = this.parseRange(from, to);
    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: user.restaurantId },
    });
    const [expenses, sales] = await Promise.all([
      this.prisma.expense.findMany({
        where: { restaurantId: user.restaurantId, expenseDate: { gte: range.start, lte: range.end } },
      }),
      this.prisma.sale.findMany({
        where: {
          restaurantId: user.restaurantId,
          status: 'COMPLETED',
          completedAt: { gte: range.start, lte: range.end },
        },
        include: { items: { include: { product: { include: { category: true } } } } },
      }),
    ]);
    const totalOverhead = expenses.reduce((a, e) => a.plus(e.amount.toString()), d(0));
    const sharesMap = new Map<
      string,
      { key: string; nameAr: string; revenue: ReturnType<typeof d>; quantity: ReturnType<typeof d>; directCost: ReturnType<typeof d> }
    >();
    for (const sale of sales) {
      for (const item of sale.items) {
        const key = item.product.categoryId;
        const prev = sharesMap.get(key) ?? {
          key,
          nameAr: item.product.category.nameAr,
          revenue: d(0),
          quantity: d(0),
          directCost: d(0),
        };
        prev.revenue = prev.revenue.plus(item.lineTotal.toString());
        prev.quantity = prev.quantity.plus(item.quantity.toString());
        prev.directCost = prev.directCost.plus(item.lineCogs.toString());
        sharesMap.set(key, prev);
      }
    }
    const shares = [...sharesMap.values()];
    const allocated = allocateOverhead(totalOverhead, restaurant.overheadAllocationMethod, shares);
    return {
      method: restaurant.overheadAllocationMethod,
      totalOverhead: roundMoney(totalOverhead).toString(),
      allocations: shares.map((s) => ({
        category: s.nameAr,
        amount: (allocated.get(s.key) ?? d(0)).toString(),
      })),
    };
  }

  @Get('reports/payables')
  @RequirePermissions('reports.view')
  async payables(@CurrentUser() user: AuthUser) {
    const purchases = await this.prisma.purchase.findMany({
      where: {
        restaurantId: user.restaurantId,
        status: { in: ['POSTED', 'PARTIALLY_PAID'] },
      },
      include: { supplier: true },
    });
    const total = purchases.reduce((a, p) => a.plus(p.remaining.toString()), d(0));
    return { total: roundMoney(total).toString(), purchases };
  }

  private groupExpenses(
    expenses: Array<{ amount: { toString(): string }; category: { nameAr: string; nameEn: string } }>,
  ) {
    const map = new Map<string, { nameAr: string; nameEn: string; total: ReturnType<typeof d> }>();
    for (const e of expenses) {
      const prev = map.get(e.category.nameAr) ?? {
        nameAr: e.category.nameAr,
        nameEn: e.category.nameEn,
        total: d(0),
      };
      prev.total = prev.total.plus(e.amount.toString());
      map.set(e.category.nameAr, prev);
    }
    return [...map.values()].map((x) => ({ ...x, total: roundMoney(x.total).toString() }));
  }

  private async salesTrend(restaurantId: string, days: number) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));
    const sales = await this.prisma.sale.findMany({
      where: { restaurantId, status: 'COMPLETED', completedAt: { gte: start } },
    });
    const buckets = new Map<string, { sales: ReturnType<typeof d>; profit: ReturnType<typeof d> }>();
    for (let i = 0; i < days; i++) {
      const dte = new Date(start);
      dte.setDate(start.getDate() + i);
      buckets.set(dte.toISOString().slice(0, 10), { sales: d(0), profit: d(0) });
    }
    for (const sale of sales) {
      const key = sale.completedAt?.toISOString().slice(0, 10);
      if (!key || !buckets.has(key)) {
        continue;
      }
      const bucket = buckets.get(key)!;
      bucket.sales = bucket.sales.plus(sale.total.toString());
      bucket.profit = bucket.profit.plus(sale.grossProfit.toString());
    }
    return [...buckets.entries()].map(([date, v]) => ({
      date,
      sales: roundMoney(v.sales).toString(),
      profit: roundMoney(v.profit).toString(),
    }));
  }

  private todayRange() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  private parseRange(from?: string, to?: string) {
    const start = from ? new Date(from) : this.todayRange().start;
    const end = to ? new Date(to) : this.todayRange().end;
    return { start, end };
  }
}
