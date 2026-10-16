# Development

## Prerequisites

Node 20+, pnpm 10, Docker.

## Phase checklist (after each phase)

1. TypeScript (`pnpm typecheck`)
2. Lint (`pnpm lint`)
3. Tests (`pnpm test`)
4. Prisma validate (`pnpm db:validate`)
5. Migrations (`pnpm db:migrate`)

## Local services

```bash
docker compose up -d postgres
```

Redis is optional in v1.

## Environment

Copy `.env.example` to `.env`. Prisma also reads `packages/database/.env` if present; keep `DATABASE_URL` in both during local setup.

## Tests that matter

Critical logic lives in `packages/shared` and is covered by Vitest:

- Recipe costing
- Unit conversion
- Weighted average cost
- Pricing / gross margin
- Overhead allocation
- Sale/purchase totals

## Brand / i18n

Arabic-first, RTL-first. User-facing strings belong in `apps/web/src/messages/*.json`, `apps/mobile` screens, or API `message`/`messageEn` fields — not in business math.

## Mobile POS

```bash
pnpm db:seed          # creates cashier@alkhal.local if missing
pnpm dev              # API + web
pnpm dev:mobile       # Expo Go QR
```

Use the same owner or cashier login. On a physical phone, Expo derives the API host from the Metro LAN address (`http://<pc-ip>:4000/api`). Override with `EXPO_PUBLIC_API_URL` if needed.
