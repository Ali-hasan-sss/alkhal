import { Body, Controller, Get, Param, Post, Query, UseGuards, Inject } from '@nestjs/common';
import { SalesService } from './sales.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/guards/jwt.strategy';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import {
  collectDrawerSchema,
  holdOrderSchema,
  posCheckoutSchema,
  refundSaleSchema,
  settleDebtSchema,
} from '@alkhal/validation';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SalesController {
  constructor(@Inject(SalesService) private readonly sales: SalesService) {}

  @Get('pos/catalog')
  @RequirePermissions('pos.access')
  catalog(@CurrentUser() user: AuthUser) {
    return this.sales.catalog(user.restaurantId);
  }

  @Post('pos/checkout')
  @RequirePermissions('sales.create')
  checkout(@CurrentUser() user: AuthUser, @Body(new ZodPipe(posCheckoutSchema)) body: unknown) {
    return this.sales.checkout(user, body);
  }

  @Post('pos/hold')
  @RequirePermissions('sales.create')
  hold(@CurrentUser() user: AuthUser, @Body(new ZodPipe(holdOrderSchema)) body: unknown) {
    return this.sales.hold(user, body);
  }

  @Get('pos/held')
  @RequirePermissions('pos.access')
  held(@CurrentUser() user: AuthUser) {
    return this.sales.held(user.restaurantId);
  }

  @Get('pos/held/:id')
  @RequirePermissions('pos.access')
  recall(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sales.recall(user, id);
  }

  @Get('pos/drawer')
  @RequirePermissions('pos.access')
  drawer(@CurrentUser() user: AuthUser) {
    return this.sales.cashierDrawer(user);
  }

  @Get('pos/drawers')
  @RequirePermissions('drawer.collect')
  listDrawers(@CurrentUser() user: AuthUser) {
    return this.sales.listDrawers(user.restaurantId);
  }

  @Post('pos/drawers/collect')
  @RequirePermissions('drawer.collect')
  collectDrawer(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(collectDrawerSchema)) body: unknown,
  ) {
    return this.sales.collectDrawer(user, body);
  }

  @Get('sales/cashiers')
  @RequirePermissions('sales.view')
  cashiers(@CurrentUser() user: AuthUser) {
    return this.sales.cashiers(user.restaurantId);
  }

  @Get('sales')
  @RequirePermissions('sales.view')
  list(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
    @Query('userId') userId?: string,
  ) {
    return this.sales.list(user.restaurantId, status, userId);
  }

  @Get('sales/:id')
  @RequirePermissions('sales.view')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sales.get(user.restaurantId, id);
  }

  @Get('debts')
  @RequirePermissions('debts.view')
  listDebts(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    return this.sales.listDebts(user.restaurantId, status);
  }

  @Post('debts/:id/settle')
  @RequirePermissions('debts.settle')
  settleDebt(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(settleDebtSchema)) body: unknown,
  ) {
    return this.sales.settleDebt(user, id, body);
  }

  @Post('sales/:id/cancel')
  @RequirePermissions('sales.cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sales.cancel(user, id);
  }

  @Post('sales/:id/refund')
  @RequirePermissions('sales.refund')
  refund(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(refundSaleSchema)) body: unknown,
  ) {
    return this.sales.refund(user, id, body);
  }
}
