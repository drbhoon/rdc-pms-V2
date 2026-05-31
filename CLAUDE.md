# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start local dev server (Next.js hot-reload)
npm run build      # prisma generate + next build
npm start          # prisma db push --accept-data-loss + next start (used on Railway)
npm run seed       # Create initial HR Super Admin from SEED_ADMIN_* env vars
npm run lint       # ESLint check
```

**Deploy to Railway:**
```bash
railway up --detach                    # Upload local code + deploy
railway deployment list                # Check deployment status
railway logs --build <deploymentId>    # Inspect build failures
railway variables set KEY=VALUE        # Set env var (triggers auto-redeploy)
```

**Railway deployment notes:**
- `prisma db push` runs at **start time** (not build time) — the private DB is unreachable during build
- Nixpacks now uses **Node 20** (`nodejs_20` in nixpacks.toml, `NIXPACKS_NODE_VERSION=20`). Was on 18 until Node 18 reached EOL and Nixpacks removed it (May 2026). Prisma v5.22 works fine on Node 20.
- `npm install --legacy-peer-deps` is used (not `npm ci`) due to peer dep conflicts
- Health check: `GET /api/health` must return 200 within 120s

**First-run seed (after deploy, if DB is empty):**
```bash
curl -X POST https://<app>/api/admin/seed \
  -H "Content-Type: application/json" \
  -d '{"secret":"<SEED_SECRET env var>"}'
