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

---

## 📋 Change: Advisory model (Task 4) + Alert model (Task 5)

**Branch:** `feature/prisma-schema-group1-enums-models`
**Date:** 2026-04-15
**Author:** Eyob

### What changed in `prisma/schema.prisma`

**Advisory:**

| Old | New |
|-----|-----|
| `Advisory.id Int @id @default(autoincrement())` | `String @id @default(uuid())` |
| `Advisory.diseaseId Int` (FK → Disease) | `diseaseType String` (plain string) |
| `Advisory.language Language` (enum) | `language String` |
| `Advisory.riskLevel RiskLevel` (enum) | `riskLevel String @default("MODERATE")` |
| `Disease.advisories Advisory[]` back-relation | Removed |

**Alert:**

| Old | New |
|-----|-----|
| `Alert.id Int @id @default(autoincrement())` | `String @id @default(uuid())` |
| `Alert.regionId Int` + `Alert.districtId Int?` (FKs) | `targetZone String` (plain string) |
| `Alert.advisoryId Int?` | `String?` (cascades from Advisory.id type change) |
| `Alert.severity AlertSeverity` (enum) | `severity String` |
| `Alert.channel AlertChannel` (enum) | `channel String` |
| `Alert.sentAt DateTime?` | `isDelivered Boolean @default(false)` |
| `Region.alerts Alert[]` + `District.alerts Alert[]` back-relations | Removed |

---

## ✅ COMPLETED — Bereket (Advisory + Alert schema fixes applied by Eyob)

### File: `src/services/advisory.service.ts`

#### 1. Remove `Language` and `RiskLevel` from the Prisma import — these are no longer model field types

```typescript
// ❌ BEFORE
import { AdvisoryStatus, Language, RiskLevel } from "../../generated/prisma/enums";

// ✅ AFTER
import { AdvisoryStatus } from "../../generated/prisma/enums";
// Use plain strings for language and riskLevel validation
```

#### 2. `toSpecCompatibleAdvisory` — `diseaseType` is now a direct field, not a join

```typescript
// ❌ BEFORE (broken — no disease relation anymore)
idString: String(advisory.id),
diseaseType: advisory.disease?.name ?? null,
languageString: advisory.language,

// ✅ AFTER — diseaseType is a direct string field
idString: advisory.id,          // id is already a string UUID
diseaseType: advisory.diseaseType,
languageString: advisory.language,
```

#### 3. `createAdvisory` — remove `diseaseId` FK logic, use `diseaseType` directly

```typescript
// ❌ BEFORE (broken — no disease FK)
let resolvedDiseaseId = diseaseId;
if (!resolvedDiseaseId && diseaseType) {
  const disease = await prisma.disease.findFirst({ ... });
  resolvedDiseaseId = disease?.id;
}
if (!resolvedDiseaseId || !regionId || !title || !content) { ... }
prisma.advisory.create({ data: { diseaseId: resolvedDiseaseId, ... } })

// ✅ AFTER — pass diseaseType string directly
if (!diseaseType || !regionId || !title || !content) { ... }
prisma.advisory.create({ data: { diseaseType, ... } })
```

#### 4. `getAllAdvisories` — remove `disease: true` include, update approvedBy select

```typescript
// ❌ BEFORE (broken — disease relation removed)
prisma.advisory.findMany({
  include: { disease: true, region: true, district: true, approvedBy: { select: { fullName: true } } }
})

// ✅ AFTER
prisma.advisory.findMany({
  include: { region: true, district: true, approvedBy: { select: { id: true, username: true, email: true } } }
})
```

#### 5. `approveAdvisory` — both params are now `String`

```typescript
// ❌ BEFORE
static async approveAdvisory(advisoryId: number, userId: number)
prisma.advisory.update({ where: { id: advisoryId }, data: { approvedById: userId } })

// ✅ AFTER
static async approveAdvisory(advisoryId: string, userId: string)
prisma.advisory.update({ where: { id: advisoryId }, data: { approvedById: userId } })
```

