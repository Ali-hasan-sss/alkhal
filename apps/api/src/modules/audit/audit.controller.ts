import { Controller, Get, Query, UseGuards, Inject } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/guards/jwt.strategy';

@Controller('audit')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuditController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('audit.view')
  list(
    @CurrentUser() user: AuthUser,
    @Query('entity') entity?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '50',
  ) {
    const take = Math.min(Number(pageSize) || 50, 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
    return this.prisma.auditLog.findMany({
      where: { restaurantId: user.restaurantId, ...(entity ? { entity } : {}) },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { nameAr: true, nameEn: true, email: true } } },
      skip,
      take,
    });
  }
}
