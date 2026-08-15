# Session Updates

> ⚠️ **Incomplete — needs reviewing and verification.** This log covers one
> continuous development session migrating the legacy Apps Script KPI system
> onto Next.js/Prisma/Postgres. Everything here was self-tested by the person
> driving the session (manual clicking + a handful of direct DB/API checks),
> not reviewed by anyone else, and has no automated test coverage. See
> README.md's "Known gaps / needs verification" section for the full list of
> what still needs confirming before this is trusted for real use.

## What was done, in order

**1. Initial local setup**
- Installed dependencies, created a local Postgres DB, ran existing migrations, generated the Prisma client, started the dev server.
- Later moved to the real Supabase project once real credentials were provided.

**2. Legacy system analysis**
- Cloned the legacy Google Apps Script project (`legacy-appscript/`) via `clasp`.
- Read all 28 source files and produced a technical report covering the data model, the normalization/rollup pipelines, the two-tier status formula, role-based visibility, and a list of Sheets-era workarounds (35-day retention window, dual Connection-ID matching, JSON-blob summaries) that don't apply to Postgres.

**3. Core migration (schema + business logic)**
- Expanded `prisma/schema.prisma`: `Service`, `Team`, `KpiConfig` + `KpiConfigHistory`, `Intervention`, `ConnectionStatusEvent` (status audit trail), `Setting`, `User.isActive/lastLogin/loginCount`.
- Ported the legacy two-tier status formula (`src/lib/performance.ts`) — magnitude-of-deviation, two thresholds, overshoot never penalized.
- Built server-side role-scoped visibility (`src/lib/connection-scope.ts`) — VA/OM/DM/ADMIN, enforced off the session instead of a client-asserted role like legacy did.
- Reworked `/submit` into a Google-OAuth-gated flow instead of the old public Connection-ID-entry form.

**4. Admin UI build-out**
- Users (CRUD, roles, bulk import, deactivation), Teams (CRUD, roster, leader assignment), Services (added to Departments page), Connections (status/type management + audit trail, bulk import, KPI Config editor), KPI Library (clusters, two-tier thresholds), Interventions.
- Manager notifications ("N connections missing KPI config"), Login Activity report.

**5. Reporting suite**
- Customer Overview, Client Detail (with per-KPI trend sparklines), Weekly Interventions Report, Lifetime Value, VA KPI Sheet (cluster-grouped grid) — each with CSV export.
- Submission-volume trend sparkline on the Submissions page.

**6. Settings**
- `APP_NAME` (wired into the sidebar label), `WEEK_START_DAY` (wired into `currentPeriodStart`'s weekly boundary calc across every call site), `INTERVENTION_TYPES`.

**7. Legacy data sync**
- Set up a Google service account (`secrets/legacy-service-account.json`, gitignored) with read access to the live legacy Sheet.
- Built `src/lib/legacy-sync/`: a reference-data importer (Departments → Services → Teams → Users → Connections → KPI Library → KPI Config → Interventions → Settings) and a historical-performance importer (reads the `KPIs` JSON blob out of `KPI_Weekly_Summary`/`KPI_Monthly_Summary`).
- Every row is upserted by a legacy ID (or an existing natural key like email/name), so it's safe to re-run on demand — no cron job, just a "Run Sync" button on the Settings page (Admin-only), per your request.
- Optimized for the real data volume (~822 connections, ~734 users, ~11,463 KPI_Config rows, ~10,715 historical summary rows): batched existence-checks (one query per phase instead of one per row) and bounded concurrency (10 in flight) for the two largest phases, since a naive per-row round-trip design would have taken tens of minutes to hours.
- **First real run was in progress as of the last message in this session** — see the next update (or ask) for the actual created/updated/skipped/error counts once it completes.

## Explicitly not done (by decision, not oversight)

- Live WFM/CMS integration — Connections stay admin-managed/synced, not a real-time integration.
- Sheets-era workarounds (retention window, dual Connection-ID matching, JSON-blob summaries, Forms-polling pipeline, schema-drift diagnostics) — solved a Sheets-specific problem that doesn't exist in Postgres.
- Automated tests, code review, security audit, production deployment.
