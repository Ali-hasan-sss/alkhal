import { Body, Controller, Get, Post, UseGuards, Inject } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/guards/jwt.strategy';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { createEmployeeSchema, salaryPaymentSchema } from '@alkhal/validation';
import { hashPassword } from '../../common/crypto/password';
import { Errors } from '../../common/errors';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EmployeesController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get('employees/roles')
  @RequirePermissions('employees.manage')
  roles(@CurrentUser() user: AuthUser) {
    return this.prisma.role.findMany({
      where: { restaurantId: user.restaurantId },
      select: { id: true, code: true, nameAr: true, nameEn: true },
      orderBy: { nameAr: 'asc' },
    });
  }

  @Get('employees')
  @RequirePermissions('employees.manage')
  list(@CurrentUser() user: AuthUser) {
    return this.prisma.employee.findMany({
      where: { restaurantId: user.restaurantId },
      include: {
        payments: { orderBy: { paidAt: 'desc' }, take: 5 },
        user: { select: { email: true, status: true, role: { select: { code: true, nameAr: true } } } },
      },
      orderBy: { nameAr: 'asc' },
    });
  }

  @Post('employees')
  @RequirePermissions('employees.manage')
  async create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(createEmployeeSchema)) body: unknown,
  ) {
    const dto = createEmployeeSchema.parse(body);
    const email = dto.email.toLowerCase();
    const existing = await this.prisma.user.findFirst({
      where: { restaurantId: user.restaurantId, email },
    });
    if (existing) {
      throw Errors.conflict('EMAIL_TAKEN', 'البريد الإلكتروني مستخدم مسبقاً', 'Email is already used');
    }
    const role = await this.prisma.role.findFirst({
      where: { id: dto.roleId, restaurantId: user.restaurantId },
    });
    if (!role) {
      throw Errors.badRequest('ROLE_INVALID', 'الدور غير صالح', 'Invalid role');
    }
    const { email: _email, password, roleId, ...employeeData } = dto;
    const passwordHash = await hashPassword(password);
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.user.create({
        data: {
          restaurantId: user.restaurantId,
          email,
          passwordHash,
          nameAr: dto.nameAr,
          nameEn: dto.nameEn,
          roleId,
        },
      });
      return tx.employee.create({
        data: {
          restaurantId: user.restaurantId,
          userId: account.id,
          ...employeeData,
        },
        include: {
          user: { select: { email: true, status: true, role: { select: { code: true, nameAr: true } } } },
        },
      });
    });
  }

  @Post('salary-payments')
  @RequirePermissions('employees.pay')
  async pay(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(salaryPaymentSchema)) body: unknown,
  ) {
    const dto = salaryPaymentSchema.parse(body);
    const salaries = await this.prisma.expenseCategory.findFirst({
      where: { restaurantId: user.restaurantId, code: 'salaries' },
    });
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.salaryPayment.create({
        data: {
          restaurantId: user.restaurantId,
          employeeId: dto.employeeId,
          amount: dto.amount,
          periodStart: dto.periodStart,
          periodEnd: dto.periodEnd,
          notes: dto.notes,
        },
      });
      if (salaries) {
        const employee = await tx.employee.findUniqueOrThrow({ where: { id: dto.employeeId } });
        await tx.expense.create({
          data: {
            restaurantId: user.restaurantId,
            categoryId: salaries.id,
            amount: dto.amount,
            expenseDate: payment.paidAt,
            description: `راتب ${employee.nameAr}`,
            paid: true,
            paymentMethod: 'CASH',
            userId: user.id,
          },
        });
      }
      return payment;
    });
  }
}
