# API

Base URL: `/api`

Auth: `Authorization: Bearer <access>` plus httpOnly refresh cookie (body refresh token also accepted).

## Auth

- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET  /api/auth/me`

## Domain operations

- `POST /api/purchases/:id/post`
- `POST /api/purchases/:id/cancel`
- `POST /api/purchases/:id/payments`
- `POST /api/production/:id/complete`
- `POST /api/production/:id/cancel`
- `POST /api/pos/checkout`
- `POST /api/pos/hold`
- `GET  /api/pos/held`
- `POST /api/sales/:id/cancel`
- `POST /api/sales/:id/refund`
- `POST /api/stock-counts/:id/approve`
- `POST /api/inventory/adjust`
- `POST /api/waste`

CRUD collections follow `GET/POST /api/{resource}` and `GET/PATCH /api/{resource}/:id`.

## Errors

```json
{
  "statusCode": 400,
  "error": "INSUFFICIENT_STOCK",
  "message": "المخزون غير كافٍ ...",
  "messageEn": "Insufficient stock ..."
}
```

Stack traces are not returned in production.
