import { Inject, Injectable } from '@nestjs/common';
import type { AuditAction, Prisma } from '@alkhal/database';
import { PrismaService } from '../../common/prisma/prisma.service';

type Db = Prisma.TransactionClient | PrismaService;

@Injectable()
export class AuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async log(
    params: {
      restaurantId: string;
      userId?: string | null;
      action: AuditAction;
      entity: string;
      entityId: string;
      before?: Prisma.InputJsonValue | null;
      after?: Prisma.InputJsonValue | null;
      ipAddress?: string | null;
    },
    db: Db = this.prisma,
  ) {
    await db.auditLog.create({
      data: {
        restaurantId: params.restaurantId,
        userId: params.userId ?? null,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        before: params.before ?? undefined,
        after: params.after ?? undefined,
        ipAddress: params.ipAddress ?? undefined,
      },
    });
  }
}
