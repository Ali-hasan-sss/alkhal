-- CreateTable
CREATE TABLE "CashHandover" (
    "id" UUID NOT NULL,
    "restaurantId" UUID NOT NULL,
    "cashierUserId" UUID NOT NULL,
    "receivedById" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "saleCount" INTEGER NOT NULL DEFAULT 0,
    "periodFrom" TIMESTAMP(3) NOT NULL,
    "periodTo" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashHandover_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CashHandover_restaurantId_cashierUserId_createdAt_idx" ON "CashHandover"("restaurantId", "cashierUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "CashHandover" ADD CONSTRAINT "CashHandover_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashHandover" ADD CONSTRAINT "CashHandover_cashierUserId_fkey" FOREIGN KEY ("cashierUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashHandover" ADD CONSTRAINT "CashHandover_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
