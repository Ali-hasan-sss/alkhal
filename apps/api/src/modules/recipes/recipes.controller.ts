import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards, Inject } from '@nestjs/common';
import { RecipesService } from './recipes.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/guards/jwt.strategy';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { createRecipeSchema, updateRecipeSchema } from '@alkhal/validation';

@Controller('recipes')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RecipesController {
  constructor(@Inject(RecipesService) private readonly recipes: RecipesService) {}

  @Get()
  @RequirePermissions('recipes.manage')
  list(@CurrentUser() user: AuthUser) {
    return this.recipes.list(user.restaurantId);
  }

  @Get(':id')
  @RequirePermissions('recipes.manage')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.recipes.get(user.restaurantId, id);
  }

  @Get(':id/cost')
  @RequirePermissions('recipes.manage')
  cost(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.recipes.costRecipe(user.restaurantId, id);
  }

  @Post()
  @RequirePermissions('recipes.manage')
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(createRecipeSchema)) body: unknown) {
    return this.recipes.create(user, body);
  }

  @Patch(':id')
  @RequirePermissions('recipes.manage')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(updateRecipeSchema)) body: unknown,
  ) {
    return this.recipes.update(user, id, body);
  }

  @Delete(':id')
  @RequirePermissions('recipes.manage')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.recipes.remove(user, id);
  }
}
