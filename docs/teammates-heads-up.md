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

## ✅ No Action Required (User change)

- `src/controllers/report.controller.ts` — passes `req.body` + `req.user` through; no direct field references to fix.
- `src/controllers/alert.controller.ts` — no direct User field access.
- `src/controllers/advisory.controller.ts` — no direct User field access.
- `src/routes/*.ts` — all already updated to use `Role` (not `UserRole`).

---

## 📋 Change: DiseaseReport model — UUID id, plain string district/diseaseType, timestamp, isOfflineCached

**Branch:** `feature/prisma-schema-group1-enums-models`
**Date:** 2026-04-15
**Author:** Eyob

### What changed in `prisma/schema.prisma`

| Old | New |
|-----|-----|
| `DiseaseReport.id Int @id @default(autoincrement())` | `String @id @default(uuid())` |
| `DiseaseReport.districtId Int` (FK → District) | `district String` (plain string) |
| `DiseaseReport.diseaseId Int` (FK → Disease) | `diseaseType String` (plain string) |
| `DiseaseReport.reportDate DateTime` | `timestamp DateTime @default(now())` |
| `DiseaseReport.source ReportSource` | `isOfflineCached Boolean @default(false)` |
| `Advisory.sourceReportId Int?` | `String?` (FK type follows DiseaseReport.id) |
| `District.reports DiseaseReport[]` | Removed (no FK pointing back) |
| `Disease.reports DiseaseReport[]` | Removed (no FK pointing back) |

---

## 🔴 Action Required — Estif (DiseaseReport change)

**File:** `src/services/report.service.ts`

### 1. `createReport` — replace FK integer params with plain string params

```typescript
// ❌ BEFORE (broken)
static async createReport(data: {
  districtId?: number;
  diseaseId?: number;
  reporterId?: number;
  reportDate?: string;
  source?: ReportSource;
  ...
})

// ✅ AFTER
static async createReport(data: {
  district?: string;
  diseaseType?: string;
  reporterId?: string;
  // timestamp auto-generates — no need to pass it
  isOfflineCached?: boolean;
  ...
})
```

### 2. `createReport` — update validation and Prisma create call

```typescript
// ❌ BEFORE (broken)
if (!districtId || !diseaseId || !reportDate) { ... }

prisma.diseaseReport.create({
  data: {
    districtId,
    diseaseId,
    reportDate: new Date(reportDate),
    source: source ?? ReportSource.PWA_ONLINE,
    ...
  },
  include: { disease: true, district: true },  // ← can't include FK relations anymore
})

// ✅ AFTER
if (!district || !diseaseType) { ... }

prisma.diseaseReport.create({
  data: {
    district,
    diseaseType,
    isOfflineCached: isOfflineCached ?? false,
    ...
  },
  // remove include: { disease, district } — no FK relations anymore
})
```

### 3. `getAllReports` — remove FK includes and fix orderBy field

```typescript
// ❌ BEFORE (broken)
prisma.diseaseReport.findMany({
  include: { disease: true, district: true, reporter: { select: { fullName: true, ... } } },
  orderBy: { reportDate: "desc" },
})

// ✅ AFTER
prisma.diseaseReport.findMany({
  include: { reporter: { select: { username: true, email: true, role: true } } },
  orderBy: { timestamp: "desc" },
})
```

### 4. `getWeeklyAggregatedReports` — rename `reportDate` to `timestamp`

```typescript
// ❌ BEFORE (broken)
select: { reportDate: true, caseCount: true, deathCount: true }
const weekStartDate = this.getWeekStartUTC(report.reportDate);

// ✅ AFTER
select: { timestamp: true, caseCount: true, deathCount: true }
const weekStartDate = this.getWeekStartUTC(report.timestamp);
```

> Also remove `ReportSource` from the import — it no longer exists in the schema.

---

## ✅ No Action Required (DiseaseReport change)

- `src/controllers/report.controller.ts` — passes `req.body` through unchanged.
- Advisory and Alert services — `sourceReportId` type change is handled in schema only.

---

*This file is maintained by Eyob. Add new entries here whenever a schema change affects teammates' files.*
