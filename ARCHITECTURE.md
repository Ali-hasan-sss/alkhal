# Architecture

Al-Khal is a **modular monolith**.

```
apps/web     → REST → apps/api → PostgreSQL (Prisma)
apps/mobile  ↗
                     ↘ shared costing/pricing/unit math
```

NestJS modules stay independently structured so they can be extracted later. There are no microservices.

## Backend modules

`auth`, `users`, `roles`, `permissions`, `restaurants`, `categories`, `products`, `ingredients`, `units`, `recipes`, `production`, `inventory`, `purchases`, `suppliers`, `sales`, `pos`, `expenses`, `employees`, `accounting/reports`, `notifications`, `audit`

Controllers are thin. Inventory, purchases, production, and sales mutate stock only through `InventoryService.applyChange`, which always writes an immutable `InventoryTransaction`.

## Frontend

Next.js App Router, `next-intl` (Arabic default, RTL), TanStack Query, Recharts.

Mobile POS is an Expo (React Native) app in `apps/mobile`. Cashiers and admins sign in with the same accounts and hit `/pos/*` on the API. Tokens are stored on-device (SecureStore), not cookies.

Brand: orange primary actions, burgundy identity, warm-white surfaces.

## Assumptions

- Single restaurant per deployment for v1 (`Restaurant` still exists for isolation).
- Default currency is ILS (`₪`). Configurable on the restaurant record.
- Redis is in Docker Compose for future queues; v1 does not require BullMQ.
- Socket.IO is available for later live POS/inventory events; core flows are request/response.
- Prepared materials are `Ingredient` rows with `type = PREPARED` plus a recipe whose `outputIngredientId` points at them.
