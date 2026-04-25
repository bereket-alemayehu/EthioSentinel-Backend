# Frontend Integration: `disease.route.ts`

Base path: `/api/diseases`

## `GET /api/diseases/`

- Auth: Public
- Request body: none
- Query params: none

Success response (`200`):

```json
{
  "status": "success",
  "message": "Diseases retrieved successfully",
  "data": [
    {
      "id": 0,
      "name": "string",
      "slug": "string",
      "description": "string | null",
      "symptomProfile": "string | null",
      "isActive": true
    }
  ]
}
```

## `POST /api/diseases/`

- Auth: required (`accessToken` cookie)
- Roles allowed: `ADMIN`
- Required headers: `Content-Type: application/json`

Request body (`req.body`):

```json
{
  "name": "string (required)",
  "slug": "string (required)",
  "description": "string (optional)",
  "symptomProfile": "string (optional)",
  "isActive": "boolean (optional, default true)"
}
```

Success response (`201`):

```json
{
  "status": "success",
  "message": "Disease created successfully",
  "data": {
    "id": 0,
    "name": "string",
    "slug": "string",
    "description": "string | null",
    "symptomProfile": "string | null",
    "isActive": true
  }
}
```

