# Teammates Heads-Up

This file tracks **breaking schema changes** made by Eyob that require action from Estif and Bereket before their code will compile and run correctly. Each entry includes the exact file, the broken line(s), and what to change.

---

## 📋 Change: User model — `id` type changed from `Int` to `String (UUID)`, new field names

**Branch:** `feature/prisma-schema-group1-enums-models`
**Date:** 2026-04-15
**Author:** Eyob

### What changed in `prisma/schema.prisma`

| Old | New |
|-----|-----|
| `User.id Int @id @default(autoincrement())` | `User.id String @id @default(uuid())` |
| `User.fullName String` | `User.username String` |
| `User.regionId Int?` (FK → Region) | `User.region String` (plain string) |
| `User.districtId Int?` (FK → District) | `User.assignedDistrict String?` (plain string) |
| `DiseaseReport.reporterId Int` | `DiseaseReport.reporterId String` |
| `Advisory.approvedById Int?` | `Advisory.approvedById String?` |
| `Alert.createdById Int?` | `Alert.createdById String?` |

---

## 🔴 Action Required — Estif

**File:** `src/services/report.service.ts`

### 1. `createReport` — parameter type mismatch

```typescript
// ❌ BEFORE (broken)
user: { id: number; role: UserRole };

// ✅ AFTER
user: { id: string; role: Role };
```

> Also update the import: `UserRole` no longer exists — use `Role` from `../../generated/prisma/enums`.

### 2. `createReport` — `reporterId` is now a `String` FK

```typescript
// ❌ BEFORE (broken)
const effectiveReporterId =
  user.role === UserRole.HEW ? user.id : reporterId;

// ✅ AFTER
const effectiveReporterId =
  user.role === Role.HEW ? user.id : reporterId;
```

> No logic change needed — just the type and import fix. Prisma will accept `string` for `reporterId` now.

### 3. `getAllReports` — reporter select fields

```typescript
// ❌ BEFORE (broken — fullName no longer exists on User)
reporter: {
  select: {
    id: true,
    fullName: true,  // ← remove or replace
    email: true,
    role: true,
  },
},

// ✅ AFTER
reporter: {
  select: {
    id: true,
    username: true,  // ← renamed field
    email: true,
    role: true,
  },
},
```

---

## 🔴 Action Required — Bereket

**File:** `src/services/alert.service.ts`

### 1. `triggerApprovalNotification` — user query uses removed FK fields

```typescript
// ❌ BEFORE (broken — districtId and regionId no longer exist on User)
const recipients = await prisma.user.findMany({
  where: {
    isActive: true,
    ...(alert.districtId
      ? { districtId: alert.districtId }
      : { regionId: alert.regionId }),
  },
  select: { email: true },
});

// ✅ AFTER — match users by region/district name strings
const targetDistrictName = alert.district?.name ?? null;
const targetRegionName   = alert.region?.name ?? "Unknown";

const recipients = await prisma.user.findMany({
  where: {
    isActive: true,
    ...(targetDistrictName
      ? { assignedDistrict: targetDistrictName }
      : { region: targetRegionName }),
  },
  select: { email: true },
});
```

> The `User` table no longer has FK integer columns for region/district. You now filter by the plain `region String` and `assignedDistrict String?` fields.

---

## ✅ No Action Required

- `src/controllers/report.controller.ts` — passes `req.body` + `req.user` through; no direct field references to fix.
- `src/controllers/alert.controller.ts` — no direct User field access.
- `src/controllers/advisory.controller.ts` — no direct User field access.
- `src/routes/*.ts` — all already updated to use `Role` (not `UserRole`).

---

*This file is maintained by Eyob. Add new entries here whenever a schema change affects teammates' files.*
