# Frontend Integration: `region.route.ts`

Base path: `/api/regions`

## `GET /api/regions/`

- Auth: Public
- Request body: none
- Query params: none

Success response (`200`):

```json
{
  "status": "success",
  "message": "Regions retrieved successfully",
  "data": [
    {
      "id": 0,
      "name": "string",
      "code": "string | null"
    }
  ]
}
```

