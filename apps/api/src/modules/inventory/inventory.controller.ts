import { Body, Controller, Get, Param, Post, Query, UseGuards, Inject } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/guards/jwt.strategy';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import {
  createStockCountSchema,
  createWasteSchema,
  inventoryAdjustSchema,
  inventoryReceiveSchema,
} from '@alkhal/validation';
import { d, roundMoney } from '@alkhal/shared';
import { Errors } from '../../common/errors';
import { AuditService } from '../audit/audit.service';
import { displayCostPerKg, toConversionRecords } from '../../common/ingredient-cost';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InventoryController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(InventoryService) private readonly inventory: InventoryService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get('inventory')
  @RequirePermissions('inventory.view')
  async current(@CurrentUser() user: AuthUser) {
    const [rows, units, conversions] = await Promise.all([
      this.prisma.inventoryBalance.findMany({
        where: { restaurantId: user.restaurantId },
        include: {
          ingredient: { include: { baseUnit: true, category: true } },
        },
        orderBy: { ingredient: { nameAr: 'asc' } },
      }),
      this.prisma.unit.findMany({ where: { restaurantId: user.restaurantId } }),
      this.prisma.unitConversion.findMany({ where: { restaurantId: user.restaurantId } }),
    ]);
    const kg = units.find((u) => u.code === 'kg');
    const conv = toConversionRecords(conversions);
    return rows.map((row) => ({
      ...row,
      costPerKg: displayCostPerKg(row.averageCost, row.ingredient.baseUnit, kg, conv),
    }));
  }

  @Get('inventory/low-stock')
  @RequirePermissions('inventory.view')
  async lowStock(@CurrentUser() user: AuthUser) {
    const rows = await this.prisma.inventoryBalance.findMany({
      where: { restaurantId: user.restaurantId },
      include: { ingredient: { include: { baseUnit: true } } },
    });
    return rows.filter((row) =>
      d(row.quantity.toString()).lessThanOrEqualTo(d(row.ingredient.reorderPoint.toString())),
    );
  }

  @Get('inventory/movements')
  @RequirePermissions('inventory.view')
  movements(
    @CurrentUser() user: AuthUser,
    @Query('ingredientId') ingredientId?: string,
  ) {
    return this.prisma.inventoryTransaction.findMany({
      where: {
        restaurantId: user.restaurantId,
        ...(ingredientId ? { ingredientId } : {}),
      },
      include: {
        ingredient: true,
        user: { select: { nameAr: true, nameEn: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
  }

  @Post('inventory/adjust')
  @RequirePermissions('inventory.adjust')
  async adjust(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(inventoryAdjustSchema)) body: unknown,
  ) {
    const dto = inventoryAdjustSchema.parse(body);
    const ingredient = await this.prisma.ingredient.findFirst({
      where: { id: dto.ingredientId, restaurantId: user.restaurantId },
    });
    if (!ingredient) {
      throw Errors.notFound('Ingredient');
    }
    return this.prisma.$transaction(async (tx) => {
      const result = await this.inventory.applyChange(
        {
          restaurantId: user.restaurantId,
          ingredientId: dto.ingredientId,
          type: 'ADJUSTMENT',
          quantityInDocumentUnit: dto.quantity,
          documentUnitId: ingredient.baseUnitId,
          documentType: 'Adjustment',
          documentId: user.id,
          userId: user.id,
          notes: dto.notes,
        },
        tx,
      );
      await this.audit.log(
        {
          restaurantId: user.restaurantId,
          userId: user.id,
          action: 'STOCK_ADJUSTMENT',
          entity: 'Ingredient',
          entityId: dto.ingredientId,
          after: { quantity: dto.quantity, notes: dto.notes },
        },
        tx,
      );
      return result;
    });
  }

  @Post('inventory/receive')
  @RequirePermissions('inventory.adjust')
  async receive(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(inventoryReceiveSchema)) body: unknown,
  ) {
    const dto = inventoryReceiveSchema.parse(body);
    const ingredient = await this.prisma.ingredient.findFirst({
      where: { id: dto.ingredientId, restaurantId: user.restaurantId },
    });
    if (!ingredient) {
      throw Errors.notFound('Ingredient');
    }
    return this.prisma.$transaction(async (tx) => {
      const result = await this.inventory.applyChange(
        {
          restaurantId: user.restaurantId,
          ingredientId: dto.ingredientId,
          type: 'ADJUSTMENT',
          quantityInDocumentUnit: dto.quantity,
          documentUnitId: dto.unitId ?? ingredient.baseUnitId,
          incomingUnitCost: ingredient.averageCost.toString(),
          documentType: 'StockReceive',
          documentId: user.id,
          userId: user.id,
          notes: dto.notes || 'إضافة كمية للمخزون',
        },
        tx,
      );
      await this.audit.log(
        {
          restaurantId: user.restaurantId,
          userId: user.id,
          action: 'STOCK_ADJUSTMENT',
          entity: 'Ingredient',
          entityId: dto.ingredientId,
          after: { received: dto.quantity, notes: dto.notes },
        },
        tx,
      );
      return result;
    });
  }

  @Get('waste')
  @RequirePermissions('waste.view')
  waste(@CurrentUser() user: AuthUser) {
    return this.prisma.waste.findMany({
      where: { restaurantId: user.restaurantId },
      include: { ingredient: true, reason: true, unit: true, user: { select: { nameAr: true } } },
      orderBy: { occurredAt: 'desc' },
    });
  }

  @Get('waste/reasons')
  @RequirePermissions('waste.view')
  reasons(@CurrentUser() user: AuthUser) {
    return this.prisma.wasteReason.findMany({ where: { restaurantId: user.restaurantId } });
  }

  @Post('waste')
  @RequirePermissions('waste.create')
  async createWaste(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(createWasteSchema)) body: unknown,
  ) {
    const dto = createWasteSchema.parse(body);
    return this.prisma.$transaction(async (tx) => {
      const { ingredient, quantityBase } = await this.inventory.toBaseQuantity(
        user.restaurantId,
        dto.ingredientId,
        dto.quantity,
        dto.unitId,
        tx,
      );
      const balance = await tx.inventoryBalance.findUniqueOrThrow({
        where: {
          restaurantId_ingredientId: {
            restaurantId: user.restaurantId,
            ingredientId: dto.ingredientId,
          },
        },
      });
      const unitCost = d(balance.averageCost.toString());
      const totalCost = roundMoney(quantityBase.times(unitCost));
      const waste = await tx.waste.create({
        data: {
          restaurantId: user.restaurantId,
          ingredientId: dto.ingredientId,
          quantity: dto.quantity,
          unitId: dto.unitId,
          unitCost: unitCost.toString(),
          totalCost: totalCost.toString(),
          reasonId: dto.reasonId,
          notes: dto.notes,
          userId: user.id,
          occurredAt: dto.occurredAt ?? new Date(),
        },
      });
      await this.inventory.applyChange(
        {
          restaurantId: user.restaurantId,
          ingredientId: dto.ingredientId,
          type: 'WASTE',
          quantityInDocumentUnit: dto.quantity,
          documentUnitId: dto.unitId,
          documentType: 'Waste',
          documentId: waste.id,
          userId: user.id,
          notes: dto.notes,
        },
        tx,
      );
      return { ...waste, ingredientName: ingredient.nameAr };
    });
  }

  @Get('stock-counts')
  @RequirePermissions('inventory.count')
  counts(@CurrentUser() user: AuthUser) {
    return this.prisma.stockCount.findMany({
      where: { restaurantId: user.restaurantId },
      include: { items: true, user: { select: { nameAr: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post('stock-counts')
  @RequirePermissions('inventory.count')
  async createCount(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(createStockCountSchema)) body: unknown,
  ) {
    const dto = createStockCountSchema.parse(body);
    const balances = await this.prisma.inventoryBalance.findMany({
      where: { restaurantId: user.restaurantId },
      include: { ingredient: true },
    });
    const byId = Object.fromEntries(balances.map((b) => [b.ingredientId, b]));
    return this.prisma.stockCount.create({
      data: {
        restaurantId: user.restaurantId,
        notes: dto.notes,
        userId: user.id,
        status: 'COUNTED',
        countedAt: new Date(),
        items: {
          create: dto.items.map((item) => {
            const bal = byId[item.ingredientId];
            const system = d(bal?.quantity.toString() ?? 0);
            const actual = d(item.actualQuantity);
            const diff = actual.minus(system);
            const unitCost = d(bal?.averageCost.toString() ?? 0);
            return {
              ingredientId: item.ingredientId,
              unitId: bal?.ingredient.baseUnitId ?? item.ingredientId,
              systemQuantity: system.toString(),
              actualQuantity: actual.toString(),
              difference: diff.toString(),
              unitCost: unitCost.toString(),
              differenceCost: roundMoney(diff.times(unitCost)).toString(),
            };
          }),
        },
      },
      include: { items: true },
    });
  }

  @Post('stock-counts/:id/approve')
  @RequirePermissions('inventory.adjust')
  async approveCount(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.prisma.$transaction(async (tx) => {
      const count = await tx.stockCount.findFirst({
        where: { id, restaurantId: user.restaurantId },
        include: { items: { include: { ingredient: true } } },
      });
      if (!count) {
        throw Errors.notFound('StockCount');
      }
      if (count.status !== 'COUNTED') {
        throw Errors.conflict(
          'COUNT_NOT_COUNTED',
          'يجب اعتماد جرد بحالة تم العد فقط',
          'Only counted stock counts can be approved',
        );
      }
      for (const item of count.items) {
        if (d(item.difference.toString()).isZero()) {
          continue;
        }
        await this.inventory.applyChange(
          {
            restaurantId: user.restaurantId,
            ingredientId: item.ingredientId,
            type: 'STOCK_COUNT',
            quantityInDocumentUnit: item.difference.toString(),
            documentUnitId: item.unitId,
            documentType: 'StockCount',
            documentId: count.id,
            userId: user.id,
            notes: 'Physical count adjustment',
          },
          tx,
        );
      }
      const approved = await tx.stockCount.update({
        where: { id },
        data: { status: 'APPROVED', approvedAt: new Date() },
        include: { items: true },
      });
      await this.audit.log(
        {
          restaurantId: user.restaurantId,
          userId: user.id,
          action: 'STOCK_ADJUSTMENT',
          entity: 'StockCount',
          entityId: id,
        },
        tx,
      );
      return approved;
    });
  }

  @Post('stock-counts/:id/cancel')
  @RequirePermissions('inventory.count')
  async cancelCount(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const count = await this.prisma.stockCount.findFirst({
      where: { id, restaurantId: user.restaurantId },
    });
    if (!count) {
      throw Errors.notFound('StockCount');
    }
    if (count.status === 'APPROVED') {
      throw Errors.conflict(
        'COUNT_APPROVED',
        'لا يمكن إلغاء جرد معتمد',
        'Cannot cancel an approved count',
      );
    }
    return this.prisma.stockCount.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }
}
