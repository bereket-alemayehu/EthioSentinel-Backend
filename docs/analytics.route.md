# Frontend Integration: `analytics.route.ts`

Base path: `/api/analytics`

## `GET /api/analytics/reports`

- Auth: required (`accessToken` cookie)
- Roles allowed: `ADMIN`, `RESEARCHER`
- Request body: none

Query params:

- `startDate`: date string (optional)
- `endDate`: date string (optional)
- `district`: string filter (optional, partial match)
- `diseaseType`: string filter (optional, partial match)
- `page`: number (optional, default `1`)
- `limit`: number (optional, default `50`, max `200`)
- `export`: `json` (default) | `pdf` | `excel`

Success responses:

- `200` JSON when `export=json`:

```json
{
  "status": "success",
  "message": "Analytics retrieved successfully",
  "data": {
    "data": [
      {
        "district": "string",
        "diseaseType": "string",
        "totalCases": 0,
        "totalDeaths": 0,
        "reportCount": 0,
        "mortalityRate": "0.0%"
      }
    ],
    "filters": {
      "startDate": "string | undefined",
      "endDate": "string | undefined",
      "district": "string | undefined",
      "diseaseType": "string | undefined"
    },
    "meta": {
      "total": 0,
      "page": 1,
      "limit": 50,
      "totalPages": 1
    }
  }
}
```

- `200` binary PDF when `export=pdf` (`Content-Type: application/pdf`)
- `200` binary XLSX when `export=excel` (`Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`)

