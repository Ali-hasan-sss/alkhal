-- AlterTable
ALTER TABLE "ProductionBatch" ALTER COLUMN "recipeId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ProductComponent" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "recipeId" UUID,
    "ingredientId" UUID,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitId" UUID NOT NULL,
    "isPackaging" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductComponent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductComponent_productId_idx" ON "ProductComponent"("productId");

-- AddForeignKey
ALTER TABLE "ProductComponent" ADD CONSTRAINT "ProductComponent_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductComponent" ADD CONSTRAINT "ProductComponent_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductComponent" ADD CONSTRAINT "ProductComponent_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductComponent" ADD CONSTRAINT "ProductComponent_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Exactly one of recipe or ingredient
ALTER TABLE "ProductComponent" ADD CONSTRAINT "ProductComponent_source_check" CHECK (
  ("recipeId" IS NOT NULL AND "ingredientId" IS NULL)
  OR ("recipeId" IS NULL AND "ingredientId" IS NOT NULL)
);

-- Convert existing product-only recipes into reusable components:
-- prepared items link to the recipe that produces them (dough, sauce, …);
-- raw/packaging items stay as ingredients.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO "ProductComponent" (
  "id", "productId", "recipeId", "ingredientId", "quantity", "unitId", "isPackaging", "sortOrder"
)
SELECT
  gen_random_uuid(),
  r."productId",
  src."id",
  CASE WHEN src."id" IS NULL THEN ri."ingredientId" ELSE NULL END,
  ri."quantity",
  ri."unitId",
  ri."isPackaging",
  (row_number() OVER (PARTITION BY r."productId" ORDER BY ri."id") - 1)::integer
FROM "RecipeItem" ri
JOIN "Recipe" r ON r."id" = ri."recipeId"
LEFT JOIN LATERAL (
  SELECT r2."id"
  FROM "Recipe" r2
  WHERE r2."outputIngredientId" = ri."ingredientId"
    AND r2."active" = true
    AND r2."id" <> r."id"
  ORDER BY r2."createdAt"
  LIMIT 1
) src ON true
WHERE r."productId" IS NOT NULL
  AND r."outputIngredientId" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "ProductComponent" pc WHERE pc."productId" = r."productId"
  );

DELETE FROM "Recipe" r
WHERE r."productId" IS NOT NULL
  AND r."outputIngredientId" IS NULL
  AND EXISTS (SELECT 1 FROM "ProductComponent" pc WHERE pc."productId" = r."productId")
  AND NOT EXISTS (SELECT 1 FROM "ProductionBatch" b WHERE b."recipeId" = r."id");
