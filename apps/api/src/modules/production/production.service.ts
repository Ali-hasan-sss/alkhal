import { Inject, Injectable } from '@nestjs/common';
import {
  completeProductionSchema,
  createProductionSchema,
  runProductionSchema,
  wasteProductionYieldSchema,
} from '@alkhal/validation';
import {
  convertQuantity,
  d,
  limitedRecipeServings,
  maxServingsFromStock,
  roundMoney,
  roundQuantity,
  roundUnitCost,
} from '@alkhal/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { InventoryService, type DbClient } from '../inventory/inventory.service';
import { RecipesService } from '../recipes/recipes.service';
import { AuditService } from '../audit/audit.service';
import { Errors } from '../../common/errors';
import type { AuthUser } from '../../common/guards/jwt.strategy';

@Injectable()
export class ProductionService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(InventoryService) private readonly inventory: InventoryService,
    @Inject(RecipesService) private readonly recipes: RecipesService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  list(restaurantId: string) {
    return this.prisma.productionBatch.findMany({
      where: { restaurantId },
      include: {
        recipe: true,
        outputIngredient: { include: { baseUnit: true } },
        product: true,
        outputUnit: true,
        user: { select: { nameAr: true, nameEn: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async preview(restaurantId: string, recipeId: string | undefined, quantity: string, productId?: string) {
    if (productId) {
      const bom = await this.recipes.productBom(restaurantId, productId);
      const conversions = await this.inventory.loadConversions(restaurantId, this.prisma);
      const qty = d(quantity);
      const consumption = bom.lines.map((line) => {
        const neededBase = convertQuantity(
          d(line.quantity).times(qty).toString(),
          line.unitId,
          line.ingredient.baseUnitId,
          conversions,
          line.ingredientId,
        );
        const available = d(line.ingredient.inventoryBalance?.quantity.toString() ?? 0);
        return {
          ingredientId: line.ingredientId,
          nameAr: line.ingredient.nameAr,
          type: line.ingredient.type,
          unit: line.ingredient.baseUnit.symbol,
          needed: roundQuantity(neededBase).toString(),
          available: roundQuantity(available).toString(),
          sufficient: available.greaterThanOrEqualTo(neededBase),
          fromRecipe: 'recipeNameAr' in line ? line.recipeNameAr : undefined,
        };
      });
      const fromStock = limitedRecipeServings(
        consumption.map((row) => ({
          available: d(row.available),
          neededPerServing: qty.greaterThan(0) ? d(row.needed).dividedBy(qty) : d(0),
        })),
      );
      const limiting =
        fromStock.limitingIndex != null ? consumption[fromStock.limitingIndex] : consumption.find((row) => !row.sufficient);
      return {
        recipe: {
          id: productId,
          nameAr: bom.product.nameAr,
          outputQuantity: '1',
          outputUnit: 'قطعة',
          kind: 'PRODUCT',
          product: bom.product,
          outputIngredient: null,
        },
        quantity: qty.toString(),
        consumption,
        currentServingsPossible: fromStock.servings.toString(),
        limitingIngredient: limiting?.nameAr ?? null,
        productEstimatesAfter: [{ productId, nameAr: bom.product.nameAr, servings: qty.toDecimalPlaces(0).toString() }],
      };
    }
    if (!recipeId) {
      throw Errors.badRequest('RECIPE_REQUIRED', 'اختر وصفة أو منتجاً', 'Recipe or product is required');
    }
    const recipe = await this.loadRecipe(restaurantId, recipeId);
    const conversions = await this.inventory.loadConversions(restaurantId, this.prisma);
    const qty = d(quantity);
    if (qty.lessThanOrEqualTo(0)) {
      throw Errors.badRequest('INVALID_QTY', 'الكمية يجب أن تكون أكبر من صفر', 'Quantity must be positive');
    }
    const scale = qty.dividedBy(d(recipe.outputQuantity.toString()));
    const consumption = [];
    const yieldLines = [];
    for (const item of recipe.items) {
      const needed = d(item.quantity.toString()).times(scale);
      const neededBase = convertQuantity(
        needed.toString(),
        item.unitId,
        item.ingredient.baseUnitId,
        conversions,
        item.ingredientId,
      );
      const available = d(item.ingredient.inventoryBalance?.quantity.toString() ?? 0);
      const neededPerOutput = convertQuantity(
        item.quantity.toString(),
        item.unitId,
        item.ingredient.baseUnitId,
        conversions,
        item.ingredientId,
      ).dividedBy(d(recipe.outputQuantity.toString()));
      consumption.push({
        ingredientId: item.ingredientId,
        nameAr: item.ingredient.nameAr,
        type: item.ingredient.type,
        unit: item.ingredient.baseUnit.symbol,
        needed: roundQuantity(neededBase).toString(),
        available: roundQuantity(available).toString(),
        sufficient: available.greaterThanOrEqualTo(neededBase),
      });
      yieldLines.push({ available, neededPerServing: neededPerOutput });
    }
    const fromStock = limitedRecipeServings(yieldLines);
    const limiting = fromStock.limitingIndex != null ? recipe.items[fromStock.limitingIndex] : null;

    const productEstimates = recipe.outputIngredientId
      ? await this.productEstimatesFromPrepared(
          restaurantId,
          recipe.outputIngredientId,
          conversions,
          d(0),
        )
      : recipe.product
        ? [
            {
              productId: recipe.product.id,
              nameAr: recipe.product.nameAr,
              servings: qty.toDecimalPlaces(0).toString(),
            },
          ]
        : [];

    const afterPrepEstimates = recipe.outputIngredientId && recipe.outputIngredient
      ? await this.productEstimatesFromPrepared(
          restaurantId,
          recipe.outputIngredientId,
          conversions,
          convertQuantity(
            qty.toString(),
            recipe.outputUnitId,
            recipe.outputIngredient.baseUnitId,
            conversions,
            recipe.outputIngredientId,
          ),
        )
      : productEstimates;

    return {
      recipe: {
        id: recipe.id,
        nameAr: recipe.nameAr,
        outputQuantity: recipe.outputQuantity.toString(),
        outputUnit: recipe.outputUnit.symbol,
        kind: recipe.productId ? 'PRODUCT' : 'PREPARED',
        product: recipe.product,
        outputIngredient: recipe.outputIngredient,
      },
      quantity: qty.toString(),
      consumption,
      currentServingsPossible: fromStock.servings.toString(),
      limitingIngredient: limiting?.ingredient.nameAr ?? null,
      productEstimatesAfter: afterPrepEstimates,
    };
  }

  async ready(restaurantId: string) {
    const conversions = await this.inventory.loadConversions(restaurantId, this.prisma);
    const prepared = await this.prisma.ingredient.findMany({
      where: { restaurantId, type: 'PREPARED', active: true },
      include: { baseUnit: true, inventoryBalance: true },
      orderBy: { nameAr: 'asc' },
    });
    const preparedReady = [];
    for (const ing of prepared) {
      const qty = d(ing.inventoryBalance?.quantity.toString() ?? 0);
      const estimates = await this.productEstimatesFromPrepared(
        restaurantId,
        ing.id,
        conversions,
        d(0),
      );
      preparedReady.push({
        ingredientId: ing.id,
        nameAr: ing.nameAr,
        quantity: roundQuantity(qty).toString(),
        unit: ing.baseUnit.symbol,
        productEstimates: estimates,
      });
    }

    const productBatches = await this.prisma.productionBatch.findMany({
      where: {
        restaurantId,
        status: 'COMPLETED',
        productId: { not: null },
      },
      include: { product: true, recipe: true, outputUnit: true },
      orderBy: { completedAt: 'asc' },
    });
    const byProduct = new Map<
      string,
      { productId: string; nameAr: string; remaining: ReturnType<typeof d>; unit: string; batchIds: string[] }
    >();
    for (const batch of productBatches) {
      if (!batch.productId || !batch.product) {
        continue;
      }
      const rem = d(batch.remainingQuantity.toString());
      if (rem.lessThanOrEqualTo(0)) {
        continue;
      }
      const current = byProduct.get(batch.productId);
      if (current) {
        current.remaining = current.remaining.plus(rem);
        current.batchIds.push(batch.id);
      } else {
        byProduct.set(batch.productId, {
          productId: batch.productId,
          nameAr: batch.product.nameAr,
          remaining: rem,
          unit: batch.outputUnit.symbol,
          batchIds: [batch.id],
        });
      }
    }

    return {
      preparedMaterials: preparedReady,
      readyProducts: [...byProduct.values()].map((row) => ({
        productId: row.productId,
        nameAr: row.nameAr,
        remaining: roundQuantity(row.remaining).toString(),
        unit: row.unit,
        batchIds: row.batchIds,
      })),
    };
  }

  async prepareableQuantities(restaurantId: string) {
    const conversions = await this.inventory.loadConversions(restaurantId, this.prisma);
    const products = await this.prisma.product.findMany({
      where: { restaurantId, active: true, inventoryMode: 'RECIPE' },
      select: { id: true },
    });
    const result: Record<string, { prepareable: string; limitingIngredient: string | null }> = {};
    for (const product of products) {
      try {
        const bom = await this.recipes.productBom(restaurantId, product.id);
        if (!bom.lines.length) {
          result[product.id] = { prepareable: '0', limitingIngredient: null };
          continue;
        }
        const recipe = bom.product.recipes?.[0];
        const perProductScale =
          bom.source === 'RECIPE' && recipe
            ? d(1).dividedBy(d(recipe.outputQuantity.toString() || '1'))
            : d(1);
        const lines = bom.lines.map((line) => {
          const neededPer = convertQuantity(
            d(line.quantity).times(perProductScale).toString(),
            line.unitId,
            line.ingredient.baseUnitId,
            conversions,
            line.ingredientId,
          );
          return {
            available: d(line.ingredient.inventoryBalance?.quantity.toString() ?? 0),
            neededPerServing: neededPer,
            nameAr: line.ingredient.nameAr,
          };
        });
        const fromStock = limitedRecipeServings(lines);
        result[product.id] = {
          prepareable: fromStock.servings.toString(),
          limitingIngredient:
            fromStock.limitingIndex != null ? lines[fromStock.limitingIndex]?.nameAr ?? null : null,
        };
      } catch {
        result[product.id] = { prepareable: '0', limitingIngredient: null };
      }
    }
    return result;
  }

  async create(user: AuthUser, input: unknown) {
    const dto = createProductionSchema.parse(input);
    if (dto.productId && !dto.recipeId) {
      const product = await this.prisma.product.findFirst({
        where: { id: dto.productId, restaurantId: user.restaurantId },
      });
      if (!product) {
        throw Errors.notFound('Product');
      }
      const unit =
        (await this.prisma.unit.findFirst({
          where: { restaurantId: user.restaurantId, code: 'piece' },
        })) ??
        (await this.prisma.unit.findFirst({
          where: { restaurantId: user.restaurantId, unitType: 'COUNT' },
        }));
      if (!unit) {
        throw Errors.badRequest('UNIT_MISSING', 'لا توجد وحدة قطعة للإنتاج', 'Count unit is missing');
      }
      const batch = await this.prisma.productionBatch.create({
        data: {
          restaurantId: user.restaurantId,
          recipeId: null,
          outputIngredientId: product.directIngredientId,
          productId: product.id,
          outputUnitId: unit.id,
          plannedQuantity: dto.plannedQuantity,
          notes: dto.notes,
          userId: user.id,
          status: 'DRAFT',
        },
      });
      await this.audit.log({
        restaurantId: user.restaurantId,
        userId: user.id,
        action: 'CREATE',
        entity: 'ProductionBatch',
        entityId: batch.id,
      });
      return batch;
    }
    if (!dto.recipeId) {
      throw Errors.badRequest('RECIPE_REQUIRED', 'اختر وصفة', 'Recipe is required');
    }
    const recipe = await this.loadRecipe(user.restaurantId, dto.recipeId);
    this.assertProducible(recipe);
    const batch = await this.prisma.productionBatch.create({
      data: {
        restaurantId: user.restaurantId,
        recipeId: recipe.id,
        outputIngredientId: recipe.outputIngredientId,
        productId: recipe.productId ?? dto.productId ?? null,
        outputUnitId: recipe.outputUnitId,
        plannedQuantity: dto.plannedQuantity,
        notes: dto.notes,
        userId: user.id,
        status: 'DRAFT',
      },
    });
    await this.audit.log({
      restaurantId: user.restaurantId,
      userId: user.id,
      action: 'CREATE',
      entity: 'ProductionBatch',
      entityId: batch.id,
    });
    return batch;
  }

  async run(user: AuthUser, input: unknown) {
    const dto = runProductionSchema.parse(input);
    const created = await this.create(user, {
      recipeId: dto.recipeId,
      productId: dto.productId,
      plannedQuantity: dto.plannedQuantity,
      notes: dto.notes,
    });
    return this.complete(user, created.id, {
      actualQuantity: dto.actualQuantity ?? dto.plannedQuantity,
      wasteQuantity: dto.wasteQuantity ?? '0',
      notes: dto.notes,
    });
  }

  async complete(user: AuthUser, id: string, input: unknown) {
    const dto = completeProductionSchema.parse(input);
    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.productionBatch.findFirst({
        where: { id, restaurantId: user.restaurantId },
        include: {
          recipe: {
            include: {
              items: { include: { ingredient: true } },
              outputIngredient: true,
            },
          },
        },
      });
      if (!batch) {
        throw Errors.notFound('ProductionBatch');
      }
      if (batch.status === 'COMPLETED' || batch.status === 'CANCELLED') {
        throw Errors.conflict(
          'PRODUCTION_CLOSED',
          'لا يمكن إتمام إنتاج مغلق',
          'Production batch is already closed',
        );
      }

      const actual = d(dto.actualQuantity);
      const wasteQty = d(dto.wasteQuantity);
      const netOutput = actual.minus(wasteQty);
      if (actual.lessThanOrEqualTo(0)) {
        throw Errors.badRequest('INVALID_QTY', 'الكمية الفعلية غير صحيحة', 'Actual quantity is invalid');
      }
      if (netOutput.lessThan(0)) {
        throw Errors.badRequest('INVALID_WASTE', 'كمية الهدر غير صحيحة', 'Waste exceeds actual quantity');
      }

      const source = await this.consumptionSource(user.restaurantId, batch, tx);
      const scale = actual.dividedBy(d(source.outputQuantity));
      const { totalCost, itemRows } = await this.consumeRecipeItems(
        user,
        batch.id,
        { outputQuantity: source.outputQuantity, items: source.items },
        d(batch.plannedQuantity.toString()),
        scale,
        tx,
      );

      await tx.productionBatchItem.createMany({ data: itemRows.map((row) => ({ ...row, batchId: id })) });

      const unitCost = netOutput.isZero() ? d(0) : roundUnitCost(totalCost.dividedBy(netOutput));

      if (batch.outputIngredientId && netOutput.greaterThan(0)) {
        await this.inventory.applyChange(
          {
            restaurantId: user.restaurantId,
            ingredientId: batch.outputIngredientId,
            type: 'PRODUCTION_OUTPUT',
            quantityInDocumentUnit: netOutput.toString(),
            documentUnitId: batch.outputUnitId,
            incomingUnitCost: unitCost.toString(),
            documentType: 'ProductionBatch',
            documentId: batch.id,
            userId: user.id,
          },
          tx,
        );
      }

      if (wasteQty.greaterThan(0) && batch.outputIngredientId) {
        const wasteReason = await tx.wasteReason.findFirst({
          where: { restaurantId: user.restaurantId, code: 'PREPARATION_WASTE' },
        });
        if (wasteReason) {
          await tx.waste.create({
            data: {
              restaurantId: user.restaurantId,
              ingredientId: batch.outputIngredientId,
              quantity: wasteQty.toString(),
              unitId: batch.outputUnitId,
              unitCost: unitCost.toString(),
              totalCost: roundMoney(wasteQty.times(unitCost)).toString(),
              reasonId: wasteReason.id,
              notes: 'Production yield loss',
              userId: user.id,
            },
          });
        }
      }

      const keepSellableYield = Boolean(batch.productId) && !batch.outputIngredientId;
      const completed = await tx.productionBatch.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          actualQuantity: dto.actualQuantity,
          wasteQuantity: dto.wasteQuantity,
          remainingQuantity: keepSellableYield ? netOutput.toString() : '0',
          unitCost: unitCost.toString(),
          totalCost: roundMoney(totalCost).toString(),
          notes: dto.notes ?? batch.notes,
          completedAt: new Date(),
        },
        include: {
          items: true,
          recipe: true,
          outputIngredient: true,
          product: true,
          outputUnit: true,
        },
      });

      await this.audit.log(
        {
          restaurantId: user.restaurantId,
          userId: user.id,
          action: 'PRODUCTION_COMPLETED',
          entity: 'ProductionBatch',
          entityId: id,
          after: { actualQuantity: dto.actualQuantity, totalCost: completed.totalCost.toString() },
        },
        tx,
      );
      return completed;
    });
  }

  async wasteYield(user: AuthUser, id: string, input: unknown) {
    const dto = wasteProductionYieldSchema.parse(input);
    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.productionBatch.findFirst({
        where: { id, restaurantId: user.restaurantId },
        include: { product: true, outputIngredient: true, outputUnit: true },
      });
      if (!batch) {
        throw Errors.notFound('ProductionBatch');
      }
      if (batch.status !== 'COMPLETED') {
        throw Errors.conflict(
          'PRODUCTION_NOT_READY',
          'يمكن تسجيل هدر على دفعة مكتملة فقط',
          'Only completed batches can record leftover waste',
        );
      }
      const qty = d(dto.quantity);
      const remaining = d(batch.remainingQuantity.toString());
      if (qty.greaterThan(remaining)) {
        throw Errors.badRequest(
          'WASTE_EXCEEDS_REMAINING',
          'كمية الهدر أكبر من الكمية المتبقية',
          'Waste exceeds remaining prepared quantity',
        );
      }

      if (batch.outputIngredientId) {
        const wasteReason = await tx.wasteReason.findFirst({
          where: { restaurantId: user.restaurantId, code: 'PREPARATION_WASTE' },
        });
        if (wasteReason) {
          const waste = await tx.waste.create({
            data: {
              restaurantId: user.restaurantId,
              ingredientId: batch.outputIngredientId,
              quantity: qty.toString(),
              unitId: batch.outputUnitId,
              unitCost: batch.unitCost.toString(),
              totalCost: roundMoney(qty.times(batch.unitCost.toString())).toString(),
              reasonId: wasteReason.id,
              notes: dto.notes ?? 'هدر كمية محضّرة',
              userId: user.id,
            },
          });
          await this.inventory.applyChange(
            {
              restaurantId: user.restaurantId,
              ingredientId: batch.outputIngredientId,
              type: 'WASTE',
              quantityInDocumentUnit: qty.toString(),
              documentUnitId: batch.outputUnitId,
              documentType: 'Waste',
              documentId: waste.id,
              userId: user.id,
              notes: dto.notes ?? 'هدر كمية محضّرة',
            },
            tx,
          );
        }
      }

      const updated = await tx.productionBatch.update({
        where: { id },
        data: {
          remainingQuantity: remaining.minus(qty).toString(),
          wasteQuantity: d(batch.wasteQuantity.toString()).plus(qty).toString(),
          notes: dto.notes ?? batch.notes,
        },
        include: { product: true, outputIngredient: true, recipe: true, outputUnit: true },
      });
      await this.audit.log(
        {
          restaurantId: user.restaurantId,
          userId: user.id,
          action: 'UPDATE',
          entity: 'ProductionBatch',
          entityId: id,
          after: { wasted: qty.toString() },
        },
        tx,
      );
      return updated;
    });
  }

  async consumeProductYield(restaurantId: string, productId: string, quantity: string, db: DbClient) {
    let need = d(quantity);
    if (need.lessThanOrEqualTo(0)) {
      return;
    }
    const batches = await db.productionBatch.findMany({
      where: { restaurantId, productId, status: 'COMPLETED' },
      orderBy: { completedAt: 'asc' },
    });
    for (const batch of batches) {
      if (need.lessThanOrEqualTo(0)) {
        break;
      }
      const remaining = d(batch.remainingQuantity.toString());
      if (remaining.lessThanOrEqualTo(0)) {
        continue;
      }
      const take = remaining.lessThan(need) ? remaining : need;
      await db.productionBatch.update({
        where: { id: batch.id },
        data: { remainingQuantity: remaining.minus(take).toString() },
      });
      need = need.minus(take);
    }
    if (need.greaterThan(0)) {
      throw Errors.badRequest(
        'INSUFFICIENT_PREPARED',
        'لا توجد كمية محضّرة كافية لهذا المنتج. حضّر الوصفة أولاً.',
        'Not enough prepared yield for this product. Prepare the recipe first.',
      );
    }
  }

  async restoreProductYield(restaurantId: string, productId: string, quantity: string, db: DbClient) {
    const qty = d(quantity);
    if (qty.lessThanOrEqualTo(0)) {
      return;
    }
    const batch = await db.productionBatch.findFirst({
      where: { restaurantId, productId, status: 'COMPLETED' },
      orderBy: { completedAt: 'desc' },
    });
    if (!batch) {
      return;
    }
    await db.productionBatch.update({
      where: { id: batch.id },
      data: { remainingQuantity: d(batch.remainingQuantity.toString()).plus(qty).toString() },
    });
  }

  async cancel(user: AuthUser, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.productionBatch.findFirst({
        where: { id, restaurantId: user.restaurantId },
        include: { items: true },
      });
      if (!batch) {
        throw Errors.notFound('ProductionBatch');
      }
      if (batch.status === 'CANCELLED') {
        throw Errors.conflict('ALREADY_CANCELLED', 'ملغى مسبقاً', 'Already cancelled');
      }
      if (batch.status === 'COMPLETED') {
        const net = d(batch.actualQuantity?.toString() ?? 0).minus(batch.wasteQuantity.toString());
        const remaining = d(batch.remainingQuantity.toString());
        if (batch.productId && remaining.lessThan(net)) {
          throw Errors.conflict(
            'YIELD_ALREADY_USED',
            'لا يمكن إلغاء دفعة بِيع جزء منها',
            'Cannot cancel a batch after products were sold',
          );
        }
        for (const item of batch.items) {
          await this.inventory.applyChange(
            {
              restaurantId: user.restaurantId,
              ingredientId: item.ingredientId,
              type: 'PRODUCTION_REVERSAL',
              quantityInDocumentUnit: item.actualQty.toString(),
              documentUnitId: (await tx.ingredient.findUniqueOrThrow({ where: { id: item.ingredientId } }))
                .baseUnitId,
              documentType: 'ProductionBatch',
              documentId: batch.id,
              userId: user.id,
              notes: 'Reverse consumption',
            },
            tx,
          );
        }
        if (batch.outputIngredientId && remaining.greaterThan(0)) {
          await this.inventory.applyChange(
            {
              restaurantId: user.restaurantId,
              ingredientId: batch.outputIngredientId,
              type: 'PRODUCTION_REVERSAL',
              quantityInDocumentUnit: remaining.negated().toString(),
              documentUnitId: batch.outputUnitId,
              documentType: 'ProductionBatch',
              documentId: batch.id,
              userId: user.id,
              notes: 'Reverse output',
            },
            tx,
          );
        }
      }
      const cancelled = await tx.productionBatch.update({
        where: { id },
        data: { status: 'CANCELLED', cancelledAt: new Date(), remainingQuantity: '0' },
      });
      await this.audit.log(
        {
          restaurantId: user.restaurantId,
          userId: user.id,
          action: 'CANCEL',
          entity: 'ProductionBatch',
          entityId: id,
        },
        tx,
      );
      return cancelled;
    });
  }

  private async consumptionSource(
    restaurantId: string,
    batch: {
      productId: string | null;
      recipeId: string | null;
      recipe: {
        outputQuantity: { toString(): string };
        items: Array<{
          ingredientId: string;
          quantity: { toString(): string };
          unitId: string;
        }>;
      } | null;
    },
    tx: DbClient,
  ) {
    if (batch.productId && !batch.recipeId) {
      const bom = await this.recipes.productBom(restaurantId, batch.productId, tx);
      return {
        outputQuantity: '1',
        items: bom.lines.map((line) => ({
          ingredientId: line.ingredientId,
          quantity: line.quantity,
          unitId: line.unitId,
        })),
      };
    }
    if (!batch.recipe) {
      throw Errors.badRequest('RECIPE_REQUIRED', 'الدفعة بلا وصفة قابلة للتحضير', 'Batch has no recipe to consume');
    }
    return {
      outputQuantity: batch.recipe.outputQuantity.toString(),
      items: batch.recipe.items,
    };
  }

  private async consumeRecipeItems(
    user: AuthUser,
    batchId: string,
    recipe: {
      outputQuantity: { toString(): string };
      items: Array<{
        ingredientId: string;
        quantity: { toString(): string };
        unitId: string;
      }>;
    },
    plannedQuantity: ReturnType<typeof d>,
    actualScale: ReturnType<typeof d>,
    tx: DbClient,
  ) {
    let totalCost = d(0);
    const itemRows: Array<{
      ingredientId: string;
      plannedQty: string;
      actualQty: string;
      unitCost: string;
      totalCost: string;
    }> = [];
    const plannedScale = plannedQuantity.dividedBy(d(recipe.outputQuantity.toString()));

    for (const item of recipe.items) {
      const planned = d(item.quantity.toString()).times(plannedScale);
      const actual = d(item.quantity.toString()).times(actualScale);
      const result = await this.inventory.applyChange(
        {
          restaurantId: user.restaurantId,
          ingredientId: item.ingredientId,
          type: 'PRODUCTION_CONSUMPTION',
          quantityInDocumentUnit: actual.toString(),
          documentUnitId: item.unitId,
          documentType: 'ProductionBatch',
          documentId: batchId,
          userId: user.id,
        },
        tx,
      );
      totalCost = totalCost.plus(result.totalCost);
      itemRows.push({
        ingredientId: item.ingredientId,
        plannedQty: planned.toString(),
        actualQty: actual.toString(),
        unitCost: result.unitCost.toString(),
        totalCost: result.totalCost.toString(),
      });
    }
    return { totalCost, itemRows };
  }

  private async productEstimatesFromPrepared(
    restaurantId: string,
    preparedIngredientId: string,
    conversions: Awaited<ReturnType<InventoryService['loadConversions']>>,
    extraPreparedBase: ReturnType<typeof d>,
  ) {
    const prepared = await this.prisma.ingredient.findFirst({
      where: { id: preparedIngredientId, restaurantId },
      include: { inventoryBalance: true },
    });
    if (!prepared) {
      return [];
    }
    const available = d(prepared.inventoryBalance?.quantity.toString() ?? 0).plus(extraPreparedBase);
    const estimates = new Map<string, { productId: string; nameAr: string; servings: string }>();

    const componentRows = await this.prisma.productComponent.findMany({
      where: {
        product: { restaurantId, active: true, inventoryMode: 'RECIPE' },
        OR: [
          { ingredientId: preparedIngredientId },
          { recipe: { outputIngredientId: preparedIngredientId } },
        ],
      },
      include: { product: true },
    });
    for (const row of componentRows) {
      const perProduct = convertQuantity(
        row.quantity.toString(),
        row.unitId,
        prepared.baseUnitId,
        conversions,
        preparedIngredientId,
      );
      estimates.set(row.productId, {
        productId: row.productId,
        nameAr: row.product.nameAr,
        servings: maxServingsFromStock(available, perProduct).toString(),
      });
    }

    const recipes = await this.prisma.recipe.findMany({
      where: {
        restaurantId,
        active: true,
        productId: { not: null },
        items: { some: { ingredientId: preparedIngredientId } },
        product: { components: { none: {} } },
      },
      include: {
        product: true,
        items: { include: { ingredient: true } },
      },
    });
    for (const recipe of recipes) {
      if (!recipe.product || estimates.has(recipe.product.id)) {
        continue;
      }
      const item = recipe.items.find((row) => row.ingredientId === preparedIngredientId);
      if (!item) {
        continue;
      }
      const perProduct = convertQuantity(
        item.quantity.toString(),
        item.unitId,
        prepared.baseUnitId,
        conversions,
        preparedIngredientId,
      ).dividedBy(d(recipe.outputQuantity.toString()));
      estimates.set(recipe.product.id, {
        productId: recipe.product.id,
        nameAr: recipe.product.nameAr,
        servings: maxServingsFromStock(available, perProduct).toString(),
      });
    }
    return [...estimates.values()];
  }

  private async loadRecipe(restaurantId: string, recipeId: string) {
    const recipe = await this.prisma.recipe.findFirst({
      where: { id: recipeId, restaurantId },
      include: {
        items: { include: { ingredient: { include: { inventoryBalance: true, baseUnit: true } } } },
        product: true,
        outputIngredient: { include: { baseUnit: true } },
        outputUnit: true,
      },
    });
    if (!recipe) {
      throw Errors.notFound('Recipe');
    }
    return recipe;
  }

  private assertProducible(recipe: { outputIngredientId: string | null; productId: string | null }) {
    if (!recipe.outputIngredientId && !recipe.productId) {
      throw Errors.badRequest(
        'RECIPE_NOT_PRODUCIBLE',
        'الوصفة يجب أن تنتج مادة محضّرة أو منتجاً جاهزاً للطهي',
        'Recipe must output a prepared material or a product',
      );
    }
  }
}
