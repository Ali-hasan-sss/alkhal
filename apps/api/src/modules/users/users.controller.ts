import { Body, Controller, Get, Param, Patch, Post, UseGuards, Inject } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/guards/jwt.strategy';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { createUserSchema, updateUserSchema } from '@alkhal/validation';

@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  @Get()
  @RequirePermissions('users.manage')
  list(@CurrentUser() user: AuthUser) {
    return this.users.list(user.restaurantId);
  }

  @Post()
  @RequirePermissions('users.manage')
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(createUserSchema)) body: unknown) {
    return this.users.create(user, body);
  }

  @Patch(':id')
  @RequirePermissions('users.manage')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(updateUserSchema)) body: unknown,
  ) {
    return this.users.update(user, id, body);
  }
}
