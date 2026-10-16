import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PermissionCode } from '@alkhal/types';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { Errors } from '../errors';
import type { AuthUser } from './jwt.strategy';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PermissionCode[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }
    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthUser | undefined;
    if (!user) {
      throw Errors.unauthorized();
    }
    const ok = required.every((perm) => user.permissions.includes(perm));
    if (!ok) {
      throw Errors.forbidden();
    }
    return true;
  }
}
