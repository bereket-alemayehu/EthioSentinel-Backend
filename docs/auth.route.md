# Frontend Integration: `auth.route.ts`

Base path: `/api/auth`

## Common response format

Success:

```json
{
  "status": "success",
  "message": "Human-readable message",
  "data": {}
}
```

Error:

```json
{
  "status": "error",
  "message": "Error details"
}
```

## `POST /api/auth/login`

- Auth: Public
- Required headers: `Content-Type: application/json`
- Cookie behavior: sets `accessToken` as `HttpOnly` cookie on success

Request body (`req.body`):

```json
{
  "email": "string (required)",
  "password": "string (required)"
}
```

Success response (`res.body`, `200`):

```json
{
  "status": "success",
  "message": "Login successful",
  "data": {
    "user": {
      "id": "string",
      "username": "string",
      "email": "string",
      "role": "ADMIN | HEW | RESEARCHER",
      "region": "string | null",
      "assignedDistrict": "string | null"
    }
  }
}
```

## `POST /api/auth/logout`

- Auth: Public route (no middleware), but effectively logs out current cookie session
- Required headers: none
- Request body: none

Success response (`res.body`, `200`):

```json
{
  "status": "success",
  "message": "Logged out successfully",
  "data": null
}
```

## `GET /api/auth/me`

- Auth: Required (`accessToken` cookie)
- Request body: none
- Query params: none

Success response (`res.body`, `200`):

```json
{
  "status": "success",
  "message": "User profile retrieved",
  "data": {
    "id": "string",
    "username": "string",
    "email": "string",
    "phoneNumber": "string | null",
    "role": "ADMIN | HEW | RESEARCHER",
    "isActive": true,
    "region": "string | null",
    "assignedDistrict": "string | null",
    "clearanceLevel": "string | null",
    "createdAt": "ISO datetime string"
  }
}
```

