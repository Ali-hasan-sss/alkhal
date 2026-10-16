import { Body, Controller, Get, Post, UseGuards, Inject } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/guards/jwt.strategy';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { createExpenseSchema } from '@alkhal/validation';
import { AuditService } from '../audit/audit.service';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ExpensesController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get('expense-categories')
  @RequirePermissions('expenses.view')
  categories(@CurrentUser() user: AuthUser) {
    return this.prisma.expenseCategory.findMany({
      where: { restaurantId: user.restaurantId },
      orderBy: { nameAr: 'asc' },
    });
  }

  @Get('expenses')
  @RequirePermissions('expenses.view')
  list(@CurrentUser() user: AuthUser) {
    return this.prisma.expense.findMany({
      where: { restaurantId: user.restaurantId },
      include: { category: true },
      orderBy: { expenseDate: 'desc' },
    });
  }

  @Post('expenses')
  @RequirePermissions('expenses.create')
  async create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(createExpenseSchema)) body: unknown,
  ) {
    const dto = createExpenseSchema.parse(body);
    const expense = await this.prisma.expense.create({
      data: {
        restaurantId: user.restaurantId,
        categoryId: dto.categoryId,
        amount: dto.amount,
        expenseDate: dto.expenseDate,
        description: dto.description,
        paid: dto.paid,
        paymentMethod: dto.paymentMethod,
        userId: user.id,
      },
      include: { category: true },
    });
    await this.audit.log({
      restaurantId: user.restaurantId,
      userId: user.id,
      action: 'EXPENSE_CREATED',
      entity: 'Expense',
      entityId: expense.id,
      after: { amount: expense.amount.toString() },
    });
    return expense;
  }
}
