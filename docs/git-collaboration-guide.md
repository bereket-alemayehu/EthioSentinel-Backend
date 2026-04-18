# Gnzabe — Git Collaboration & Workflow Guide v1.0

This document outlines the branching strategy and contribution workflow for the Gnzabe project. To ensure our CI/CD pipelines remain stable and our production environment secure, all developers must adhere to these standards.

---

## 1. Branching Strategy

We use a two-tier structure adapted for this project. Feature and fix branches are created from `staging`, merged back into `staging` via Pull Request, and promoted to `main` only when stable.

### Branch Overview

| Branch              | Purpose            | Environment  | Deployment        |
| ------------------- | ------------------ | ------------ | ----------------- |
| `main`              | Live Production    | Live Site    | Automated (CI/CD) |
| `staging`           | Stable Testing     | Test/QA Env  | Automated (CI/CD) |
| `feature/...`       | New feature work   | Local        | None              |
| `fix/...`           | Bug fix work       | Local        | None              |
| `refactor/...`      | Code cleanup       | Local        | None              |
| `chore/...`         | Maintenance/docs   | Local        | None              |

### Branch Rules

- **`main`**
  - NEVER push directly.
  - Only receives merges from `staging` after final team sign-off.
- **`staging`**
  - NEVER push directly.
  - Only receives merges from Pull Requests (feature/fix branches).
  - Resolve conflicts locally before the PR can be merged.
- **`feature/...`, `fix/...`, `refactor/...`, `chore/...`**
  - Where all actual coding and writing happens.
  - Always branched FROM `staging`.
  - Always merged BACK INTO `staging` via PR.

---

## 2. Naming Conventions

Always use descriptive, kebab-case names for branches and commits.

### Branch Names

| Type | Pattern | Example |
|------|---------|---------|
| New feature | `feature/<short-description>` | `feature/prisma-role-advisory-enums` |
| Bug fix | `fix/<short-description>` | `fix/hew-district-scope-query` |
| Code cleanup | `refactor/<short-description>` | `refactor/alert-service-logic` |
| Docs / config | `chore/<short-description>` | `chore/project-docs-and-task-tracking` |

### Commit Messages — Conventional Commits

**Format:** `type(scope): short description`

| Type | When to use |
|------|-------------|
| `feat` | A new feature or endpoint |
| `fix` | A bug fix |
| `refactor` | Code restructure without behaviour change |
| `chore` | Docs, config, deps, or tooling |
| `style` | Formatting only |
| `test` | Adding or updating tests |

**Examples:**
```
feat(auth): add JWT login endpoint
fix(report): correct HEW district scoping in createReport
chore(docs): add collaboration guide and task tracking CSVs
refactor(alert): extract delivery logic into AlertService
```

---

## 3. Daily Workflow (The Cycle)

### Step 1 — Start Your Task

Always branch from the latest `staging`:

```bash
git checkout staging
git pull origin staging
git checkout -b feature/your-feature-name
```

### Step 2 — Code & Commit

Keep commits small and logical:

```bash
git add .
git commit -m "feat(scope): implement X"
```

### Step 3 — Push & Open a Pull Request

```bash
git push origin feature/your-feature-name
```

Then on GitHub:
1. Open a PR from `feature/your-feature-name` **into** `staging`.
2. Assign a teammate as **Reviewer**.
3. Do **not** merge your own PR — wait for approval.

---

## 4. Professional Conflict Resolution

If GitHub shows **"This branch has conflicts"**, resolve them locally — never on GitHub.

### Step 1 — Switch to your feature branch

```bash
git checkout feature/your-feature-name
```

### Step 2 — Pull latest `staging` into your branch

```bash
git pull origin staging
```

### Step 3 — Resolve conflicts in your editor

Open files with markers (`<<<<<<<`, `=======`, `>>>>>>>`) and manually merge both sides correctly.

### Step 4 — Finalize

```bash
git add .
git commit -m "fix(merge): resolve conflicts with staging"
git push origin feature/your-feature-name
```

The existing PR updates automatically. Once it shows **no conflicts**, it can be merged.

---

## 5. Promoting to Production

Once `staging` is verified stable by the full team:

```bash
git checkout main
git pull origin main
git merge staging
git push origin main
```

> Only one person (team lead) should perform this promotion after explicit sign-off from all members.

---

## 6. Ownership & File Conflict Rules

To prevent two developers editing the same file simultaneously, task ownership is defined in `docs/task-list.csv`. The **Primary Controller** column is the source of truth for file ownership.

| Developer | Primary Ownership |
|-----------|-------------------|
| **Eyob** | `auth.controller.ts`, `middlewares/authorize.ts`, `ai.controller.ts` (new), `prisma/schema.prisma` |
| **Estif** | `report.controller.ts`, `analytics.controller.ts` (new) |
| **Bereket** | `advisory.controller.ts`, `alert.controller.ts` |

> If a task requires touching another developer's primary file, coordinate via a PR comment or team chat — do NOT edit it directly.

---

## 7. Golden Rules

1. **Never** push directly to `staging` or `main`.
2. **Never** merge your own PR — always get a review.
3. **Sync daily** — pull from `staging` often to catch conflicts early.
4. **Keep branches short-lived** — one branch per task, not one branch for everything.
5. **`prisma/schema.prisma` is single-owner (Eyob)** — all schema changes go through one PR to avoid migration conflicts.

---

**Document Version:** 1.0 (adapted for EthioSentinelBackend)
**Owner:** Gnzabe Backend Team
**Maintainer:** Eyob
