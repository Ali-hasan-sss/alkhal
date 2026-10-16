import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards, Inject } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/guards/jwt.strategy';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { createSupplierSchema } from '@alkhal/validation';
import { d } from '@alkhal/shared';
import { Errors } from '../../common/errors';

@Controller('suppliers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SuppliersController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('suppliers.manage')
  async list(@CurrentUser() user: AuthUser) {
    const suppliers = await this.prisma.supplier.findMany({
      where: { restaurantId: user.restaurantId },
      include: { purchases: { where: { status: { in: ['POSTED', 'PARTIALLY_PAID', 'PAID'] } } } },
      orderBy: { nameAr: 'asc' },
    });
    return suppliers.map((s) => ({
      ...s,
      balance: s.purchases.reduce((acc, p) => acc.plus(d(p.remaining.toString())), d(0)).toString(),
      purchases: undefined,
    }));
  }

  @Post()
  @RequirePermissions('suppliers.manage')
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(createSupplierSchema)) body: unknown) {
    const dto = createSupplierSchema.parse(body);
    return this.prisma.supplier.create({ data: { restaurantId: user.restaurantId, ...dto } });
  }

  @Patch(':id')
  @RequirePermissions('suppliers.manage')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(createSupplierSchema.partial())) body: unknown,
  ) {
    const dto = createSupplierSchema.partial().parse(body);
    const existing = await this.prisma.supplier.findFirst({
      where: { id, restaurantId: user.restaurantId },
    });
    if (!existing) {
      throw Errors.notFound('Supplier');
    }
    return this.prisma.supplier.update({ where: { id }, data: dto });
  }

  @Delete(':id')
  @RequirePermissions('suppliers.manage')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const existing = await this.prisma.supplier.findFirst({
      where: { id, restaurantId: user.restaurantId },
      include: { _count: { select: { purchases: true } } },
    });
    if (!existing) {
      throw Errors.notFound('Supplier');
    }
    if (existing._count.purchases > 0) {
      return this.prisma.supplier.update({ where: { id }, data: { active: false } });
    }
    await this.prisma.supplier.delete({ where: { id } });
    return { ok: true, deleted: true };
  }
}
