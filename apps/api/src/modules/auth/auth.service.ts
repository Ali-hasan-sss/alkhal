import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { loginSchema, refreshSchema } from '@alkhal/validation';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { Errors } from '../../common/errors';
import { generateRefreshToken, hashToken, verifyPassword } from '../../common/crypto/password';
import type { JwtPayload } from '../../common/guards/jwt.strategy';

const COOKIE = 'refresh_token';

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async login(input: unknown, meta: { userAgent?: string; ip?: string }) {
    const dto = loginSchema.parse(input);
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email.toLowerCase() },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
        restaurant: true,
      },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw Errors.unauthorized();
    }
    const ok = await verifyPassword(user.passwordHash, dto.password);
    if (!ok) {
      throw Errors.unauthorized();
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.issueTokens(user.id, user.restaurantId, user.roleId, meta);
    await this.audit.log({
      restaurantId: user.restaurantId,
      userId: user.id,
      action: 'LOGIN',
      entity: 'User',
      entityId: user.id,
      ipAddress: meta.ip,
    });

    return {
      ...tokens,
      user: this.publicUser(user),
    };
  }

  async refresh(input: unknown, meta: { userAgent?: string; ip?: string }) {
    const dto = refreshSchema.parse(input);
    const tokenHash = hashToken(dto.refreshToken);
    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
      include: { user: true },
    });
    if (!stored || stored.user.status !== 'ACTIVE') {
      throw Errors.unauthorized();
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const tokens = await this.issueTokens(
      stored.userId,
      stored.user.restaurantId,
      stored.user.roleId,
      meta,
      stored.id,
    );
    return tokens;
  }

  async logout(refreshToken: string) {
    const tokenHash = hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
        restaurant: true,
      },
    });
    if (!user) {
      throw Errors.unauthorized();
    }
    return this.publicUser(user);
  }

  cookieName() {
    return COOKIE;
  }

  private async issueTokens(
    userId: string,
    restaurantId: string,
    roleId: string,
    meta: { userAgent?: string; ip?: string },
    replacedId?: string,
  ) {
    const payload: JwtPayload = { sub: userId, restaurantId, roleId };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get('JWT_ACCESS_EXPIRES_IN') ?? '15m',
    });
    const refreshToken = generateRefreshToken();
    const days = 7;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const created = await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(refreshToken),
        expiresAt,
        userAgent: meta.userAgent,
        ipAddress: meta.ip,
      },
    });
    if (replacedId) {
      await this.prisma.refreshToken.update({
        where: { id: replacedId },
        data: { replacedById: created.id },
      });
    }
    return { accessToken, refreshToken, expiresAt };
  }

  private publicUser(user: {
    id: string;
    email: string;
    nameAr: string;
    nameEn: string;
    restaurantId: string;
    role: {
      code: string;
      nameAr: string;
      nameEn: string;
      permissions: Array<{ permission: { code: string } }>;
    };
    restaurant: { nameAr: string; nameEn: string; currency: string; currencySymbol: string; locale: string; overheadAllocationMethod: string };
  }) {
    return {
      id: user.id,
      email: user.email,
      nameAr: user.nameAr,
      nameEn: user.nameEn,
      restaurantId: user.restaurantId,
      restaurant: user.restaurant,
      role: {
        code: user.role.code,
        nameAr: user.role.nameAr,
        nameEn: user.role.nameEn,
      },
      permissions: user.role.permissions.map((p) => p.permission.code),
    };
  }
}
