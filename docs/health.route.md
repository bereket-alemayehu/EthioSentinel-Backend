# Frontend Integration: `health.route.ts`

Base path: `/api/health`

## `GET /api/health/`

- Auth: Public
- Request body: none
- Query params: none

Success response (`200`):

```json
{
  "status": "success",
  "message": "Health check successful",
  "data": {
    "status": "ok",
    "service": "EthioHealthSentinel API",
    "database": "connected",
    "timestamp": "ISO datetime string"
  }
}
```

