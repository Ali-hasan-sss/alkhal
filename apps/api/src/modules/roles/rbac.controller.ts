import { Controller, Get, Patch, Body, UseGuards, Inject } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/guards/jwt.strategy';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { updateRestaurantSchema } from '@alkhal/validation';
import { AuditService } from '../audit/audit.service';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RbacController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get('roles')
  @RequirePermissions('roles.manage')
  roles(@CurrentUser() user: AuthUser) {
    return this.prisma.role.findMany({
      where: { restaurantId: user.restaurantId },
      include: { permissions: { include: { permission: true } } },
    });
  }

  @Get('permissions')
  @RequirePermissions('roles.manage')
  permissions() {
    return this.prisma.permission.findMany({ orderBy: { code: 'asc' } });
  }

  @Get('restaurants/current')
  restaurant(@CurrentUser() user: AuthUser) {
    return this.prisma.restaurant.findUniqueOrThrow({ where: { id: user.restaurantId } });
  }

  @Patch('restaurants/current')
  @RequirePermissions('settings.manage')
  async updateRestaurant(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(updateRestaurantSchema)) body: unknown,
  ) {
    const data = updateRestaurantSchema.parse(body);
    const updated = await this.prisma.restaurant.update({
      where: { id: user.restaurantId },
      data,
    });
    await this.audit.log({
      restaurantId: user.restaurantId,
      userId: user.id,
      action: 'UPDATE',
      entity: 'Restaurant',
      entityId: user.restaurantId,
    });
    return updated;
  }
}