```

## Architecture

### Next.js Pages Router (not App Router)
All routes live under `src/pages/`. There is **no** `src/app/` directory. Past Railway builds may show App Router routes — those are from a stale Docker cache, not this codebase.

### Two distinct user surfaces

**HR Admin console** (`/admin/*`) — requires login via `pms_session` cookie:
- `setup.js` → upload assessment Excel → template stored in `RoleTemplate` DB table
- `employees.js` → bulk upload employees → stored in `Employee` table
- `assessments.js` → launch cycles → creates `AssessmentPair` records with unique tokens
- `audit.js` → view audit log; Super Admin can unlock finalized rows
- `index.js` → live dashboard (30s auto-refresh)

**Public forms** (no login, token-based):
- `/form/rm/[token]` → Reviewer fills assessment
- `/form/bh/[token]` → Approver reviews + finalises (RM answers shown read-only)

### Assessment workflow state machine

```
Employee uploaded → HR selects for cycle → AssessmentPair created
  status: PENDING_RM
    → RM submits form → rmAnswers saved
  status: RM_SUBMITTED
    → BH reviews + submits → bhAnswers saved, both rows locked
  status: FINALIZED, lockStatus: LOCKED
```

Super Admin can unlock any pair via `/admin/audit`.

### Database (Prisma + PostgreSQL)

Schema at `prisma/schema.prisma`. Key models:

- **RoleTemplate** — one per assessment type (e.g. COLTS-T). Stores `questions` (JSONB array), `profileCols` (JSONB), and routing column names (`rmNameCol`, `rmEmailCol`, `bhNameCol`, `bhEmailCol`)
- **Employee** — `empCode + roleKey` composite unique. Extra columns in `profileData` JSONB
- **AssessmentPair** — central entity. Answers in `rmAnswers`/`bhAnswers` JSONB (fully dynamic — no schema change when questions change). Unique `rmToken`/`bhToken` used for public form URLs
- **AuditLog** — every state transition recorded
- **HrUser** — bcrypt-hashed passwords, roles: `HR_ADMIN` | `HR_SUPER_ADMIN`

All DB operations go through `src/lib/queries.js` — never call Prisma directly in API routes.

### Authentication

Custom cookie-based session — **no NextAuth**:
- Login: `POST /api/auth/login` → verifies bcrypt → sets `pms_session` cookie (base64 JSON)
- Each API route calls `requireAuth(req, res)` or `requireSuperAdmin(req, res)` from `src/lib/auth.js`
- Public form routes (`/form/rm/[token]`, `/form/bh/[token]`) use token lookup — no cookie needed

### Template system (dynamic, Excel-driven)

`src/pages/admin/setup.js` — two-step upload flow:
1. Drop Excel → reads first-row headers via `xlsx` library (client-side)
2. `classifyHeader()` in setup.js auto-assigns each column to: `rm_name | rm_email | bh_name | bh_email | identity | profile | rating | narrative | number | date`
3. HR reviews + adjusts → POST to `/api/admin/templates` → stored in `RoleTemplate.questions` JSONB

Column classification rules (order matters):
- `BM_*/RM_*/BH_*` prefix + name/email → routing
- `EMP_CODE`, `EMP_NAME`, `CYCLE`, `ROLE` → identity
- Keyword match (Qualification, Designation, Plant, Location…) → profile
- Leading digit pattern (`1. ...`, `14) ...`) → rating
- Keywords (date/stipend/recommend/comment…) → date/number/narrative
- Unknown → profile (safe default)

`src/lib/columnMap.js` has a parallel server-side classifier for Google Sheets (legacy path — the client-side version in setup.js is the active one for the DB workflow).

### API route conventions

```
/api/admin/*      — HR console endpoints (requireAuth)
/api/form/rm/[token] — public RM form data fetch
/api/form/bh/[token] — public BH form data fetch
/api/reviewer/[token] — public reviewer-dashboard data (RM or BH sees full list)
/api/auth/*       — login / logout
/api/health       — Railway health check (unauthenticated)
/api/admin/seed   — one-time seeding (protected by SEED_SECRET)
/api/cron/invites-and-reminders — external scheduler hook (protected by CRON_SECRET)
```

### Invite + reminder emails (external cron)

Emails are NEVER sent synchronously on pair creation or on RM submit. Both
paths only create/refresh a `ReviewerLink` (one token per
`email + role + roleKey + cycle`) and write audit. An external scheduler
(e.g. cron-job.org) hits `/api/cron/invites-and-reminders` which runs:

1. **Invites** (every tick) — pairs with `startOn <= now OR NULL` that have not
   yet been invited get their reviewer a single batch dashboard email; pairs
   are then stamped `rmInvitedOn` / `bhInvitedOn`.
2. **Reminders** (midnight IST window only — 18:15–18:45 UTC, or `?force=1`) —
   outstanding already-invited pairs get a reminder email per reviewer.

Both batch by `(reviewerEmail, role, roleKey, cycle)` so one reviewer gets ONE
email regardless of how many assessments they own. The email link is
`/reviewer/<token>` which lists all their pending + completed assessments.

**cron-job.org setup:**
- URL: `https://<app>/api/cron/invites-and-reminders`
- Method: GET
- Header: `x-cron-secret: <CRON_SECRET>`
- Schedule: every hour is fine — invites are idempotent, reminders only fire
  inside the midnight-IST window.

HR can also click **“✉ Send Invites Now”** on the Cycle Management page to
trigger `POST /api/admin/assessments/send-invites` on demand.

All return JSON. Errors: `{ error: "message" }` with appropriate HTTP status.

### Environment variables

Required for production (set in Railway):
```
DATABASE_URL          # postgres://... (Railway private network: postgres.railway.internal)
NEXT_PUBLIC_APP_URL   # https://rdc-pms-production.up.railway.app
SEED_ADMIN_EMAIL      # Initial admin email
SEED_ADMIN_PASSWORD   # Initial admin password
SEED_ADMIN_NAME       # Initial admin display name
SEED_SECRET           # Secret for /api/admin/seed endpoint
NIXPACKS_NODE_VERSION # 18
CRON_SECRET           # Shared secret for /api/cron/invites-and-reminders
SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS SMTP_FROM  # SMTP credentials for notifications
```

Optional (Google Sheets legacy path):
```
GOOGLE_SERVICE_ACCOUNT_KEY   # Minified JSON of service account
ROLE_KEYS                    # Comma-separated role codes
SHEET_ID_*                   # Per-role Google Sheet IDs
```

### Styling

Tailwind CSS with `clsx` for conditional classes. No CSS modules. Global styles in `src/styles/globals.css`. Admin console uses dark sidebar (`bg-[#0f172a]`) via `AdminLayout.js`.
