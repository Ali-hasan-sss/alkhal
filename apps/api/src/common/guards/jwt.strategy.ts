import { Inject, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { Errors } from '../errors';
import type { PermissionCode } from '@alkhal/types';

export interface JwtPayload {
  sub: string;
  restaurantId: string;
  roleId: string;
}

export interface AuthUser {
  id: string;
  restaurantId: string;
  roleId: string;
  email: string;
  nameAr: string;
  nameEn: string;
  roleCode: string;
  permissions: PermissionCode[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject(ConfigService) config: ConfigService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET ?? config.get<string>('JWT_ACCESS_SECRET') ?? 'dev-only-insecure',
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        role: {
          include: { permissions: { include: { permission: true } } },
        },
      },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw Errors.unauthorized();
    }
    return {
      id: user.id,
      restaurantId: user.restaurantId,
      roleId: user.roleId,
      email: user.email,
      nameAr: user.nameAr,
      nameEn: user.nameEn,
      roleCode: user.role.code,
      permissions: user.role.permissions.map((p) => p.permission.code as PermissionCode),
    };
  }
}
