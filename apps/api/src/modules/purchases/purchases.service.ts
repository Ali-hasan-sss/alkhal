import { Inject, Injectable } from '@nestjs/common';
import {
  createPurchaseSchema,
  supplierPaymentSchema,
} from '@alkhal/validation';
import { calculatePurchaseLineTotal, d, roundMoney } from '@alkhal/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { AuditService } from '../audit/audit.service';
import { Errors } from '../../common/errors';
import type { AuthUser } from '../../common/guards/jwt.strategy';

@Injectable()
export class PurchasesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(InventoryService) private readonly inventory: InventoryService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  list(restaurantId: string) {
    return this.prisma.purchase.findMany({
      where: { restaurantId },
      include: { supplier: true, items: true },
      orderBy: { invoiceDate: 'desc' },
    });
  }

  async get(restaurantId: string, id: string) {
    const purchase = await this.prisma.purchase.findFirst({
      where: { id, restaurantId },
      include: {
        supplier: true,
        items: { include: { ingredient: true, unit: true } },
        payments: true,
      },
    });
    if (!purchase) {
      throw Errors.notFound('Purchase');
    }
    return purchase;
  }

  async create(user: AuthUser, input: unknown) {
    const dto = createPurchaseSchema.parse(input);
    const totals = this.computeTotals(dto.items);
    const purchase = await this.prisma.purchase.create({
      data: {
        restaurantId: user.restaurantId,
        supplierId: dto.supplierId,
        invoiceNumber: dto.invoiceNumber,
        invoiceDate: dto.invoiceDate,
        dueDate: dto.dueDate,
        notes: dto.notes,
        userId: user.id,
        ...totals,
        remaining: totals.total,
        items: {
          create: dto.items.map((item) => ({
            ingredientId: item.ingredientId,
            quantity: item.quantity,
            unitId: item.unitId,
            unitCost: item.unitCost,
            discountAmount: item.discountAmount ?? '0',
            taxAmount: item.taxAmount ?? '0',
            lineTotal: calculatePurchaseLineTotal(
              item.quantity,
              item.unitCost,
              item.discountAmount,
              item.taxAmount,
            ).toString(),
          })),
        },
      },
      include: { items: true },
    });
    await this.audit.log({
      restaurantId: user.restaurantId,
      userId: user.id,
      action: 'CREATE',
      entity: 'Purchase',
      entityId: purchase.id,
    });
    return purchase;
  }

  async post(user: AuthUser, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findFirst({
        where: { id, restaurantId: user.restaurantId },
        include: { items: true },
      });
      if (!purchase) {
        throw Errors.notFound('Purchase');
      }
      if (purchase.status !== 'DRAFT') {
        throw Errors.conflict(
          'PURCHASE_NOT_DRAFT',
          'لا يمكن ترحيل فاتورة غير مسودة',
          'Only draft purchases can be posted',
        );
      }

      for (const item of purchase.items) {
        const conversions = await this.inventory.loadConversions(user.restaurantId, tx);
        const { quantityBase } = await this.inventory.toBaseQuantity(
          user.restaurantId,
          item.ingredientId,
          item.quantity,
          item.unitId,
          tx,
          conversions,
        );
        const netLine = d(item.lineTotal.toString()).minus(item.taxAmount.toString());
        const incomingUnitCost = quantityBase.isZero()
          ? d(0)
          : netLine.dividedBy(quantityBase);
        await this.inventory.applyChange(
          {
            restaurantId: user.restaurantId,
            ingredientId: item.ingredientId,
            type: 'PURCHASE',
            quantityInDocumentUnit: item.quantity.toString(),
            documentUnitId: item.unitId,
            incomingUnitCost: incomingUnitCost.toString(),
            documentType: 'Purchase',
            documentId: purchase.id,
            userId: user.id,
          },
          tx,
        );
      }

      const posted = await tx.purchase.update({
        where: { id },
        data: {
          status: purchase.paid.equals(purchase.total)
            ? 'PAID'
            : d(purchase.paid.toString()).greaterThan(0)
              ? 'PARTIALLY_PAID'
              : 'POSTED',
          postedAt: new Date(),
        },
        include: { items: true, supplier: true },
      });

      await this.audit.log(
        {
          restaurantId: user.restaurantId,
          userId: user.id,
          action: 'PURCHASE_POSTED',
          entity: 'Purchase',
          entityId: id,
          after: { total: posted.total.toString() },
        },
        tx,
      );
      return posted;
    });
  }

  async cancel(user: AuthUser, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findFirst({
        where: { id, restaurantId: user.restaurantId },
        include: { items: true },
      });
      if (!purchase) {
        throw Errors.notFound('Purchase');
      }
      if (purchase.status === 'DRAFT') {
        return tx.purchase.update({
          where: { id },
          data: { status: 'CANCELLED', cancelledAt: new Date() },
        });
      }
      if (purchase.status === 'CANCELLED') {
        throw Errors.conflict(
          'PURCHASE_CANCELLED',
          'الفاتورة ملغاة مسبقاً',
          'Purchase already cancelled',
        );
      }

      for (const item of purchase.items) {
        await this.inventory.applyChange(
          {
            restaurantId: user.restaurantId,
            ingredientId: item.ingredientId,
            type: 'PURCHASE_REVERSAL',
            quantityInDocumentUnit: d(item.quantity.toString()).negated().toString(),
            documentUnitId: item.unitId,
            documentType: 'Purchase',
            documentId: purchase.id,
            userId: user.id,
            notes: 'Purchase cancellation reversal',
          },
          tx,
        );
      }

      const cancelled = await tx.purchase.update({
        where: { id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      await this.audit.log(
        {
          restaurantId: user.restaurantId,
          userId: user.id,
          action: 'CANCEL',
          entity: 'Purchase',
          entityId: id,
        },
        tx,
      );
      return cancelled;
    });
  }

  async pay(user: AuthUser, purchaseId: string, input: unknown) {
    const dto = supplierPaymentSchema.parse(input);
    return this.prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findFirst({
        where: { id: purchaseId, restaurantId: user.restaurantId },
      });
      if (!purchase) {
        throw Errors.notFound('Purchase');
      }
      if (purchase.status === 'DRAFT' || purchase.status === 'CANCELLED') {
        throw Errors.badRequest(
          'PURCHASE_NOT_POSTED',
          'لا يمكن الدفع لفاتورة غير مرحلة',
          'Purchase must be posted before payment',
        );
      }
      const amount = roundMoney(dto.amount);
      const newPaid = roundMoney(d(purchase.paid.toString()).plus(amount));
      if (newPaid.greaterThan(d(purchase.total.toString()))) {
        throw Errors.badRequest('OVERPAY', 'المبلغ أكبر من المتبقي', 'Payment exceeds remaining');
      }
      const remaining = roundMoney(d(purchase.total.toString()).minus(newPaid));
      await tx.supplierPayment.create({
        data: {
          restaurantId: user.restaurantId,
          supplierId: purchase.supplierId,
          purchaseId: purchase.id,
          amount: amount.toString(),
          method: dto.method,
          paidAt: dto.paidAt ?? new Date(),
          notes: dto.notes,
        },
      });
      return tx.purchase.update({
        where: { id: purchaseId },
        data: {
          paid: newPaid.toString(),
          remaining: remaining.toString(),
          status: remaining.isZero() ? 'PAID' : 'PARTIALLY_PAID',
        },
      });
    });
  }

  private computeTotals(
    items: Array<{
      quantity: string;
      unitCost: string;
      discountAmount?: string;
      taxAmount?: string;
    }>,
  ) {
    let subtotal = d(0);
    let discountTotal = d(0);
    let taxTotal = d(0);
    for (const item of items) {
      const gross = d(item.quantity).times(d(item.unitCost));
      subtotal = subtotal.plus(gross);
      discountTotal = discountTotal.plus(d(item.discountAmount ?? 0));
      taxTotal = taxTotal.plus(d(item.taxAmount ?? 0));
    }
    const total = roundMoney(subtotal.minus(discountTotal).plus(taxTotal));
    return {
      subtotal: roundMoney(subtotal).toString(),
      discountTotal: roundMoney(discountTotal).toString(),
      taxTotal: roundMoney(taxTotal).toString(),
      total: total.toString(),
    };
  }
}
