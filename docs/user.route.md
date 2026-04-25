# Frontend Integration: `user.route.ts`

Base path: `/api/users`

## `GET /api/users/`

- Auth: Required (`accessToken` cookie)
- Roles allowed: `ADMIN`, `RESEARCHER`
- Request body: none
- Query params: none

Success response (`200`):

```json
{
  "status": "success",
  "message": "Users retrieved successfully",
  "data": [
    {
      "id": "string",
      "username": "string",
      "email": "string",
      "role": "ADMIN | HEW | RESEARCHER",
      "isActive": true,
      "region": "string | null",
      "assignedDistrict": "string | null",
      "createdAt": "ISO datetime string",
      "updatedAt": "ISO datetime string"
    }
  ]
}
```

Common errors:

- `401`: missing/invalid token
- `403`: role not allowed

