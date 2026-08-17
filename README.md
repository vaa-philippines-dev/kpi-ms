# VAA KPI Monitoring System

> ⚠️ **Status: incomplete, unreviewed.** This is a working development build,
> not a production-verified system. Everything below has been exercised with
> manually-created test data in the browser, but has **not** been reviewed by
> anyone besides the person driving this session, has **no automated test
> suite**, and has **not** been validated against real legacy data. Treat every
> claim below as "believed to work as tested," not "certified correct."
> Read [Known gaps / needs verification](#known-gaps--needs-verification)
> before relying on this for real KPI decisions.

Replacement for the legacy Google Apps Script + Sheets KPI tracking system
(see `legacy-appscript/` for the cloned original source). Built with
Next.js 16, Prisma 7, Postgres (Supabase), and NextAuth (Google Workspace
OAuth).

## Stack

- **Framework**: Next.js 16 (App Router, Turbopack), React 19
- **Database**: PostgreSQL via Supabase, accessed with Prisma 7 (`@prisma/adapter-pg`)
- **Auth**: NextAuth v5, Google OAuth open to any Google account, gated to emails pre-provisioned via Users management
- **Styling**: Tailwind CSS v4

## Local development

```bash
npm install
npx prisma generate
npx prisma migrate dev   # applies pending migrations
npm run dev              # runs on :3010
```

Requires a `.env` with `DATABASE_URL`, `DIRECT_URL` (Postgres/Supabase),
`NEXTAUTH_SECRET`, and `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`. Not checked into git.

## What this replaces, and why

The legacy system tracked KPIs in Google Sheets via Apps Script: VAs
submitted through a Google Form, a script normalized one submission into
several KPI records, then rolled those up into a per-connection-per-period
summary row. It worked, but Sheets' row limits forced real workarounds — a
35-day data retention window, ID-format migrations that never fully
propagated, and per-cell JSON blobs to dodge Apps Script's execution budget.
None of that is a Postgres problem, so this rewrite keeps the *business
logic* (status classification, role scoping, KPI config) and drops the
*Sheets-shaped scaffolding* around it.

## Data model (`prisma/schema.prisma`)

- `Department` → `Service` → `Team` — org structure
- `User` — role is one of `ADMIN` / `DM` / `OM` / `SERVICE_MANAGER` / `VA`;
  Google OAuth login only (no passwords)
- `Connection` — a VA-to-client engagement; has a status
  (Active/Paused/End of Contract/End of Project/Pending) with a real audit
  trail (`ConnectionStatusEvent`), not just a text field
- `KpiDefinition` — the KPI library: target, direction (higher/lower is
  better), and **two** thresholds (at-risk %, critical %), grouped by
  `cluster`
- `KpiConfig` / `KpiConfigHistory` — per-connection override of a KPI's
  target/thresholds, with a field-level change log
- `Submission` → `SubmissionRecord` → `PerformanceSummary` — one raw
  submission fans out to per-KPI records, which get rolled up into one
  summary row per (connection, KPI, period), status computed on write
- `Intervention` — coaching/escalation notes tied to a connection
- `Setting` — generic key/value (currently: `INTERVENTION_TYPES`,
  `APP_NAME`, `WEEK_START_DAY`)

## Status formula (`src/lib/performance.ts`)

Ported from the legacy `calcStatus()`, not the meeting's "99%/100%"
framing — the legacy Apps Script code and the live KPI configs it drove
used a different, two-tier model:

```
dev = |actual - target| / target * 100
underperforming = (direction is higher-is-better) ? actual < target : actual > target
if not underperforming or dev <= atRiskThresholdPct  → ON_TARGET
else if dev <= criticalThresholdPct                  → AT_RISK
else                                                  → CRITICAL
```

Overshooting a target is never penalized — this was a deliberate legacy
behavior, ported as-is. **This formula has not been sign-off-reviewed
against real business expectations** — see gaps below.

## Role-scoped visibility (`src/lib/connection-scope.ts`)

VA sees only their own connections; OM sees their team's; DM sees their
department's; ADMIN sees everything. Enforced server-side off the
NextAuth session on every query — the legacy system trusted a
client-asserted role parameter instead, which this closes.

## Feature map (legacy → this repo)

| Legacy | This repo |
|---|---|
| AppDashboards.html | `/dashboard` (+ manager notifications) |
| AppKPI.html | `/dashboard/kpi-library`, `/dashboard/connections` |
| AppKPIConfig.html | `/dashboard/connections/kpi-config` |
| AppSubmissions.html | `/dashboard/submissions` |
| AppUsers.html | `/dashboard/users`, `/dashboard/login-activity` |
| AppVAConnections.html | `/dashboard/connections` (+ status audit trail) |
| AppVAKPISheet.html | `/dashboard/reports/va-kpi-sheet` |
| AppSettings.html reports | `/dashboard/reports/*` (Customer Overview, Client Detail, Weekly Interventions, Lifetime Value), `/dashboard/settings` |
| Forms-based submission (Pipeline A) | **not ported** — superseded by the synchronous in-app `/submit` flow (Pipeline B) |
| `BackFill.js`, 35-day retention | **not ported** — Sheets-row-limit workarounds, meaningless in Postgres |
| Sheets schema-drift diagnostics | **not ported** — no equivalent problem in Postgres |
| Live WFM/CMS integration | **deferred**, by explicit decision — Connections stay admin-managed CRUD |

## Known gaps / needs verification

This is the part that actually matters before anyone trusts this system:

- **No automated tests.** Every check so far has been manual: clicking
  through the UI, reading server logs, and a handful of direct DB/API
  spot-checks in one browser session. There is no CI, no test suite.
- **No code review.** One person (with AI assistance) wrote and
  self-verified all of this in one continuous session.
- **Status formula thresholds (10%/25% defaults) are unconfirmed.** They're
  a best-effort read of the legacy Apps Script source; nobody at VAA has
  signed off that this is the correct business behavior going forward.
- **Role mapping is a guess.** Legacy roles (Administrator/Manager/Team
  Leader/CS Specialist/Virtual Assistant) were mapped to this schema's
  enum (ADMIN/DM/OM/SERVICE_MANAGER/VA) based on a plausible reading, not
  confirmed against how Ian actually described the org hierarchy.
- **No real data has been migrated.** Everything in the database right now
  is test data created by hand during development (fake VAs, a fake
  client, one fake KPI). The legacy Sheet has not been read or migrated.
- **Legacy data migration is not built.** A service account
  (`secrets/legacy-service-account.json`, gitignored) was provided for
  read access to the legacy Sheet, but no migration script exists yet, and
  no decision has been made between a one-time backfill vs. an ongoing
  sync while the legacy system is still in active use.
- **Not deployed.** Runs locally against a real Supabase project, but
  there is no production deployment, no production Google OAuth client
  scoped correctly, and test data needs to be purged before any real
  rollout.
- **"Lifetime Value" is a best-guess metric.** The legacy Apps Script
  source didn't contain a recoverable exact formula for it; what's here
  (tenure + submission volume + on-target rate) is a reasonable stand-in,
  not a confirmed replica.
- **Security posture is unreviewed.** No one has done a deliberate
  security pass on this (auth flow, service-role Prisma access, exported
  CSV endpoints, etc.) — it's been built for function, not audited.

**Bottom line: functionally, this covers everything the legacy system did
that still makes sense in this architecture — but "covers the feature" and
"verified correct and safe for production" are different bars, and only
the first one has been met.**
