# Frontend Integration: `ai.route.ts`

Base path: `/api/ai`

## `POST /api/ai/anomaly/reports/:reportId/trigger`

- Auth: required (`accessToken` cookie)
- Roles allowed: `ADMIN`, `RESEARCHER`
- Path params:
  - `reportId`: report id (required)
- Request body: none

Success response (`202`):

```json
{
  "status": "success",
  "message": "Anomaly trigger accepted",
  "data": {
    "reportId": "string",
    "accepted": true
  }
}
```

## `POST /api/ai/webhook/anomaly`

- Auth: Public endpoint
- Optional security (environment dependent):
  - Header `x-ai-webhook-token: <token>`
  - Or `Authorization: Bearer <token>`
- Required headers: `Content-Type: application/json`

Request body (`req.body`):

- Flexible JSON payload (logged/accepted as-is by server)

Success response (`200`):

```json
{
  "status": "success",
  "message": "AI webhook ingested successfully",
  "data": {
    "received": true
  }
}
```

## `POST /api/ai/nlp/advisory-draft`

- Auth: internal service auth (`x-internal-token`), not JWT
- Required headers:
  - `Content-Type: application/json`
  - `x-internal-token: <AI_INTERNAL_TOKEN>` (required when configured)

Request body (`req.body`):

```json
{
  "diseaseType": "string (required)",
  "regionName": "string (required, must match existing region name)",
  "language": "string (required)",
  "title": "string (required)",
  "content": "string (required)",
  "riskLevel": "string (optional, default MODERATE)",
  "sourceReportId": "string (optional)"
}
```

Success response (`201`):

```json
{
  "status": "success",
  "message": "Advisory draft persisted",
  "data": {
    "id": "string",
    "status": "DRAFT"
  }
}
```

