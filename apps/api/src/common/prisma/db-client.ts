export type DbClient =
  import('@alkhal/database').Prisma.TransactionClient | import('./prisma.service').PrismaService;
