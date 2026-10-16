import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@alkhal/database';
import { d, isAtOrBelowReorderPoint, suggestedPurchaseQuantity } from '@alkhal/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { DbClient } from '../inventory/inventory.service';

@Injectable()
export class NotificationsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async checkLowStock(
    params: {
      restaurantId: string;
      ingredient: { id: string; nameAr: string; nameEn: string; reorderPoint: Prisma.Decimal; targetStock: Prisma.Decimal };
      currentQty: ReturnType<typeof d>;
    },
    db: DbClient,
  ) {
    if (!isAtOrBelowReorderPoint(params.currentQty, params.ingredient.reorderPoint.toString())) {
      return;
    }
    const suggested = suggestedPurchaseQuantity(
      params.ingredient.targetStock.toString(),
      params.currentQty,
    );
    const recent = await db.notification.findFirst({
      where: {
        restaurantId: params.restaurantId,
        type: 'LOW_STOCK',
        entityId: params.ingredient.id,
        createdAt: { gte: new Date(Date.now() - 12 * 60 * 60 * 1000) },
      },
    });
    if (recent) {
      return;
    }
    await db.notification.create({
      data: {
        restaurantId: params.restaurantId,
        type: 'LOW_STOCK',
        entityType: 'Ingredient',
        entityId: params.ingredient.id,
        titleAr: `مخزون منخفض: ${params.ingredient.nameAr}`,
        titleEn: `Low Stock: ${params.ingredient.nameEn}`,
        bodyAr: `الحالي: ${params.currentQty.toString()} — حد الطلب: ${params.ingredient.reorderPoint.toString()} — الشراء المقترح: ${suggested.toString()}`,
        bodyEn: `Current: ${params.currentQty.toString()} — Reorder point: ${params.ingredient.reorderPoint.toString()} — Suggested purchase: ${suggested.toString()}`,
      },
    });
  }

  async list(restaurantId: string, unreadOnly = false) {
    return this.prisma.notification.findMany({
      where: {
        restaurantId,
        ...(unreadOnly ? { status: 'UNREAD' } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async markRead(restaurantId: string, id: string) {
    return this.prisma.notification.updateMany({
      where: { id, restaurantId },
      data: { status: 'READ' },
    });
  }
}
