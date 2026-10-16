# Database

PostgreSQL + Prisma. Schema: `packages/database/prisma/schema.prisma`.

## Identifiers and money

- UUIDs for all primary keys
- `Decimal(18, 2)` for money totals
- `Decimal(18, 6)` for unit costs
- `Decimal(18, 4)` for quantities
- `createdAt` / `updatedAt` on mutable records
- Inventory movements are append-only `InventoryTransaction` rows

## Inventory

`InventoryBalance.quantity` is a cache. It is updated only in the same database transaction as the inventory transaction that caused the change.

Transaction types: `PURCHASE`, `SALE`, `PRODUCTION_CONSUMPTION`, `PRODUCTION_OUTPUT`, `WASTE`, `RETURN`, `ADJUSTMENT`, `STOCK_COUNT`, `TRANSFER`, `REFUND`, `PURCHASE_REVERSAL`, `PRODUCTION_REVERSAL`.

## Seed

Seeds roles, permissions, units, conversions, categories, expense categories, waste reasons, sample ingredients/products/recipes, owner user, and one supplier.

Does **not** seed sales, purchases, or other financial documents.

## Migrations

```bash
pnpm db:migrate
pnpm db:migrate:deploy   # production
```

Never change production schema by hand.
