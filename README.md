# VAA KPI Ms

Replacement for the legacy Google Apps Script + Sheets KPI tracking system
(`legacy-appscript/` holds the cloned original source, kept as a reference
for porting business logic — it isn't executed by this app). Built with
Next.js 16, Prisma 7, Postgres (Supabase), and NextAuth (Google Workspace
OAuth).

**Live in production** — soft-launched company-wide 2026-08-25, replacing
the legacy Google Form submission workflow. Real organizational data:
~20 departments, thousands of VA↔client connections, ongoing daily KPI
submissions. Hosted on Vercel + Supabase; started on free tiers, which hit
real ceilings under production load in the week after launch (see
[Operational notes](#operational-notes)) — confirm current plan tier before
assuming there's headroom for anything that adds query/request volume.

> **No automated test suite and no CI.** Correctness has been verified by
> manual click-through, direct DB/API spot-checks, and production usage
> since launch — not by a test suite or a second reviewer. See
> [Known gaps](#known-gaps--needs-verification).

## Stack

- **Framework**: Next.js 16 (App Router, Turbopack), React 19
- **Database**: PostgreSQL via Supabase, accessed with Prisma 7 (`@prisma/adapter-pg`)
- **Auth**: NextAuth v5, Google OAuth restricted to `vaaphilippines.com`, gated to emails pre-provisioned via Users management
- **Styling**: Tailwind CSS v4
- **External integrations**: Google Sheets API (service account) for the CMS connection sync and the Google-Sheets/CSV report exports

## Local development

```bash
npm install
npx prisma generate
npx prisma migrate dev   # applies pending migrations
npm run dev              # runs on :3010
```

Requires a `.env` with `DATABASE_URL`, `DIRECT_URL` (Postgres/Supabase),
`NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, and
`GOOGLE_SHARED_DRIVE_ID` (for the Sheets export feature). Not checked into
git — see `.env.example`. A service-account key for the CMS/Sheets
integrations lives at `secrets/` (also gitignored).

`npm run build` runs `prisma migrate deploy` before `next build` — deploy
migrations that way, not `migrate dev`, in any non-interactive environment.

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

- `Department` → `Service` → `Team` — org structure. A `Department` can set
  a daily submission window to spread VA traffic across the day.
- `User` — role is one of `ADMIN` / `EXECUTIVE` (read-only, full visibility,
  never a mutation) / `DM` / `OPS_MANAGER` (dept-wide, DM-equivalent) / `OM`
  (despite the name, this is legacy's *Team Leader* — own + led-team
  connections only) / `SERVICE_MANAGER` / `VA`. Google OAuth login only (no
  passwords). `UserDepartment` lets a hybrid VA belong to more than one
  department.
- `Connection` — a VA-to-client engagement; has a status (Active/Paused/
  Inactive/End of Contract/End of Project/Pending) with a real audit trail
  (`ConnectionStatusEvent`), not just a text field. Can draw KPIs from more
  than one `Service` (`ConnectionService`, e.g. a hybrid VA's connection).
- `KpiDefinition` — the KPI library: target, direction (higher/lower is
  better), **two** thresholds (at-risk %, critical %), a `thresholdUnit`
  (PERCENT/VALUE/DIRECT — see `computeStatus` for how each is evaluated),
  grouped by `cluster`. Can also apply to more than one `Service`
  (`KpiDefinitionService`).
- `KpiConfig` / `KpiConfigHistory` — per-connection override of a KPI's
  target/thresholds/applicability, with a field-level change log
- `Submission` → `SubmissionRecord` → `PerformanceSummary` — one raw
  submission fans out to per-KPI records, which get rolled up into one
  summary row per (connection, KPI, period), status computed on write.
  `SubmissionDraft` autosaves in-progress values for the "view all
  clusters" submit flow.
- `Intervention` — coaching/escalation notes tied to a connection
- `ActivityLog` — unified audit trail (KPI edits, submissions, deletions,
  connection/team/user changes) written via `lib/activity-log.ts`,
  independent of the narrower per-entity histories above
- `Ticket` / `TicketMessage` — in-app support desk (bug/question/feature/
  data-issue reports from any user, triaged by Admin/dev)
- `Setting` — generic key/value store (`INTERVENTION_TYPES`, `APP_NAME`,
  `WEEK_START_DAY`)
- `RateLimitEvent` — DB-backed rate-limit counter (no Redis/KV in this
  stack) used on public-ish endpoints like `/submit`

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
behavior, ported as-is. Two extra `thresholdUnit` modes (`VALUE`, `DIRECT`)
were added since launch for KPIs where a %-of-target deviation doesn't make
sense (e.g. a literal floor/ceiling on the actual's own scale) — see the
doc comment on `computeStatus` for exact semantics. **The original
deviation-based formula has not been sign-off-reviewed against real
business expectations beyond what's shipped and in production use.**

## Role-scoped visibility (`src/lib/connection-scope.ts`)

VA sees only their own connections; OM (Team Leader) sees their own + their
led team's; DM/OPS_MANAGER see their department's; ADMIN/EXECUTIVE see
everything (EXECUTIVE is read-only — every mutation's role check is an
allow-list that simply never names it). Enforced server-side off the
NextAuth session on every query — the legacy system trusted a
client-asserted role parameter instead, which this closes.

## Feature map (legacy → this repo)

| Legacy | This repo |
|---|---|
| AppDashboards.html | `/dashboard` (+ manager notifications) |
| AppKPI.html | `/dashboard/kpi-library`, `/dashboard/connections` |
| AppKPIConfig.html | `/dashboard/connections/kpi-config` |
| AppSubmissions.html | `/dashboard/submissions`, `/dashboard/submit-kpi`, `/submit` |
| AppUsers.html | `/dashboard/users`, `/dashboard/login-activity` |
| AppVAConnections.html | `/dashboard/connections` (+ status audit trail, flagging, notes) |
| AppVAKPISheet.html | `/dashboard/reports/va-kpi-sheet` |
| AppSettings.html reports | `/dashboard/reports/*` (Customer Overview, Client Detail, Weekly Interventions, Lifetime Value, Team Submissions), `/dashboard/settings` |
| Forms-based submission (Pipeline A) | **not ported** — superseded by the synchronous in-app `/submit` flow (Pipeline B) |
| `BackFill.js`, 35-day retention | **not ported** — Sheets-row-limit workarounds, meaningless in Postgres |
| Sheets schema-drift diagnostics | **not ported** — no equivalent problem in Postgres |
| Live WFM/CMS integration | **built** — see [Integrations](#integrations) below; on-demand (button-triggered), not a live webhook |
| *(new, no legacy equivalent)* | Activity Log (`/dashboard/activity`), My Team / History / My KPI (VA self-service), Interventions (own-record view for VAs), Dev Inbox / Tickets (in-app support desk) |

## Integrations

- **CMS connection sync** (`src/lib/cms-sync/connection-sync.ts`) — pulls
  new VA↔client connections from the real Customer Management System's
  Google Sheet via a shared service account. Create-only by design: never
  updates an existing `Connection`, dedupes against every existing
  VA+client pair (CMS's `ConnectionID` and the older legacy `externalWfmId`
  are separate ID spaces). Runnable by Admin, DM, and Ops Manager from
  System Settings or the VA Connections page.
- **Google Sheets export** (`src/lib/sheets-export.ts`) — creates and
  shares a real Google Sheet (not just CSV) for the Submissions report,
  via the same service account with write scope.
- **CSV export** — available on most report pages (`src/lib/csv.ts`).
- The one-time legacy-Sheet migration importers (reference data +
  historical performance) that originally seeded this database have since
  been removed from the codebase; `src/lib/legacy-sync/` now just holds the
  shared Sheets-API plumbing (service-account auth, date parsing, bounded
  concurrency) that the CMS sync and Sheets export reuse.

## Operational notes

- **Maintenance mode** — `src/proxy.ts` gates every route (API included)
  behind `MAINTENANCE_MODE=true`, no-op by default.
- **Rate limiting** — `src/lib/rate-limit.ts`, DB-backed, applied to the
  public-facing `/submit` flow.
- **Per-department submission windows** — optional `HH:mm` (Asia/Manila)
  start/end on `Department`, enforced server-side in `createSubmission` and
  reflected on the `/submit` form; unrestricted when unset, and bypassed
  when a manager submits on a VA's behalf.
- **Free-tier ceilings hit post-launch** — within a week of the 2026-08-25
  launch, real usage (~20 departments, thousands of connections) forced
  several emergency fixes: a topbar badge that recomputed across every
  connection on each navigation, SSE notification streams holding
  serverless connections open, tab-visibility-gated polling, and a VA
  dashboard issuing up to two dozen DB round-trips per load. A paid-tier
  upgrade (Vercel Pro + Supabase Pro) was proposed after a hard Supabase
  egress warning; treat the current plan as unconfirmed and be mindful of
  free-tier caps (Vercel: 1M invocations/mo, 4hr Active CPU/mo; Supabase:
  5GB egress/mo, 500MB DB) when adding anything that increases query,
  polling, or streaming volume.

## Known gaps / needs verification

- **No automated tests, no CI.** Verification is manual click-through plus
  direct DB/API spot-checks — still true in production, not just during
  initial development.
- **No formal code review process.** Changes are made and self-verified by
  one developer (with AI assistance), one session/commit at a time.
- **Status formula thresholds (10%/25% defaults) and the `VALUE`/`DIRECT`
  threshold-unit modes are unconfirmed against a documented business
  spec** — they're a best-effort read of the legacy Apps Script source plus
  ad-hoc requests since; nobody has formally signed off on the full
  decision table.
- **"Lifetime Value" is a best-guess metric.** The legacy Apps Script
  source didn't contain a recoverable exact formula for it; what's here
  (tenure + submission volume + on-target rate) is a reasonable stand-in,
  not a confirmed replica.
- **Hosting tier is unconfirmed.** See [Operational notes](#operational-notes)
  — a paid-tier upgrade was proposed and verbally approved but not
  independently confirmed as purchased.
- **Security posture has not had a dedicated audit pass** (auth flow,
  service-role Prisma access, exported CSV/Sheets endpoints, the
  Google-service-account credentials, etc.) — built and hardened
  incrementally in response to real incidents, not audited end-to-end.
- **`legacy-appscript/` is unmaintained reference source**, not part of the
  running app (only referenced from a comment in `src/lib/nav.ts`) — kept
  around for porting/verification purposes; safe to delete once nobody
  needs to diff behavior against the original Apps Script.
