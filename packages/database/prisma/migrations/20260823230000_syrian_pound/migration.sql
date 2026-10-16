ALTER TABLE "Restaurant" ALTER COLUMN "currency" SET DEFAULT 'SYP';
ALTER TABLE "Restaurant" ALTER COLUMN "currencySymbol" SET DEFAULT 'ل.س';
ALTER TABLE "Restaurant" ALTER COLUMN "timezone" SET DEFAULT 'Asia/Damascus';

UPDATE "Restaurant"
SET
  "currency" = 'SYP',
  "currencySymbol" = 'ل.س',
  "timezone" = 'Asia/Damascus';
