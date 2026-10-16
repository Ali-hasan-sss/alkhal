-- Add reusable sauce recipes for existing restaurants and relink product components.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO "Recipe" (
  "id", "restaurantId", "nameAr", "nameEn", "outputIngredientId", "outputQuantity", "outputUnitId", "wasteAllowancePercent", "active", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  sauce."restaurantId",
  'صلصة بيتزا',
  'Pizza sauce',
  sauce.id,
  4000,
  sauce."baseUnitId",
  0,
  true,
  NOW(),
  NOW()
FROM "Ingredient" sauce
WHERE sauce.sku = 'PREP-SAUCE'
  AND NOT EXISTS (
    SELECT 1 FROM "Recipe" r WHERE r."outputIngredientId" = sauce.id
  );

INSERT INTO "RecipeItem" ("id", "recipeId", "ingredientId", "quantity", "unitId", "isPackaging")
SELECT gen_random_uuid(), r.id, raw.id, qty.quantity, raw."baseUnitId", false
FROM "Recipe" r
JOIN "Ingredient" sauce ON sauce.id = r."outputIngredientId" AND sauce.sku = 'PREP-SAUCE'
JOIN (VALUES
  ('SAU-001', 3200),
  ('TOM-001', 500),
  ('GRL-001', 40),
  ('OIL-001', 80),
  ('SLT-001', 20),
  ('ORG-001', 10)
) AS qty(sku, quantity) ON true
JOIN "Ingredient" raw ON raw."restaurantId" = r."restaurantId" AND raw.sku = qty.sku
WHERE NOT EXISTS (
  SELECT 1 FROM "RecipeItem" ri WHERE ri."recipeId" = r.id AND ri."ingredientId" = raw.id
);

INSERT INTO "Recipe" (
  "id", "restaurantId", "nameAr", "nameEn", "outputIngredientId", "outputQuantity", "outputUnitId", "wasteAllowancePercent", "active", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  garlic."restaurantId",
  'صلصة ثوم',
  'Garlic sauce',
  garlic.id,
  2000,
  garlic."baseUnitId",
  0,
  true,
  NOW(),
  NOW()
FROM "Ingredient" garlic
WHERE garlic.sku = 'PREP-GARLIC'
  AND NOT EXISTS (
    SELECT 1 FROM "Recipe" r WHERE r."outputIngredientId" = garlic.id
  );

INSERT INTO "RecipeItem" ("id", "recipeId", "ingredientId", "quantity", "unitId", "isPackaging")
SELECT gen_random_uuid(), r.id, raw.id, qty.quantity, raw."baseUnitId", false
FROM "Recipe" r
JOIN "Ingredient" garlic ON garlic.id = r."outputIngredientId" AND garlic.sku = 'PREP-GARLIC'
JOIN (VALUES ('GRL-001', 250), ('OIL-001', 1200), ('SLT-001', 20)) AS qty(sku, quantity) ON true
JOIN "Ingredient" raw ON raw."restaurantId" = r."restaurantId" AND raw.sku = qty.sku
WHERE NOT EXISTS (
  SELECT 1 FROM "RecipeItem" ri WHERE ri."recipeId" = r.id AND ri."ingredientId" = raw.id
);

UPDATE "ProductComponent" pc
SET "recipeId" = r.id,
    "ingredientId" = NULL
FROM "Recipe" r
WHERE r."outputIngredientId" = pc."ingredientId"
  AND pc."ingredientId" IS NOT NULL
  AND pc."recipeId" IS NULL;
