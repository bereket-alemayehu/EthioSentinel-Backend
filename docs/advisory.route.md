# Frontend Integration: `advisory.route.ts`

Base path: `/api/advisories`

## `POST /api/advisories/symptom-check`

- Auth: Public
- Required headers: `Content-Type: application/json`

Request body (`req.body`):

```json
{
  "symptoms": ["string (at least one required)"],
  "language": "ENGLISH | AMHARIC (optional, default ENGLISH)",
  "location": "string (optional)"
}
```

Success response (`200`):

```json
{
  "status": "success",
  "message": "Symptom assessment completed",
  "data": {
    "selectedSymptoms": ["string"],
    "probableDisease": "string",
    "riskLevel": "LOW | MODERATE | HIGH",
    "advice": "string",
    "disclaimer": "string",
    "language": "ENGLISH | AMHARIC"
  }
}
```

## `POST /api/advisories/generate`

- Auth: required (`accessToken` cookie)
- Roles allowed: `ADMIN`, `HEW`
- Required headers: `Content-Type: application/json`

Request body (`req.body`):

```json
{
  "diseaseName": "string (required)",
  "severity": "LOW | MODERATE | HIGH | CRITICAL (required)",
  "location": "string (required)",
  "language": "ENGLISH | AMHARIC (optional, default ENGLISH)"
}
```

Success response (`200`):

```json
{
  "status": "success",
  "message": "Advisory text generated successfully",
  "data": {
    "diseaseName": "string",
    "severity": "LOW | MODERATE | HIGH | CRITICAL",
    "location": "string",
    "language": "ENGLISH | AMHARIC",
    "symptoms": ["string"],
    "preventionSteps": ["string"],
    "treatmentAdvice": ["string"]
  }
}
```

## `GET /api/advisories/`

- Auth: Public
- Request body: none
- Query params: none

Success response (`200`): approved advisories list.

## `GET /api/advisories/drafts`

- Auth: required (`accessToken` cookie)
- Roles allowed: `ADMIN`
- Query params:
  - `page`: number (optional, default 1)
  - `limit`: number (optional, default 20, max 100)
- Request body: none

Success response (`200`):

```json
{
  "status": "success",
  "message": "Draft advisories retrieved successfully",
  "data": {
    "data": [
      {
        "id": "string",
        "status": "DRAFT",
        "diseaseType": "string",
        "title": "string",
        "content": "string"
      }
    ],
    "meta": {
      "total": 0,
      "page": 1,
      "limit": 20,
      "totalPages": 1
    }
  }
}
```

## `POST /api/advisories/`

- Auth: required (`accessToken` cookie)
- Roles allowed: `ADMIN`
- Required headers: `Content-Type: application/json`

Request body (`req.body`):

```json
{
  "diseaseType": "string (required)",
  "regionId": "number (required)",
  "title": "string (required)",
  "content": "string (required)",
  "districtId": "number (optional)",
  "sourceReportId": "string (optional)",
  "approvedById": "string (optional)",
  "language": "string (optional, default AMHARIC)",
  "status": "DRAFT | APPROVED | REJECTED (optional, default DRAFT)",
  "riskLevel": "string (optional, default MODERATE)",
  "generatedByAI": "boolean (optional, default true)"
}
```

Success response (`201`): created advisory object with linked `region` and `district`.

## `PATCH /api/advisories/:id/approve`

- Auth: required (`accessToken` cookie)
- Roles allowed: `ADMIN`
- Path params:
  - `id`: advisory id
- Request body: none

Success response (`200`): updated advisory with `status: "APPROVED"` and `approvedAt`.

## `PATCH /api/advisories/:id/reject`

- Auth: required (`accessToken` cookie)
- Roles allowed: `ADMIN`
- Path params:
  - `id`: advisory id
- Request body: none

Success response (`200`): updated advisory with `status: "REJECTED"`.

