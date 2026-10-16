# الخال — Al-Khal Restaurant Management System

Restaurant management platform for **الخال (Al-Khal)**: inventory, recipes, costing, production, purchases, POS, expenses, and profit.

This is a modular monolith, not a POS-only app.

## Apps

- `apps/web` — Next.js Arabic-first RTL interface
- `apps/api` — NestJS REST API
- `apps/mobile` — Expo (React Native) POS for cashiers and admins

## Packages

- `packages/database` — Prisma schema, client, seed
- `packages/shared` — decimal-safe money, costing, pricing, units
- `packages/validation` — Zod schemas
- `packages/types` — shared enums
- `packages/ui` — brand tokens

## Quick start

```bash
cp .env.example .env
docker compose up -d postgres
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:4000/api
- Mobile POS: `pnpm dev:mobile` then scan the QR with Expo Go
- Postgres: `127.0.0.1:5433` (avoids clashing with a local PostgreSQL on 5432)
- Default owner: `owner@alkhal.local` / `ChangeMe!123`
- Default cashier: `cashier@alkhal.local` / `ChangeMe!123`

## Scripts

| Command | Purpose |
| --- | --- |
| `pnpm dev` | API + web |
| `pnpm dev:mobile` | Expo POS (React Native) |
| `pnpm test` | Business-rule tests |
| `pnpm typecheck` | TypeScript |
| `pnpm db:validate` | Prisma schema validation |

See [DEVELOPMENT.md](./DEVELOPMENT.md), [ARCHITECTURE.md](./ARCHITECTURE.md), [BUSINESS_RULES.md](./BUSINESS_RULES.md), [DATABASE.md](./DATABASE.md), and [API.md](./API.md).
