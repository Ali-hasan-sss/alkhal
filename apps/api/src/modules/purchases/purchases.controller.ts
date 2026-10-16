import { Body, Controller, Get, Param, Post, UseGuards, Inject } from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/guards/jwt.strategy';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { createPurchaseSchema, supplierPaymentSchema } from '@alkhal/validation';

@Controller('purchases')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PurchasesController {
  constructor(@Inject(PurchasesService) private readonly purchases: PurchasesService) {}

  @Get()
  @RequirePermissions('purchases.view')
  list(@CurrentUser() user: AuthUser) {
    return this.purchases.list(user.restaurantId);
  }

  @Get(':id')
  @RequirePermissions('purchases.view')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.purchases.get(user.restaurantId, id);
  }

  @Post()
  @RequirePermissions('purchases.create')
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(createPurchaseSchema)) body: unknown) {
    return this.purchases.create(user, body);
  }

  @Post(':id/post')
  @RequirePermissions('purchases.post')
  post(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.purchases.post(user, id);
  }

  @Post(':id/cancel')
  @RequirePermissions('purchases.cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.purchases.cancel(user, id);
  }

  @Post(':id/payments')
  @RequirePermissions('purchases.post')
  pay(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(supplierPaymentSchema)) body: unknown,
  ) {
    return this.purchases.pay(user, id, body);
  }
}
