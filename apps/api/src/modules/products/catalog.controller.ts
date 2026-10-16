import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, Inject } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/guards/jwt.strategy';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import {
  createCategorySchema,
  createIngredientSchema,
  createProductSchema,
  createUnitConversionSchema,
  createUnitSchema,
  updateCategorySchema,
  updateIngredientSchema,
  updateProductSchema,
} from '@alkhal/validation';
import { d } from '@alkhal/shared';
import { RecipesService } from '../recipes/recipes.service';
import { AuditService } from '../audit/audit.service';
import { Errors } from '../../common/errors';
import {
  displayCostPerKg,
  toConversionRecords,
  unitCostFromCostPerKg,
} from '../../common/ingredient-cost';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CatalogController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RecipesService) private readonly recipes: RecipesService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get('categories')
  categories(@CurrentUser() user: AuthUser) {
    return this.prisma.category.findMany({
      where: { restaurantId: user.restaurantId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  @Post('categories')
  @RequirePermissions('products.manage')
  createCategory(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(createCategorySchema)) body: unknown,
  ) {
    const dto = createCategorySchema.parse(body);
    return this.prisma.category.create({ data: { restaurantId: user.restaurantId, ...dto } });
  }

  @Patch('categories/:id')
  @RequirePermissions('products.manage')
  async updateCategory(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(updateCategorySchema)) body: unknown,
  ) {
    const dto = updateCategorySchema.parse(body);
    const existing = await this.prisma.category.findFirst({
      where: { id, restaurantId: user.restaurantId },
    });
    if (!existing) {
      throw Errors.notFound('Category');
    }
    return this.prisma.category.update({
      where: { id },
      data: compact(dto) as never,
    });
  }

  @Delete('categories/:id')
  @RequirePermissions('products.manage')
  async deleteCategory(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const existing = await this.prisma.category.findFirst({
      where: { id, restaurantId: user.restaurantId },
      include: { _count: { select: { products: true, ingredients: true } } },
    });
    if (!existing) {
      throw Errors.notFound('Category');
    }
    if (existing._count.products > 0 || existing._count.ingredients > 0) {
      return this.prisma.category.update({ where: { id }, data: { active: false } });
    }
    await this.prisma.category.delete({ where: { id } });
    return { ok: true, deleted: true };
  }

  @Get('units')
  units(@CurrentUser() user: AuthUser) {
    return this.prisma.unit.findMany({
      where: { restaurantId: user.restaurantId },
      orderBy: { code: 'asc' },
    });
  }

  @Post('units')
  @RequirePermissions('ingredients.manage')
  createUnit(@CurrentUser() user: AuthUser, @Body(new ZodPipe(createUnitSchema)) body: unknown) {
    const dto = createUnitSchema.parse(body);
    return this.prisma.unit.create({ data: { restaurantId: user.restaurantId, ...dto } });
  }

  @Get('unit-conversions')
  conversions(@CurrentUser() user: AuthUser) {
    return this.prisma.unitConversion.findMany({
      where: { restaurantId: user.restaurantId },
      include: { fromUnit: true, toUnit: true, ingredient: true },
    });
  }

  @Post('unit-conversions')
  @RequirePermissions('ingredients.manage')
  createConversion(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(createUnitConversionSchema)) body: unknown,
  ) {
    const dto = createUnitConversionSchema.parse(body);
    return this.prisma.unitConversion.create({
      data: {
        restaurantId: user.restaurantId,
        fromUnitId: dto.fromUnitId,
        toUnitId: dto.toUnitId,
        factor: dto.factor,
        ingredientId: dto.ingredientId,
      },
    });
  }

  @Get('ingredients')
  async ingredients(@CurrentUser() user: AuthUser, @Query('type') type?: string) {
    const rows = await this.prisma.ingredient.findMany({
      where: { restaurantId: user.restaurantId, ...(type ? { type: type as never } : {}) },
      include: { baseUnit: true, category: true, inventoryBalance: true },
      orderBy: { nameAr: 'asc' },
    });
    return this.attachCostPerKg(user.restaurantId, rows);
  }

  @Post('ingredients')
  @RequirePermissions('ingredients.manage')
  async createIngredient(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(createIngredientSchema)) body: unknown,
  ) {
    const dto = createIngredientSchema.parse(body);
    const { costPerKg, ...data } = dto;
    const averageCost = await this.averageCostFromKg(user.restaurantId, dto.baseUnitId, costPerKg);
    const ingredient = await this.prisma.$transaction(async (tx) => {
      const created = await tx.ingredient.create({
        data: {
          restaurantId: user.restaurantId,
          sku: data.sku,
          nameAr: data.nameAr,
          nameEn: data.nameEn,
          categoryId: data.categoryId,
          type: data.type,
          baseUnitId: data.baseUnitId,
          minimumStock: data.minimumStock,
          reorderPoint: data.reorderPoint,
          targetStock: data.targetStock,
          averageCost,
          lastPurchaseCost: averageCost,
          active: data.active ?? true,
        },
      });
      await tx.inventoryBalance.create({
        data: {
          restaurantId: user.restaurantId,
          ingredientId: created.id,
          quantity: 0,
          averageCost,
        },
      });
      return created;
    });
    await this.audit.log({
      restaurantId: user.restaurantId,
      userId: user.id,
      action: 'CREATE',
      entity: 'Ingredient',
      entityId: ingredient.id,
    });
    return this.getIngredient(user, ingredient.id);
  }

  @Patch('ingredients/:id')
  @RequirePermissions('ingredients.manage')
  async updateIngredient(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(updateIngredientSchema)) body: unknown,
  ) {
    const dto = updateIngredientSchema.parse(body);
    const existing = await this.prisma.ingredient.findFirst({
      where: { id, restaurantId: user.restaurantId },
    });
    if (!existing) {
      throw Errors.notFound('Ingredient');
    }
    const { costPerKg, ...rest } = dto;
    const costFields: { averageCost?: string; lastPurchaseCost?: string } = {};
    if (costPerKg !== undefined) {
      const averageCost = await this.averageCostFromKg(
        user.restaurantId,
        rest.baseUnitId ?? existing.baseUnitId,
        costPerKg,
      );
      costFields.averageCost = averageCost;
      costFields.lastPurchaseCost = averageCost;
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.ingredient.update({
        where: { id },
        data: compact({ ...rest, ...costFields }) as never,
      });
      if (costFields.averageCost) {
        await tx.inventoryBalance.upsert({
          where: { ingredientId: id },
          create: {
            restaurantId: user.restaurantId,
            ingredientId: id,
            quantity: 0,
            averageCost: costFields.averageCost,
          },
          update: { averageCost: costFields.averageCost },
        });
      }
    });
    return this.getIngredient(user, id);
  }

  @Get('ingredients/:id')
  async getIngredient(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const ingredient = await this.prisma.ingredient.findFirst({
      where: { id, restaurantId: user.restaurantId },
      include: { baseUnit: true, category: true, inventoryBalance: true },
    });
    if (!ingredient) {
      throw Errors.notFound('Ingredient');
    }
    const [enriched] = await this.attachCostPerKg(user.restaurantId, [ingredient]);
    return enriched;
  }

  @Delete('ingredients/:id')
  @RequirePermissions('ingredients.manage')
  async deleteIngredient(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const existing = await this.prisma.ingredient.findFirst({
      where: { id, restaurantId: user.restaurantId },
      include: {
        _count: {
          select: { recipeItems: true, purchaseItems: true, inventoryTransactions: true },
        },
      },
    });
    if (!existing) {
      throw Errors.notFound('Ingredient');
    }
    if (
      existing._count.recipeItems > 0 ||
      existing._count.purchaseItems > 0 ||
      existing._count.inventoryTransactions > 0
    ) {
      return this.prisma.ingredient.update({ where: { id }, data: { active: false } });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.inventoryBalance.deleteMany({ where: { ingredientId: id } });
      await tx.ingredient.delete({ where: { id } });
    });
    await this.audit.log({
      restaurantId: user.restaurantId,
      userId: user.id,
      action: 'DELETE',
      entity: 'Ingredient',
      entityId: id,
    });
    return { ok: true, deleted: true };
  }

  @Get('products')
  products(@CurrentUser() user: AuthUser) {
    return this.prisma.product.findMany({
      where: { restaurantId: user.restaurantId },
      include: {
        category: true,
        variants: true,
        recipes: true,
        components: {
          include: {
            recipe: { include: { outputIngredient: true, outputUnit: true } },
            ingredient: true,
            unit: true,
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
    });
  }

  @Get('products/:id')
  async getProduct(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, restaurantId: user.restaurantId },
      include: {
        category: true,
        variants: true,
        recipes: { include: { items: { include: { ingredient: true, unit: true } } } },
        directIngredient: true,
        components: {
          include: {
            recipe: { include: { outputIngredient: true, outputUnit: true } },
            ingredient: true,
            unit: true,
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!product) {
      throw Errors.notFound('Product');
    }
    return product;
  }

  @Get('products/:id/pricing')
  @RequirePermissions('products.manage')
  productPricing(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.recipes.productPricing(user.restaurantId, id);
  }

  @Post('products')
  @RequirePermissions('products.manage')
  async createProduct(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(createProductSchema)) body: unknown,
  ) {
    const dto = createProductSchema.parse(body);
    const { variants, components, ...data } = dto;
    if (components?.length) {
      await this.recipes.assertReusableComponents(user.restaurantId, components);
    }
    const product = await this.prisma.product.create({
      data: {
        restaurantId: user.restaurantId,
        sku: data.sku,
        nameAr: data.nameAr,
        nameEn: data.nameEn,
        categoryId: data.categoryId,
        type: data.type,
        inventoryMode: data.inventoryMode,
        directIngredientId: data.directIngredientId,
        pricingMethod: data.pricingMethod,
        targetMarginPercent: data.targetMarginPercent,
        markupPercent: data.markupPercent,
        sellingPrice: data.sellingPrice,
        active: data.active ?? true,
        sortOrder: data.sortOrder ?? 0,
        variants: variants
          ? {
              create: variants.map((v) => ({
                sku: v.sku,
                nameAr: v.nameAr,
                nameEn: v.nameEn,
                sellingPrice: v.sellingPrice,
              })),
            }
          : undefined,
        components: components
          ? {
              create: components.map((row, index) => ({
                recipeId: row.recipeId ?? null,
                ingredientId: row.ingredientId ?? null,
                quantity: row.quantity,
                unitId: row.unitId,
                isPackaging: row.isPackaging ?? false,
                sortOrder: row.sortOrder ?? index,
              })),
            }
          : undefined,
      },
      include: { variants: true, components: true },
    });
    await this.audit.log({
      restaurantId: user.restaurantId,
      userId: user.id,
      action: 'CREATE',
      entity: 'Product',
      entityId: product.id,
    });
    return product;
  }

  @Patch('products/:id')
  @RequirePermissions('products.manage')
  async updateProduct(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(updateProductSchema)) body: unknown,
  ) {
    const dto = updateProductSchema.parse(body);
    const existing = await this.prisma.product.findFirst({
      where: { id, restaurantId: user.restaurantId },
    });
    if (!existing) {
      throw Errors.notFound('Product');
    }
    if (dto.sellingPrice && d(dto.sellingPrice).toString() !== existing.sellingPrice.toString()) {
      await this.prisma.priceHistory.create({
        data: {
          restaurantId: user.restaurantId,
          productId: id,
          oldPrice: existing.sellingPrice,
          newPrice: dto.sellingPrice,
        },
      });
    }
    const { variants: _variants, components, ...data } = dto;
    if (components) {
      await this.recipes.assertReusableComponents(user.restaurantId, components);
      await this.prisma.$transaction(async (tx) => {
        await tx.productComponent.deleteMany({ where: { productId: id } });
        if (components.length) {
          await tx.productComponent.createMany({
            data: components.map((row, index) => ({
              productId: id,
              recipeId: row.recipeId ?? null,
              ingredientId: row.ingredientId ?? null,
              quantity: row.quantity,
              unitId: row.unitId,
              isPackaging: row.isPackaging ?? false,
              sortOrder: row.sortOrder ?? index,
            })),
          });
        }
      });
    }
    return this.prisma.product.update({ where: { id }, data: compact(data) as never });
  }

  @Delete('products/:id')
  @RequirePermissions('products.manage')
  async deleteProduct(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const existing = await this.prisma.product.findFirst({
      where: { id, restaurantId: user.restaurantId },
      include: { _count: { select: { saleItems: true, recipes: true } } },
    });
    if (!existing) {
      throw Errors.notFound('Product');
    }
    if (existing._count.saleItems > 0) {
      return this.prisma.product.update({ where: { id }, data: { active: false } });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.recipe.deleteMany({ where: { productId: id } });
      await tx.productVariant.deleteMany({ where: { productId: id } });
      await tx.priceHistory.deleteMany({ where: { productId: id } });
      await tx.product.delete({ where: { id } });
    });
    await this.audit.log({
      restaurantId: user.restaurantId,
      userId: user.id,
      action: 'DELETE',
      entity: 'Product',
      entityId: id,
    });
    return { ok: true, deleted: true };
  }

  private async averageCostFromKg(restaurantId: string, baseUnitId: string, costPerKg: string) {
    const [baseUnit, units, conversions] = await Promise.all([
      this.prisma.unit.findFirst({ where: { id: baseUnitId, restaurantId } }),
      this.prisma.unit.findMany({ where: { restaurantId } }),
      this.prisma.unitConversion.findMany({ where: { restaurantId } }),
    ]);
    if (!baseUnit) {
      throw Errors.notFound('Unit');
    }
    const kg = units.find((u) => u.code === 'kg');
    return unitCostFromCostPerKg(costPerKg, baseUnit, kg, toConversionRecords(conversions));
  }

  private async attachCostPerKg<
    T extends {
      averageCost: { toString(): string };
      inventoryBalance?: { averageCost: { toString(): string } } | null;
      baseUnit: { id: string; code: string };
    },
  >(restaurantId: string, rows: T[]) {
    const [units, conversions] = await Promise.all([
      this.prisma.unit.findMany({ where: { restaurantId } }),
      this.prisma.unitConversion.findMany({ where: { restaurantId } }),
    ]);
    const kg = units.find((u) => u.code === 'kg');
    const conv = toConversionRecords(conversions);
    return rows.map((row) => ({
      ...row,
      costPerKg: displayCostPerKg(
        row.inventoryBalance?.averageCost ?? row.averageCost,
        row.baseUnit,
        kg,
        conv,
      ),
    }));
  }
}

function compact<T extends Record<string, unknown>>(input: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}
