import { Body, Controller, Get, Param, Post, Query, UseGuards, Inject } from '@nestjs/common';
import { ProductionService } from './production.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/guards/jwt.strategy';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import {
  completeProductionSchema,
  createProductionSchema,
  runProductionSchema,
  wasteProductionYieldSchema,
} from '@alkhal/validation';

@Controller('production')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProductionController {
  constructor(@Inject(ProductionService) private readonly production: ProductionService) {}

  @Get('ready')
  @RequirePermissions('production.create')
  ready(@CurrentUser() user: AuthUser) {
    return this.production.ready(user.restaurantId);
  }

  @Get('prepareable')
  @RequirePermissions('products.manage')
  prepareable(@CurrentUser() user: AuthUser) {
    return this.production.prepareableQuantities(user.restaurantId);
  }

  @Get('preview')
  @RequirePermissions('production.create')
  preview(
    @CurrentUser() user: AuthUser,
    @Query('recipeId') recipeId?: string,
    @Query('quantity') quantity: string,
    @Query('productId') productId?: string,
  ) {
    return this.production.preview(user.restaurantId, recipeId, quantity, productId);
  }

  @Get()
  @RequirePermissions('production.create')
  list(@CurrentUser() user: AuthUser) {
    return this.production.list(user.restaurantId);
  }

  @Post()
  @RequirePermissions('production.create')
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(createProductionSchema)) body: unknown) {
    return this.production.create(user, body);
  }

  @Post('run')
  @RequirePermissions('production.complete')
  run(@CurrentUser() user: AuthUser, @Body(new ZodPipe(runProductionSchema)) body: unknown) {
    return this.production.run(user, body);
  }

  @Post(':id/complete')
  @RequirePermissions('production.complete')
  complete(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(completeProductionSchema)) body: unknown,
  ) {
    return this.production.complete(user, id, body);
  }

  @Post(':id/waste-yield')
  @RequirePermissions('waste.create')
  wasteYield(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(wasteProductionYieldSchema)) body: unknown,
  ) {
    return this.production.wasteYield(user, id, body);
  }

  @Post(':id/cancel')
  @RequirePermissions('production.cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.production.cancel(user, id);
  }
}