> Also update `advisory.controller.ts`: `Number(req.params.id)` → `req.params.id`, `req.user!.id` is already a `string`.

---

### File: `src/services/alert.service.ts`

#### 1. Remove `AlertSeverity` and `AlertChannel` from Prisma import — no longer model field types

```typescript
// ❌ BEFORE
import { AlertChannel, AlertSeverity } from "../../generated/prisma/enums";

// ✅ AFTER — define valid values locally or use plain string validation
const VALID_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const VALID_CHANNELS   = ["WEB", "SMS", "USSD", "EMAIL"] as const;
```

#### 2. Update `AlertManagementView` and `AlertNotificationDetails` types

```typescript
// ❌ BEFORE
type AlertManagementView = { id: number; severity: AlertSeverity; ... }
type AlertNotificationDetails = { id: number; regionId: number; districtId: number | null; ... }

// ✅ AFTER
type AlertManagementView = { id: string; severity: string; channel: string; isDelivered: boolean; targetZone: string; ... }
type AlertNotificationDetails = { id: string; targetZone: string; severity: string; ... }
```

#### 3. `toAlertManagementView` — `targetZone` and `isDelivered` are now direct fields

```typescript
// ❌ BEFORE (broken — no region/district relation)
const targetZone = alert.district?.name ?? alert.region?.name ?? "Unknown";
return { id: alert.id, idString: String(alert.id), isDelivered: Boolean(alert.sentAt), ... }

// ✅ AFTER
return {
  id: alert.id,         // already a string UUID
  targetZone: alert.targetZone,
  isDelivered: alert.isDelivered,
  severity: alert.severity,
  channel: alert.channel,
  ...
}
```

#### 4. `triggerApprovalNotification` — no regionId/districtId; use `targetZone` for user lookup

```typescript
// ❌ BEFORE (broken — User has no regionId/districtId fields)
const recipients = await prisma.user.findMany({
  where: { isActive: true, ...(alert.districtId ? { districtId: alert.districtId } : { regionId: alert.regionId }) }
})

// ✅ AFTER — filter users by matching region/assignedDistrict string
const recipients = await prisma.user.findMany({
  where: {
    isActive: true,
    OR: [
      { assignedDistrict: alert.targetZone },
      { region: alert.targetZone },
    ],
  },
  select: { email: true },
});
```

#### 5. `approveAlert`, `rejectAlert`, `getAllAlerts` — id is now `String`, remove FK includes

```typescript
// ❌ BEFORE
static async approveAlert(alertId: number)
prisma.alert.findUnique({ where: { id: alertId }, include: { region: true, district: true, disease: true, advisory: true } })
prisma.alert.update({ where: { id: alertId }, data: { sentAt: new Date() } })

// ✅ AFTER
static async approveAlert(alertId: string)
prisma.alert.findUnique({ where: { id: alertId }, include: { disease: true, advisory: true } })
prisma.alert.update({ where: { id: alertId }, data: { isDelivered: true } })
```

#### 6. `createAlert` — replace regionId/districtId with targetZone, remove sentAt

```typescript
// ❌ BEFORE
static async createAlert(data: { regionId?: number; districtId?: number; advisoryId?: number; sentAt?: string; ... })
prisma.alert.create({ data: { regionId, districtId, advisoryId, sentAt: isDelivered ? new Date() : ... } })

// ✅ AFTER
static async createAlert(data: { targetZone: string; advisoryId?: string; isDelivered?: boolean; ... })
prisma.alert.create({ data: { targetZone, advisoryId, isDelivered: isDelivered ?? false, ... } })
```

> Also update `alert.controller.ts`: `Number(req.params.id)` → `req.params.id` for all three methods (approveAlert, rejectAlert, and any id-based lookup).

---

## ✅ No Action Required (Advisory + Alert changes)

