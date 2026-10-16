import { Inject, Injectable } from '@nestjs/common';
import { createRecipeSchema, updateRecipeSchema } from '@alkhal/validation';
import {
  allocateOverhead,
  buildPricingResult,
  calculateRecipeCost,
  convertQuantity,
  d,
  priceFromGrossMargin,
  roundMoney,
} from '@alkhal/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { Errors } from '../../common/errors';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../../common/guards/jwt.strategy';
import type { DbClient } from '../../common/prisma/db-client';

@Injectable()
export class RecipesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(InventoryService) private readonly inventory: InventoryService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  list(restaurantId: string) {
    return this.prisma.recipe.findMany({
      where: { restaurantId },
      include: {
        items: { include: { ingredient: true, unit: true } },
        product: true,
        outputIngredient: true,
        outputUnit: true,
      },
      orderBy: { nameAr: 'asc' },
    });
  }

  async get(restaurantId: string, id: string) {
    const recipe = await this.prisma.recipe.findFirst({
      where: { id, restaurantId },
      include: {
        items: { include: { ingredient: true, unit: true } },
        product: true,
        variant: true,
        outputIngredient: true,
        outputUnit: true,
      },
    });
    if (!recipe) {
      throw Errors.notFound('Recipe');
    }
    const cost = await this.costRecipe(restaurantId, recipe.id);
    return { ...recipe, cost };
  }

  async create(user: AuthUser, input: unknown) {
    const dto = createRecipeSchema.parse(input);
    const recipe = await this.prisma.recipe.create({
      data: {
        restaurantId: user.restaurantId,
        nameAr: dto.nameAr,
        nameEn: dto.nameEn,
        productId: dto.productId ?? null,
        variantId: dto.variantId ?? null,
        outputIngredientId: dto.outputIngredientId ?? null,
        outputQuantity: dto.outputQuantity,
        outputUnitId: dto.outputUnitId,
        wasteAllowancePercent: dto.wasteAllowancePercent,
        notes: dto.notes,
        active: dto.active ?? true,
        items: {
          create: dto.items.map((item) => ({
            ingredientId: item.ingredientId,
            quantity: item.quantity,
            unitId: item.unitId,
            isPackaging: item.isPackaging ?? false,
            notes: item.notes,
          })),
        },
      },
      include: { items: true },
    });
    await this.audit.log({
      restaurantId: user.restaurantId,
      userId: user.id,
      action: 'CREATE',
      entity: 'Recipe',
      entityId: recipe.id,
      after: recipe as never,
    });
    return recipe;
  }

  async update(user: AuthUser, id: string, input: unknown) {
    const dto = updateRecipeSchema.parse(input);
    const existing = await this.prisma.recipe.findFirst({ where: { id, restaurantId: user.restaurantId } });
    if (!existing) {
      throw Errors.notFound('Recipe');
    }
    const recipe = await this.prisma.$transaction(async (tx) => {
      if (dto.items) {
        await tx.recipeItem.deleteMany({ where: { recipeId: id } });
      }
      return tx.recipe.update({
        where: { id },
        data: {
          nameAr: dto.nameAr,
          nameEn: dto.nameEn,
          productId: dto.productId === undefined ? undefined : dto.productId,
          variantId: dto.variantId === undefined ? undefined : dto.variantId,
          outputIngredientId: dto.outputIngredientId === undefined ? undefined : dto.outputIngredientId,
          outputQuantity: dto.outputQuantity,
          outputUnitId: dto.outputUnitId,
          wasteAllowancePercent: dto.wasteAllowancePercent,
          notes: dto.notes,
          active: dto.active,
          ...(dto.items
            ? {
                items: {
                  create: dto.items.map((item) => ({
                    ingredientId: item.ingredientId,
                    quantity: item.quantity,
                    unitId: item.unitId,
                    isPackaging: item.isPackaging ?? false,
                    notes: item.notes,
                  })),
                },
              }
            : {}),
        },
        include: { items: true },
      });
    });
    await this.audit.log({
      restaurantId: user.restaurantId,
      userId: user.id,
      action: 'UPDATE',
      entity: 'Recipe',
      entityId: id,
    });
    return recipe;
  }

  async remove(user: AuthUser, id: string) {
    const existing = await this.prisma.recipe.findFirst({
      where: { id, restaurantId: user.restaurantId },
      include: { _count: { select: { productionBatches: true } } },
    });
    if (!existing) {
      throw Errors.notFound('Recipe');
    }
    if (existing._count.productionBatches > 0) {
      const deactivated = await this.prisma.recipe.update({
        where: { id },
        data: { active: false },
      });
      await this.audit.log({
        restaurantId: user.restaurantId,
        userId: user.id,
        action: 'UPDATE',
        entity: 'Recipe',
        entityId: id,
        after: { active: false },
      });
      return deactivated;
    }
    await this.prisma.recipe.delete({ where: { id } });
    await this.audit.log({
      restaurantId: user.restaurantId,
      userId: user.id,
      action: 'DELETE',
      entity: 'Recipe',
      entityId: id,
    });
    return { ok: true, deleted: true };
  }

  async costRecipe(restaurantId: string, recipeId: string, db: DbClient = this.prisma) {
    const recipe = await db.recipe.findFirst({
      where: { id: recipeId, restaurantId },
      include: {
        items: { include: { ingredient: { include: { inventoryBalance: true } } } },
      },
    });
    if (!recipe) {
      throw Errors.notFound('Recipe');
    }
    const conversions = await this.inventory.loadConversions(restaurantId, db);
    const items = recipe.items.map((item) => {
      const qtyBase = convertQuantity(
        item.quantity.toString(),
        item.unitId,
        item.ingredient.baseUnitId,
        conversions,
        item.ingredientId,
      );
      const unitCost = d(
        (item.ingredient.inventoryBalance?.averageCost ?? item.ingredient.averageCost).toString(),
      );
      return {
        ingredientId: item.ingredientId,
        quantityInBaseUnits: qtyBase,
        unitCost,
        isPackaging: item.isPackaging,
        lineCost: qtyBase.times(unitCost),
      };
    });
    const breakdown = calculateRecipeCost(items, {
      wasteAllowancePercent: recipe.wasteAllowancePercent.toString(),
    });
    const outputQty = convertQuantity(
      recipe.outputQuantity.toString(),
      recipe.outputUnitId,
      recipe.outputIngredientId
        ? (await db.ingredient.findUniqueOrThrow({ where: { id: recipe.outputIngredientId } })).baseUnitId
        : recipe.outputUnitId,
      conversions,
      recipe.outputIngredientId,
    );
    const unitCost = outputQty.isZero()
      ? d(0)
      : breakdown.totalCost.dividedBy(d(recipe.outputQuantity.toString()));
    return {
      ...breakdown,
      outputQuantity: recipe.outputQuantity,
      unitCost,
      items,
    };
  }

  async productBom(restaurantId: string, productId: string, db: DbClient = this.prisma) {
    const product = await db.product.findFirst({
      where: { id: productId, restaurantId },
      include: {
        components: {
          include: {
            recipe: { include: { outputIngredient: { include: { inventoryBalance: true, baseUnit: true } } } },
            ingredient: { include: { inventoryBalance: true, baseUnit: true } },
          },
          orderBy: { sortOrder: 'asc' },
        },
        recipes: {
          where: { active: true },
          include: { items: { include: { ingredient: { include: { inventoryBalance: true, baseUnit: true } } } } },
        },
        directIngredient: { include: { inventoryBalance: true, baseUnit: true } },
      },
    });
    if (!product) {
      throw Errors.notFound('Product');
    }

    if (product.inventoryMode === 'DIRECT' && product.directIngredient) {
      return {
        product,
        source: 'DIRECT' as const,
        lines: [
          {
            ingredientId: product.directIngredient.id,
            ingredient: product.directIngredient,
            quantity: '1',
            unitId: product.directIngredient.baseUnitId,
            isPackaging: false,
          },
        ],
      };
    }

    if (product.components.length > 0) {
      const lines = product.components.map((row) => {
        if (row.recipeId) {
          const output = row.recipe?.outputIngredient;
          if (!output) {
            throw Errors.badRequest(
              'COMPONENT_RECIPE_NO_OUTPUT',
              `الوصفة «${row.recipe?.nameAr ?? ''}» يجب أن تنتج مادة محضّرة لإعادة استخدامها`,
              'Linked recipe must produce a prepared material',
            );
          }
          return {
            ingredientId: output.id,
            ingredient: output,
            quantity: row.quantity.toString(),
            unitId: row.unitId,
            isPackaging: row.isPackaging,
            recipeId: row.recipeId,
            recipeNameAr: row.recipe?.nameAr,
          };
        }
        if (!row.ingredient) {
          throw Errors.badRequest('COMPONENT_INVALID', 'مكوّن المنتج غير مكتمل', 'Product component is incomplete');
        }
        return {
          ingredientId: row.ingredient.id,
          ingredient: row.ingredient,
          quantity: row.quantity.toString(),
          unitId: row.unitId,
          isPackaging: row.isPackaging,
        };
      });
      return { product, source: 'COMPONENTS' as const, lines };
    }

    const recipe = product.recipes[0];
    if (!recipe) {
      return { product, source: 'NONE' as const, lines: [] };
    }
    return {
      product,
      source: 'RECIPE' as const,
      lines: recipe.items.map((item) => ({
        ingredientId: item.ingredientId,
        ingredient: item.ingredient,
        quantity: item.quantity.toString(),
        unitId: item.unitId,
        isPackaging: item.isPackaging,
      })),
    };
  }

  async costProduct(restaurantId: string, productId: string, db: DbClient = this.prisma) {
    const bom = await this.productBom(restaurantId, productId, db);
    const conversions = await this.inventory.loadConversions(restaurantId, db);
    const items = bom.lines.map((line) => {
      const qtyBase = convertQuantity(
        line.quantity,
        line.unitId,
        line.ingredient.baseUnitId,
        conversions,
        line.ingredientId,
      );
      const unitCost = d(
        (line.ingredient.inventoryBalance?.averageCost ?? line.ingredient.averageCost).toString(),
      );
      return {
        ingredientId: line.ingredientId,
        quantityInBaseUnits: qtyBase,
        unitCost,
        isPackaging: line.isPackaging,
        lineCost: qtyBase.times(unitCost),
        nameAr: line.ingredient.nameAr,
        recipeNameAr: 'recipeNameAr' in line ? line.recipeNameAr : undefined,
      };
    });
    const breakdown = calculateRecipeCost(items);
    return {
      ...breakdown,
      unitCost: breakdown.totalCost,
      source: bom.source,
      items,
    };
  }

  async overheadPerUnit(restaurantId: string, days = 30) {
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: { overheadAllocationMethod: true },
    });
    const [expenses, sales] = await Promise.all([
      this.prisma.expense.findMany({
        where: { restaurantId, expenseDate: { gte: from, lte: to } },
      }),
      this.prisma.sale.findMany({
        where: {
          restaurantId,
          status: 'COMPLETED',
          completedAt: { gte: from, lte: to },
        },
        include: { items: true },
      }),
    ]);
    const totalOverhead = expenses.reduce((sum, row) => sum.plus(row.amount.toString()), d(0));
    const byProduct = new Map<
      string,
      { key: string; revenue: ReturnType<typeof d>; quantity: ReturnType<typeof d>; directCost: ReturnType<typeof d> }
    >();
    for (const sale of sales) {
      for (const item of sale.items) {
        const prev = byProduct.get(item.productId) ?? {
          key: item.productId,
          revenue: d(0),
          quantity: d(0),
          directCost: d(0),
        };
        prev.revenue = prev.revenue.plus(item.lineTotal.toString());
        prev.quantity = prev.quantity.plus(item.quantity.toString());
        prev.directCost = prev.directCost.plus(item.lineCogs.toString());
        byProduct.set(item.productId, prev);
      }
    }
    const shares = [...byProduct.values()];
    const allocated = allocateOverhead(totalOverhead, restaurant.overheadAllocationMethod, shares);
    const perUnit = new Map<string, ReturnType<typeof d>>();
    for (const share of shares) {
      const qty = share.quantity;
      const amount = allocated.get(share.key) ?? d(0);
      perUnit.set(share.key, qty.greaterThan(0) ? amount.dividedBy(qty) : d(0));
    }
    const totalQty = shares.reduce((sum, row) => sum.plus(row.quantity), d(0));
    const avgPerUnit = totalQty.greaterThan(0) ? totalOverhead.dividedBy(totalQty) : d(0);
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      method: restaurant.overheadAllocationMethod,
      totalOverhead: roundMoney(totalOverhead).toString(),
      avgPerUnit,
      perUnit,
    };
  }

  async productPricing(restaurantId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, restaurantId },
    });
    if (!product) {
      throw Errors.notFound('Product');
    }
    const cost = await this.costProduct(restaurantId, productId);
    const overhead = await this.overheadPerUnit(restaurantId);
    const overheadPerUnit = roundMoney(overhead.perUnit.get(productId) ?? overhead.avgPerUnit);
    const fullCost = roundMoney(d(cost.unitCost.toString()).plus(overheadPerUnit));
    const targetMargin = Number(product.targetMarginPercent.toString()) > 0 ? product.targetMarginPercent.toString() : '40';
    const pricing = buildPricingResult(fullCost.toString(), product.sellingPrice.toString(), product.pricingMethod, {
      markupPercent: product.markupPercent.toString(),
      targetMarginPercent: targetMargin,
    });
    const recommendedPrice = priceFromGrossMargin(fullCost, targetMargin);
    const selling = d(product.sellingPrice.toString());
    const material = d(cost.materialCost.toString());
    const packaging = d(cost.packagingCost.toString());
    const direct = material.plus(packaging);
    return {
      productId: product.id,
      nameAr: product.nameAr,
      pricingMethod: product.pricingMethod,
      targetMarginPercent: product.targetMarginPercent.toString(),
      markupPercent: product.markupPercent.toString(),
      materialCost: roundMoney(material).toString(),
      packagingCost: roundMoney(packaging).toString(),
      overheadPerUnit: overheadPerUnit.toString(),
      fullCost: fullCost.toString(),
      sellingPrice: product.sellingPrice.toString(),
      suggestedPrice: pricing.suggestedPrice.toString(),
      recommendedPrice: recommendedPrice.toString(),
      grossProfit: roundMoney(selling.minus(direct)).toString(),
      operatingProfit: roundMoney(selling.minus(fullCost)).toString(),
      grossMarginPercent: pricing.grossMarginPercent.toString(),
      overhead: {
        from: overhead.from,
        to: overhead.to,
        method: overhead.method,
        totalOverhead: overhead.totalOverhead,
      },
    };
  }

  async assertReusableComponents(
    restaurantId: string,
    components: Array<{ recipeId?: string; ingredientId?: string }>,
  ) {
    for (const row of components) {
      if (row.recipeId) {
        const recipe = await this.prisma.recipe.findFirst({
          where: { id: row.recipeId, restaurantId, active: true },
        });
        if (!recipe) {
          throw Errors.notFound('Recipe');
        }
        if (!recipe.outputIngredientId) {
          throw Errors.badRequest(
            'COMPONENT_RECIPE_NO_OUTPUT',
            `الوصفة «${recipe.nameAr}» يجب أن تنتج مادة محضّرة حتى تُعاد استخدامها في منتج`,
            'Linked recipe must produce a prepared material',
          );
        }
      }
      if (row.ingredientId) {
        const ingredient = await this.prisma.ingredient.findFirst({
          where: { id: row.ingredientId, restaurantId, active: true },
        });
        if (!ingredient) {
          throw Errors.notFound('Ingredient');
        }
      }
    }
  }
}
