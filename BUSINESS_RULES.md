# Business rules

## Inventory

Stock never changes without an `InventoryTransaction`. Posted purchases, completed sales, production, waste, refunds, and approved stock counts all go through the inventory engine.

Posted financial documents are never deleted. Cancel/refund creates reversal transactions.

## Costing

Weighted average cost:

`(currentQty × currentAvg + incomingQty × incomingCost) / (currentQty + incomingQty)`

Sales and historical reports use **cost snapshots** stored on `SaleItem`. Old sales are not recalculated from today's ingredient prices.

## Pricing

- `FIXED_PRICE`
- `MARKUP_PERCENT` → `cost × (1 + markup)`
- `GROSS_MARGIN_PERCENT` → `cost / (1 - margin)`

Example: cost 2, target margin 40% → price 3.33.

Each product has its own target margin.

## Profit

```
Revenue - COGS = Gross profit
Gross profit - Operating expenses = Net operating profit
```

These are not mixed. Overhead allocation is configurable: `BY_REVENUE`, `BY_SALES_QUANTITY`, `BY_DIRECT_COST`.

## Units

Recipes use base units. Purchases may use purchase units (bag, carton, …) with deterministic conversions.

Example: flour `1 bag = 25,000 g`. Oil `1 carton = 12 L`.

## Money

All financial math uses `decimal.js` / Prisma `Decimal`. Rounding: money 2 dp, unit cost 6 dp, quantity 4 dp, percent 4 dp. Half-up.

## Low stock

When quantity ≤ reorder point, a notification is created:

Suggested purchase = `targetStock - currentStock`