- `src/controllers/advisory.controller.ts` — only needs the `Number(req.params.id)` → `req.params.id` fix noted above.
- `src/controllers/alert.controller.ts` — only needs the `Number(req.params.id)` → `req.params.id` fix noted above.
- `src/routes/advisory.route.ts` — no changes needed.
- `src/routes/alert.route.ts` — no changes needed.

---

---

## 📋 Change: RBAC — Strict Role Enforcement (Group 3)

**Branch:** `feature/rbac-access-control-group3`
**Date:** 2026-04-15
**Author:** Eyob

### Role policy (authoritative definition in `src/middlewares/authorize.ts`)

| Role | Allowed | Never allowed |
|---|---|---|
| `CITIZEN` | Public/unauthenticated endpoints only | Never in an `authorize()` tuple |
| `HEW` | Submit reports, read district-scoped reports | No advisory, alert, or user management |
| `ADMIN` | Everything | — |
| `RESEARCHER` | Read-only analytics (GET reports, alerts, advisories, users) | All mutation endpoints (POST / PATCH / PUT / DELETE) |

---

## ✅ COMPLETED — Bereket (RBAC route fixes applied by Eyob)

### File: `src/routes/advisory.route.ts`

#### 1. `POST /generate` is currently unprotected — any internet caller can trigger it

```typescript
// ❌ BEFORE (broken — no auth, open to abuse)
router.post("/generate", AdvisoryController.generateAdvisoryText);

// ✅ AFTER — HEW and ADMIN can trigger advisory generation
router.post(
  "/generate",
  authenticate,
  authorize(Role.ADMIN, Role.HEW),
  AdvisoryController.generateAdvisoryText,
);
```

> Make sure `Role` is already imported (it should be from the earlier Task 1 fix).

---

### File: `src/routes/alert.route.ts`

#### 2. `GET /` is restricted to ADMIN only — spec says RESEARCHER gets read-only analytics access

```typescript
// ❌ BEFORE (too restrictive for RESEARCHER)
router.get(
  "/",
  authenticate,
  authorize(Role.ADMIN),
  AlertController.getAllAlerts,
);

// ✅ AFTER — RESEARCHER can read alerts for analytics
router.get(
  "/",
  authenticate,
  authorize(Role.ADMIN, Role.RESEARCHER),
  AlertController.getAllAlerts,
);
```

---

## ✅ No Action Required — Estif (RBAC)

`src/routes/report.route.ts` tuples are already correct:
- `GET /` and `GET /weekly` → `ADMIN, HEW, RESEARCHER` ✅
- `POST /` → `ADMIN, HEW` ✅

No changes needed.

---

---

## 📋 New: BR-03 Critical Mortality Alert Hook

**Branch:** `feature/berekets-tasks`
**Date:** 2026-04-15
**Author:** Eyob

### What was added

`AlertService.checkAndCreateCriticalMortalityAlert(diseaseType, district)` is now implemented in `src/services/alert.service.ts`.

It:
1. Queries the last 24 h of reports for the given `district` + `diseaseType`
2. If deaths/cases > 10%, creates a `CRITICAL` severity `Alert` and emails all active `ADMIN` users
3. Logs a structured warning with alert ID, rate, and zone

---

## 🔴 Action Required — Estif (BR-03 hook)

**File:** `src/services/report.service.ts`

After `AIService.enqueueZScoreAnomalyTrigger(report.id)`, add a fire-and-forget call to the mortality threshold checker:

```typescript
// ✅ ADD after line: AIService.enqueueZScoreAnomalyTrigger(report.id);
setImmediate(async () => {
  try {
    await AlertService.checkAndCreateCriticalMortalityAlert(
      report.diseaseType,
      report.district,
    );
  } catch (err) {
    logger.error("BR-03 mortality check failed", { reportId: report.id, err });
  }
});
```

Also add the import at the top of `report.service.ts`:

```typescript
import { AlertService } from "./alert.service";
```

> Keep it fire-and-forget with `setImmediate` — same pattern as the AI anomaly trigger. Do NOT await it in the request path.

---

*This file is maintained by Eyob. Add new entries here whenever a schema change affects teammates' files.*
