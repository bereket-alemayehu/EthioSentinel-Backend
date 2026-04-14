# Backend Implementation Status (Node.js / Express / Prisma / PostgreSQL)

**Review basis:** `prisma/schema.prisma`, `src/app.ts`, route files under `src/routes/`, matching controllers and services (`auth`, `report`, `advisory`, `alert`, `user`, `disease`, `region`, `admin`), and utilities (`token.util.ts`, `password.util.ts`, `EmailSender.ts`, `authenticate.ts`, `authorize.ts`). Checkboxes use `[x]` only when the requirement is **fully** implemented and correctly reflected in code and schema; otherwise `[ ]`.

## 1. Security & Access Module

- [x] **Authentication:** Secure login endpoints using JSON Web Tokens (JWT). (`POST /api/auth/login` issues a JWT via `signAccessToken`; `authenticate` middleware verifies it from the `accessToken` cookie.)
- [x] **Password Hashing:** Passwords computationally hashed using Argon2 or Bcrypt. (`bcryptjs` in `password.util.ts`.)
- [ ] **RBAC (Role-Based Access Control):** Strict route protection using the `Role` enum for 4 roles. (Code uses `UserRole` from Prisma, not an enum named `Role`; several role rules below are incomplete.)
  - [ ] `CITIZEN`: Unauthenticated/public access only. (No routes are explicitly scoped to a `CITIZEN` role; some resources are public without auth, but this is not aligned with a strict four-role RBAC model.)
  - [ ] `HEW` (Health Extension Worker): Can create reports for their assigned district only. (`ReportService.createReport` does not verify `districtId` matches the HEW user’s `districtId`; `getAllReports` is not scoped to the HEW’s district.)
  - [x] `ADMIN` (RHB): Can view all data, approve advisories, and trigger alerts. (Admin-only or admin-inclusive routes exist for users, alerts, advisory approval, disease creation, and broad report access.)
  - [ ] `RESEARCHER`: Read-only access to historical analytical reports. (Researchers can `GET` raw `DiseaseReport` lists with embedded reporter identity fields and can `GET /api/users`, which goes beyond read-only “historical analytical reports” and exposes non-aggregated, identifiable data.)

## 2. Data Ingestion & Routing Module

- [x] **Report Endpoints:** Routes to receive morbidity (case) and mortality (death) data from the HEW PWA. (`POST /api/reports` with `caseCount` and `deathCount`, HEW/ADMIN authorized.)
- [ ] **BR-01 (Data Anonymization Rule):** API strips/rejects Personally Identifiable Information (PII). Data stored ONLY as aggregated counts per district. (`DiseaseReport` stores `reporterId` and optional `notes`; `getAllReports` returns `reporter` with `fullName` and `email`. No PII stripping/validation on ingest.)
- [ ] **BR-05 (Sync Priority Rule):** Backend processes and saves `Mortality` records BEFORE `Morbidity` records when handling offline sync payloads. (No batch/sync endpoint; only single-record `createReport`. No ordering guarantee for mortality vs morbidity in a combined payload.)
- [ ] **AI Routing:** Asynchronously forwards incoming data payloads to the external Python/Flask AI Processing Component. (No HTTP client calls from `src/` to the Flask service; repo contains `anomaly-detection-service/` but Node does not forward ingested reports to it.)

## 3. Alert & Advisory Management Module

- [ ] **Advisory Queue:** Endpoint to manage a queue of AI-generated draft health advisories needing review. (`GET /api/advisories` is unauthenticated, returns all statuses, and is not a dedicated admin queue filtered to `DRAFT` / pending review.)
- [ ] **BR-02 (Advisory Approval Workflow):** Logic ensuring AI-generated drafts CANNOT be broadcasted until an Admin changes status to `APPROVED`. (`AlertService.approveAlert` does not require the linked advisory to be `APPROVED`; mass email content can use draft advisory text. `createAdvisory` can also set `status` to `APPROVED` on create, bypassing the patch workflow.)

