-- AlterTable
ALTER TABLE "ProductionBatch" ALTER COLUMN "outputIngredientId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ProductionBatch" ADD COLUMN "productId" UUID,
ADD COLUMN "remainingQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "ProductionBatch_restaurantId_productId_status_idx" ON "ProductionBatch"("restaurantId", "productId", "status");

-- AddForeignKey
ALTER TABLE "ProductionBatch" ADD CONSTRAINT "ProductionBatch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
