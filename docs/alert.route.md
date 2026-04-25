# Frontend Integration: `alert.route.ts`

Base path: `/api/alerts`

Auth for all endpoints: required (`accessToken` cookie)

## `GET /api/alerts/`

- Roles allowed: `ADMIN`, `RESEARCHER`
- Request body: none
- Query params: none

Success response (`200`):

```json
{
  "status": "success",
  "message": "Alerts retrieved successfully",
  "data": [
    {
      "id": "string",
      "disease": "string | null",
      "severity": "LOW | MEDIUM | HIGH | CRITICAL",
      "channelString": "WEB | SMS | USSD | EMAIL",
      "advisory": "string",
      "status": "Draft | Approved",
      "targetZone": "string",
      "isDelivered": false
    }
  ]
}
```

## `PUT /api/alerts/:id/approve`

- Roles allowed: `ADMIN`
- Path params:
  - `id`: alert id (required)
- Request body: none

Success response (`200`): same alert management object as list endpoint.

Notes:

- Fails with `422` if linked advisory exists but is not `APPROVED`.

## `PUT /api/alerts/:id/reject`

- Roles allowed: `ADMIN`
- Path params:
  - `id`: alert id (required)
- Request body: none

Success response (`200`): same alert management object as list endpoint.

## `POST /api/alerts/`

- Roles allowed: `ADMIN`
- Required headers: `Content-Type: application/json`

Request body (`req.body`):

```json
{
  "targetZone": "string (required)",
  "title": "string (required)",
  "message": "string (required)",
  "severity": "LOW | MEDIUM | HIGH | CRITICAL (optional, default MEDIUM)",
  "channel": "WEB | SMS | USSD | EMAIL (optional, default WEB)",
  "diseaseId": "number (optional)",
  "advisoryId": "string (optional; must reference APPROVED advisory)",
  "createdById": "string (optional; default authenticated user)",
  "isDelivered": "boolean (optional, default false)"
}
```

Success response (`201`):

```json
{
  "status": "success",
  "message": "Alert created successfully",
  "data": {
    "id": "string",
    "disease": "string | null",
    "severity": "LOW | MEDIUM | HIGH | CRITICAL",
    "channelString": "WEB | SMS | USSD | EMAIL",
    "advisory": "string",
    "status": "Draft | Approved",
    "targetZone": "string",
    "isDelivered": false
  }
}
```

