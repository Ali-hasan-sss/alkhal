-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'DEBT';

-- CreateEnum
CREATE TYPE "CustomerDebtStatus" AS ENUM ('OPEN', 'SETTLED', 'CANCELLED');

-- CreateTable
CREATE TABLE "CustomerDebt" (
    "id" UUID NOT NULL,
    "restaurantId" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "customerName" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "remainingAmount" DECIMAL(18,2) NOT NULL,
    "status" "CustomerDebtStatus" NOT NULL DEFAULT 'OPEN',
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerDebt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerDebtSettlement" (
    "id" UUID NOT NULL,
    "debtId" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "notes" TEXT,
    "userId" UUID NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerDebtSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerDebt_saleId_key" ON "CustomerDebt"("saleId");

-- CreateIndex
CREATE INDEX "CustomerDebt_restaurantId_status_createdAt_idx" ON "CustomerDebt"("restaurantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerDebt_restaurantId_customerName_idx" ON "CustomerDebt"("restaurantId", "customerName");

-- CreateIndex
CREATE INDEX "CustomerDebtSettlement_debtId_paidAt_idx" ON "CustomerDebtSettlement"("debtId", "paidAt");

-- AddForeignKey
ALTER TABLE "CustomerDebt" ADD CONSTRAINT "CustomerDebt_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerDebt" ADD CONSTRAINT "CustomerDebt_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerDebtSettlement" ADD CONSTRAINT "CustomerDebtSettlement_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "CustomerDebt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerDebtSettlement" ADD CONSTRAINT "CustomerDebtSettlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
