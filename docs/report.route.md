# Frontend Integration: `report.route.ts`

Base path: `/api/reports`

Auth for all endpoints: required (`accessToken` cookie)

## `GET /api/reports/weekly`

- Roles allowed: `ADMIN`, `HEW`, `RESEARCHER`
- Query params:
  - `export`: `json` (default) | `pdf` | `excel`
- Request body: none

Success responses:

- `200` JSON when `export=json`:

```json
{
  "status": "success",
  "message": "Weekly report summary retrieved successfully",
  "data": [
    {
      "weekStart": "YYYY-MM-DD",
      "weekEnd": "YYYY-MM-DD",
      "totalCases": 0,
      "totalDeaths": 0,
      "reportCount": 0
    }
  ]
}
```

- `200` binary PDF when `export=pdf` (`Content-Type: application/pdf`)
- `200` binary XLSX when `export=excel` (`Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`)

## `GET /api/reports/`

- Roles allowed: `ADMIN`, `HEW`, `RESEARCHER`
- Request body: none
- Query params: none

Success response (`200`):

```json
{
  "status": "success",
  "message": "Reports retrieved successfully",
  "data": [
    {
      "id": "string",
      "district": "string",
      "diseaseType": "string",
      "reporterId": "string",
      "caseCount": 0,
      "deathCount": 0,
      "isOfflineCached": false,
      "status": "PENDING | REVIEWED | VERIFIED",
      "notes": "string | null",
      "timestamp": "ISO datetime string",
      "reporter": {
        "id": "string",
        "username": "string",
        "role": "ADMIN | HEW | RESEARCHER"
      }
    }
  ]
}
```

## `POST /api/reports/`

- Roles allowed: `ADMIN`, `HEW`
- Required headers: `Content-Type: application/json`

Request body (`req.body`):

```json
{
  "district": "string (required)",
  "diseaseType": "string (required)",
  "caseCount": "number, integer >= 0 (required)",
  "deathCount": "number, integer >= 0 and <= caseCount (required)",
  "notes": "string (optional, sanitized server-side)",
  "isOfflineCached": "boolean (optional, default false)",
  "reporterId": "string (required for ADMIN, ignored for HEW)",
  "status": "optional"
}
```

Success response (`201`):

```json
{
  "status": "success",
  "message": "Report created successfully",
  "data": {
    "id": "string",
    "district": "string",
    "diseaseType": "string",
    "reporterId": "string",
    "caseCount": 0,
    "deathCount": 0,
    "isOfflineCached": false,
    "notes": "string | null"
  }
}
```

## `POST /api/reports/sync`

- Roles allowed: `ADMIN`, `HEW`
- Required headers: `Content-Type: application/json`

Request body (`req.body`):

```json
{
  "reports": [
    {
      "district": "string (required)",
      "diseaseType": "string (required)",
      "caseCount": "number, integer >= 0 (required)",
      "deathCount": "number, integer >= 0 and <= caseCount (required)",
      "notes": "string (optional)",
      "isOfflineCached": "boolean (optional)"
    }
  ]
}
```

Rules:

- `reports` must be non-empty array
- max batch size: `200`

Success response (`207`):

```json
{
  "status": "success",
  "message": "Offline sync completed",
  "data": {
    "accepted": 0,
    "rejected": 0,
    "errors": [
      {
        "index": 0,
        "reason": "Validation failed reason"
      }
    ]
  }
}
```

