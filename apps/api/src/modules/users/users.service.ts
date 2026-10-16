import { Inject, Injectable } from '@nestjs/common';
import { createUserSchema, updateUserSchema } from '@alkhal/validation';
import { PrismaService } from '../../common/prisma/prisma.service';
import { hashPassword } from '../../common/crypto/password';
import { Errors } from '../../common/errors';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../../common/guards/jwt.strategy';

@Injectable()
export class UsersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  list(restaurantId: string) {
    return this.prisma.user.findMany({
      where: { restaurantId },
      select: {
        id: true,
        email: true,
        nameAr: true,
        nameEn: true,
        status: true,
        lastLoginAt: true,
        role: { select: { id: true, code: true, nameAr: true, nameEn: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(user: AuthUser, input: unknown) {
    const dto = createUserSchema.parse(input);
    const created = await this.prisma.user.create({
      data: {
        restaurantId: user.restaurantId,
        email: dto.email.toLowerCase(),
        passwordHash: await hashPassword(dto.password),
        nameAr: dto.nameAr,
        nameEn: dto.nameEn,
        roleId: dto.roleId,
      },
    });
    await this.audit.log({
      restaurantId: user.restaurantId,
      userId: user.id,
      action: 'CREATE',
      entity: 'User',
      entityId: created.id,
    });
    const { passwordHash: _, ...safe } = created;
    return safe;
  }

  async update(actor: AuthUser, id: string, input: unknown) {
    const dto = updateUserSchema.parse(input);
    const existing = await this.prisma.user.findFirst({
      where: { id, restaurantId: actor.restaurantId },
    });
    if (!existing) {
      throw Errors.notFound('User');
    }
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        nameAr: dto.nameAr,
        nameEn: dto.nameEn,
        roleId: dto.roleId,
        status: dto.status,
        ...(dto.password ? { passwordHash: await hashPassword(dto.password) } : {}),
      },
    });
    await this.audit.log({
      restaurantId: actor.restaurantId,
      userId: actor.id,
      action: 'UPDATE',
      entity: 'User',
      entityId: id,
    });
    const { passwordHash: _, ...safe } = updated;
    return safe;
  }
}
