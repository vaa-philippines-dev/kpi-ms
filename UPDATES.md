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

**8. Gap-closing pass (post Aug 17, 2026 Business Ops meeting)**
- Immediate on-target/at-risk/critical status feedback on the `/submit` success screen (previously just said "recorded" with no status shown).
- Per-department daily submission window (`Department.submissionWindowStart/End`, editable on the Departments page) — spreads VA submission traffic across the day, enforced server-side in `createSubmission` and reflected on the `/submit` form; unrestricted when unset. VAs only — managers submitting on a VA's behalf bypass it.
- "No data available" per-KPI checkbox on `/submit` (`SubmissionRecord.noData`) — a KPI can now be explicitly marked no-data instead of requiring a number; producing `PerformanceStatus.NO_DATA` again, matching legacy behavior.
- Connection flagging (`Connection.isFlagged`) and free-text connection notes (`Connection.notes`), both editable from the Connections detail modal (Admin-only).
- Full intervention editing — type/description/action-taken/outcome are all editable now, not just outcome.
- Atomic team-member transfer with a same-department guard (`transferTeamMember`), alongside the existing separate add/remove.
- Deactivating a user now clears their team assignment automatically.
- Submissions page's "current period status" tracker now excludes paused/ended connections (only `ACTIVE` connections are expected to submit), with a count of how many were excluded.
- Still outstanding: provisioning `system-admin@vaaphilippines.com` (or whichever email/role is confirmed) as a User so System Admin VAA can log in and test the flow — waiting on the actual email/role to use.

**9. CMS Connection ID sync (2026-08-26)**
- Real CMS integration, distinct from the older legacy-KPI-sheet sync: `src/lib/cms-sync/connection-sync.ts` pulls new VA↔client connections from the actual Customer Management System's Google Sheet (`VAConnections` + `VirtualAssistants` tabs), via the same service account already used for the legacy sync.
- "Sync Connection IDs" button (System Settings, and the VA Connections page) — runnable by Admin, DM, and Operations Manager. Create-only by explicit decision: never updates an existing Connection, and skips rows that would duplicate an existing VA+client pair (CMS's `ConnectionID` and the older `externalWfmId` are unrelated ID spaces, so a naive create-if-missing would have produced near-duplicates for every connection already synced from the legacy sheet).
- New `Connection.externalCmsId` field (nullable, unique) as the dedup key, alongside the pre-existing `externalWfmId`.
- Status mapping and scope, confirmed with the user against real sheet data: CMS's "Cancelled"/"Declined"/"Accepted" rows are VA-request-workflow outcomes, not established connections, and are excluded; "Terminated" collapses to the generic `INACTIVE` status rather than guessing End of Contract vs. End of Project (CMS's own `TerminationReason` field is ~99% blank); department comes from the VA's own CMS record, not `VAConnections.Department` (99.96% blank/broken in the source data).
- First real run (2026-08-26): 1,382 new connections created, 76 new VA users provisioned, 0 errors. A handful of CMS "VA" rows share an email with an existing non-VA staff account (e.g. department DM/OM mailboxes) — those are safely skipped, never linked as a connection's VA.

## Explicitly not done (by decision, not oversight)

- Real-time WFM/CMS sync — the CMS connection sync above is on-demand (button-triggered), not a live webhook/API integration.
- Sheets-era workarounds (retention window, dual Connection-ID matching, JSON-blob summaries, Forms-polling pipeline, schema-drift diagnostics) — solved a Sheets-specific problem that doesn't exist in Postgres.
- Automated tests, code review, security audit, production deployment.