## 4. AI & Analytics Integration Module

- [ ] **Anomaly Detection Triggers:** Webhook/API call triggering the external AI's Z-Score algorithm upon new report ingestion. (No call to the Z-score Flask API after `createReport` or elsewhere in the Node app.)
- [ ] **Receive NLP Drafts:** Internal endpoint for Python AI to post multi-language (Amharic, Afaan Oromoo, Tigrinya, Somali) advisory drafts back to Node.js. (No authenticated internal/webhook route for the AI service; advisory text helpers only support `ENGLISH` and `AMHARIC` in validation, not all four languages.)

## 5. Notification & Gateway Module

- [x] **Email Gateway:** Integration with an Email Notification Service (e.g., Nodemailer/SendGrid) for mass warnings. (`nodemailer` in `EmailSender.ts`, SMTP via env vars.)
- [ ] **BR-03 (Critical Alert Threshold):** Logic triggering an immediate "Critical" Admin notification if mortality rate for a disease exceeds 10% of cases in 24 hours. (No such calculation or automated admin notification in services or report ingestion.)
- [ ] **Delivery Logging:** System logs successful deliveries and failed email attempts. (Alert model stores aggregate `deliveryCount` / `failedCount` after bulk send; some `logger` calls exist, but there is no durable per-recipient or per-attempt delivery log, and failed sends are not individually recorded beyond counts.)

## 6. Reporting Module

- [ ] **Analytical Aggregation:** Endpoints aggregating historical morbidity vs. mortality by Date Range, Target Region, and Disease Category. (`getWeeklyAggregatedReports` aggregates by calendar week only, without query filters for date range, region, or disease.)
- [ ] **Export Feature:** Functionality to compile and trigger downloads of analytical reports (PDF/Excel). (PDF/XLSX export exists only for the weekly summary via `GET /api/reports/weekly?export=pdf|excel`, not for the full analytical dimensions in the requirement.)

## 7. Database Schemas (PostgreSQL / Prisma)

- [ ] **Enums:** `enum Role { CITIZEN, HEW, ADMIN, RESEARCHER }` and `enum AdvisoryStatus { DRAFT, APPROVED, REJECTED }`. (Schema defines `UserRole` with those four values, not `Role`. `AdvisoryStatus` includes `ARCHIVED` and omits the exact two-enum set.)
- [ ] **User Model:** `id` (String @id @default(uuid())), `username` (String), `passwordHash` (String), `role` (Role), `region` (String), `assignedDistrict` (String?), `clearanceLevel` (Int?). (Actual `User` uses numeric `id`, `email` instead of `username`, `UserRole`, and relations `regionId` / `districtId` to `Region` / `District`; no `clearanceLevel`.)
- [ ] **DiseaseReport Model:** `id` (String @id @default(uuid())), `diseaseType` (String), `caseCount`, `deathCount`, `timestamp` (@default(now())), `district` (String), `isOfflineCached` (Boolean). (Actual model uses Int `id`, `diseaseId` / `districtId` relations, `reportDate`, `source`, `status`, `isMortalityPriority`, `notes`, `reporterId`; no `diseaseType` string or `isOfflineCached`.)
- [ ] **Advisory Model:** `id` (String uuid), `diseaseType` (String), `content`, `language` (String), `status`, `riskLevel` (String). (Actual model uses Int `id`, `diseaseId`, `Language` enum, `RiskLevel` enum, `title`, relations to region/district/report, etc.)
- [ ] **Alert Model:** `id` (String uuid), `targetZone` (String), `severity` (String), `channel` (String), `isDelivered` (Boolean @default(false)). (Actual model uses Int `id`, `regionId` / optional `districtId`, `AlertSeverity` / `AlertChannel` enums, `title`, `message`, `deliveryCount` / `failedCount`, `sentAt`; no `targetZone` or `isDelivered`.)
