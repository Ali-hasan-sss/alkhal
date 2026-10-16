import { Inject, Injectable } from '@nestjs/common';
import type { InventoryTransactionType, Prisma } from '@alkhal/database';
import {
  convertQuantity,
  d,
  isAtOrBelowReorderPoint,
  lineCost,
  roundMoney,
  roundQuantity,
  roundUnitCost,
  suggestedPurchaseQuantity,
  weightedAverageCost,
  type UnitConversionRecord,
} from '@alkhal/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Errors } from '../../common/errors';
import { NotificationsService } from '../notifications/notifications.service';

export type DbClient = Prisma.TransactionClient | PrismaService;

export interface InventoryChangeInput {
  restaurantId: string;
  ingredientId: string;
  type: InventoryTransactionType;
  quantityInDocumentUnit: Prisma.Decimal | string | number;
  documentUnitId: string;
  documentType: string;
  documentId: string;
  userId: string;
  notes?: string | null;
  incomingUnitCost?: Prisma.Decimal | string | number | null;
}

@Injectable()
export class InventoryService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  async loadConversions(restaurantId: string, db: DbClient): Promise<UnitConversionRecord[]> {
    const rows = await db.unitConversion.findMany({ where: { restaurantId } });
    return rows.map((r) => ({
      fromUnitId: r.fromUnitId,
      toUnitId: r.toUnitId,
      factor: r.factor.toString(),
      ingredientId: r.ingredientId,
    }));
  }

  async toBaseQuantity(
    restaurantId: string,
    ingredientId: string,
    quantity: Prisma.Decimal | string | number,
    unitId: string,
    db: DbClient,
    conversions?: UnitConversionRecord[],
  ) {
    const ingredient = await db.ingredient.findFirst({
      where: { id: ingredientId, restaurantId },
    });
    if (!ingredient) {
      throw Errors.notFound('Ingredient');
    }
    const conv = conversions ?? (await this.loadConversions(restaurantId, db));
    return {
      ingredient,
      quantityBase: convertQuantity(
        quantity.toString(),
        unitId,
        ingredient.baseUnitId,
        conv,
        ingredientId,
      ),
    };
  }

  async applyChange(input: InventoryChangeInput, db: DbClient) {
    const conversions = await this.loadConversions(input.restaurantId, db);
    const { ingredient, quantityBase } = await this.toBaseQuantity(
      input.restaurantId,
      input.ingredientId,
      input.quantityInDocumentUnit,
      input.documentUnitId,
      db,
      conversions,
    );

    const isIncoming = [
      'PURCHASE',
      'PRODUCTION_OUTPUT',
      'RETURN',
      'REFUND',
      'PURCHASE_REVERSAL',
    ].includes(input.type)
      ? d(quantityBase).greaterThan(0) || input.type === 'PURCHASE' || input.type === 'PRODUCTION_OUTPUT'
      : false;

    const signedQty = this.signedQuantity(input.type, quantityBase);
    const absQty = roundQuantity(d(signedQty).abs());

    const balance = await db.inventoryBalance.findUnique({
      where: {
        restaurantId_ingredientId: {
          restaurantId: input.restaurantId,
          ingredientId: input.ingredientId,
        },
      },
    });
    if (!balance) {
      throw Errors.notFound('InventoryBalance');
    }

    const currentQty = d(balance.quantity.toString());
    const currentAvg = d(balance.averageCost.toString());
    const newQty = roundQuantity(currentQty.plus(signedQty));

    if (newQty.lessThan(0)) {
      throw Errors.badRequest(
        'INSUFFICIENT_STOCK',
        `المخزون غير كافٍ للمادة ${ingredient.nameAr}`,
        `Insufficient stock for ${ingredient.nameEn}`,
      );
    }

    let unitCost = currentAvg;
    let newAvg = currentAvg;

    if (this.isInbound(input.type, signedQty)) {
      const incomingCost = roundUnitCost(input.incomingUnitCost ?? currentAvg);
      unitCost = incomingCost;
      newAvg = weightedAverageCost(currentQty, currentAvg, absQty, incomingCost);
    } else {
      unitCost = currentAvg;
    }

    if (newQty.isZero()) {
      newAvg = currentAvg;
    }

    const totalCost = roundMoney(absQty.times(unitCost));

    await db.inventoryTransaction.create({
      data: {
        restaurantId: input.restaurantId,
        ingredientId: input.ingredientId,
        type: input.type,
        quantity: signedQty.toString(),
        unitId: ingredient.baseUnitId,
        unitCost: unitCost.toString(),
        totalCost: totalCost.toString(),
        documentType: input.documentType,
        documentId: input.documentId,
        userId: input.userId,
        notes: input.notes ?? undefined,
      },
    });

    await db.inventoryBalance.update({
      where: { id: balance.id },
      data: {
        quantity: newQty.toString(),
        averageCost: roundUnitCost(newAvg).toString(),
      },
    });

    if (this.isInbound(input.type, signedQty) && input.type === 'PURCHASE') {
      await db.ingredient.update({
        where: { id: ingredient.id },
        data: {
          averageCost: roundUnitCost(newAvg).toString(),
          lastPurchaseCost: unitCost.toString(),
        },
      });
    } else {
      await db.ingredient.update({
        where: { id: ingredient.id },
        data: { averageCost: roundUnitCost(newAvg).toString() },
      });
    }

    if (signedQty.lessThan(0)) {
      await this.notifications.checkLowStock(
        {
          restaurantId: input.restaurantId,
          ingredient,
          currentQty: newQty,
        },
        db,
      );
    }

    return {
      quantityBase: signedQty,
      unitCost,
      totalCost,
      newQty,
      newAvg,
    };
  }

  private isInbound(type: InventoryTransactionType, signedQty: ReturnType<typeof d>): boolean {
    if (signedQty.greaterThan(0)) {
      return true;
    }
    return type === 'PURCHASE' || type === 'PRODUCTION_OUTPUT';
  }

  private signedQuantity(type: InventoryTransactionType, quantityBase: ReturnType<typeof d>) {
    const abs = d(quantityBase).abs();
    const inbound: InventoryTransactionType[] = [
      'PURCHASE',
      'PRODUCTION_OUTPUT',
      'RETURN',
      'REFUND',
      'STOCK_COUNT',
      'ADJUSTMENT',
      'TRANSFER',
    ];
    if (type === 'PURCHASE_REVERSAL' || type === 'PRODUCTION_REVERSAL') {
      return roundQuantity(d(quantityBase));
    }
    if (type === 'STOCK_COUNT' || type === 'ADJUSTMENT' || type === 'TRANSFER') {
      return roundQuantity(d(quantityBase));
    }
    if (
      type === 'SALE' ||
      type === 'PRODUCTION_CONSUMPTION' ||
      type === 'WASTE'
    ) {
      return roundQuantity(abs.negated());
    }
    if (inbound.includes(type)) {
      return roundQuantity(abs);
    }
    return roundQuantity(d(quantityBase));
  }

  snapshotCost(quantityBase: ReturnType<typeof d>, unitCost: ReturnType<typeof d>) {
    return lineCost(quantityBase, unitCost);
  }
}

export { isAtOrBelowReorderPoint, suggestedPurchaseQuantity };
