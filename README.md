# RDC PMS – Performance Management System

A web-based RM/BH assessment workflow app that uses **Google Sheets as the single backend data store**.
No database required. Built with Next.js 14, Node.js API routes, and the Google Sheets API.

---

## Quick Start (Mock Mode – No Google Credentials Needed)

```bash
# 1. Clone / enter folder
cd rdc-pms

# 2. Install dependencies
npm install

# 3. Create env file (mock mode is ON by default)
cp .env.example .env.local

# 4. Start dev server
npm run dev

# 5. Open browser
http://localhost:3000
```

In **MOCK MODE**, the app runs entirely in memory with sample employees (PI, GET, DET roles).
All workflow actions — select, RM submit, BH submit, locking — work fully without any Google credentials.
Data resets on server restart.

---

## Folder Structure

```
rdc-pms/
├── src/
│   ├── lib/                    Core business logic
│   │   ├── sheetsClient.js     Google Sheets API auth (service account)
│   │   ├── sheetOps.js         Low-level sheet read/write/color/protect ops
│   │   ├── workflow.js         Business logic: select, RM submit, BH submit, unlock
│   │   ├── audit.js            Audit log read/write
│   │   ├── columnMap.js        Header parsing and column classification
│   │   ├── pairId.js           Assessment Pair ID generation
│   │   ├── roleConfig.js       Role → Sheet ID mapping from env vars
│   │   └── mockStore.js        In-memory mock data store (MOCK_MODE=true)
│   │
│   ├── pages/
│   │   ├── api/                Backend API routes (Next.js)
│   │   │   ├── roles/          GET role list, template, cycles, employees
│   │   │   ├── assessment/     POST select, rm-submit, bh-submit, new-cycle; GET pair
│   │   │   ├── dashboard/      GET dashboard data
│   │   │   ├── admin/          POST unlock (super admin)
│   │   │   └── audit/          GET audit log
│   │   │
│   │   ├── dashboard/index.js  Module 5: Pending / Reminder Dashboard
│   │   ├── admin/
│   │   │   ├── roles.js        Module 1: Role / Template Setup
│   │   │   ├── employees.js    Module 2: Employee / Cycle Selection
│   │   │   └── audit.js        Audit Log + Super Admin Unlock
│   │   └── assessment/
│   │       ├── rm.js           Module 3: RM Assessment Form
│   │       └── bh.js           Module 4: BH Assessment Form
│   │
│   ├── components/             UI components
│   │   ├── Layout.js           Page shell with top nav
│   │   ├── StatusBadge.js      Colored status badges + row color logic
│   │   ├── RatingDropdown.js   1–5 Richter scale dropdown
│   │   ├── EmployeeTable.js    Employee table with select/action buttons
│   │   ├── AssessmentForm.js   Dynamic assessment form (RM and BH)
│   │   └── DashboardPanel.js   Collapsible dashboard section
│   │
│   └── styles/globals.css      Tailwind + custom CSS classes
│
├── .env.example                All env vars documented
├── next.config.js
├── tailwind.config.js
└── README.md
```

---

## Google Sheet Structure

Each role must have its own Google Sheet with a `DATA` tab.
The header row must use the following column conventions:

### Required Identity Columns
| Column | Description |
|--------|-------------|
| EMP_CODE | Employee code (unique per employee) |
| EMP_NAME | Full name |
| ROLE | Role key (e.g. PI, GET, DET) |
| CYCLE | Assessment cycle (e.g. "Annual 2026") |
| ROW_TYPE | RM or BH |
| ASSESSMENT_PAIR_ID | Generated pair ID (e.g. EMP001_PI_2026_Annual_0001) |

### Narrative Columns (keep near front)
| Column | Type |
|--------|------|
| RECOMMENDATION | Textarea |
| COMMENTS | Textarea |
| GROWTH_POTENTIAL | Textarea |
| KEY_REMARKS | Textarea |

### Rating Columns (dynamic – add as many as needed)
```
Q1_RATING, Q1_COMMENT
Q2_RATING, Q2_COMMENT
Q3_RATING, Q3_COMMENT
... (unlimited)
```
- `Q*_RATING` → renders as 1–5 dropdown
- `Q*_COMMENT` → renders as textarea

### Routing Columns
```
RM_NAME, RM_EMAIL, BH_NAME, BH_EMAIL
```

### System Columns (auto-managed by app)
```
STATUS, LOCK_STATUS, SELECTION_FLAG, SELECTED_BY, SELECTED_ON,
PARENT_RM_ROW, RM_SUBMITTED_ON, BH_SUBMITTED_ON,
LAST_UPDATED_BY, LAST_UPDATED_ON
```

### Audit Tab
The app auto-creates an `AUDIT_LOG` tab in the same spreadsheet.

---

## Row / Color Model

| State | Row Color | Description |
|-------|-----------|-------------|
| Idle | White | Not yet selected |
| Selected | **Purple** | Selected by HR, pending RM submission |
| RM Submitted | **Blue** | RM has submitted; BH row created below |
| BH Submitted | **Green** | BH has finalized; both rows locked |

**RM row and BH row always appear one below the other.**
Same employee across multiple cycles will have adjacent row pairs.

---

## Workflow Steps

```
1. Admin → Employee Selection → Select employee for cycle [row turns PURPLE]
2. RM → RM Assessment Form → Fill ratings + narrative → Submit
   └── RM row turns BLUE, locks
   └── BH row created immediately below
3. BH → BH Assessment Form → Review RM values → Amend or accept → Submit
   └── BH row turns GREEN, locks
   └── Both rows finalized and fully locked
```

---

## Environment Variables

See `.env.example` for full documentation. Key variables:

```env
# Run without Google Sheets (in-memory mock data)
MOCK_MODE=true

# Google service account JSON (one line)
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}

# Role keys and sheet IDs
ROLE_KEYS=PI,GET,DET
SHEET_ID_PI=<google-sheet-id>
ROLE_LABEL_PI=Plant Incharge

# Super admin (can unlock finalized rows)
SUPER_ADMINS=admin@rdcconcrete.com
```

---

## Connecting to Google Sheets (Production Setup)

### Step 1: Create a Service Account
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project → Enable **Google Sheets API**
3. Create a Service Account → Download JSON key
4. Minify the JSON to a single line and paste into `GOOGLE_SERVICE_ACCOUNT_KEY`

### Step 2: Share the Sheet with the Service Account
1. Open your Google Sheet
2. Share → Add the service account email (e.g. `pms@your-project.iam.gserviceaccount.com`)
3. Grant **Editor** access

### Step 3: Set Sheet IDs
From the sheet URL: `https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit`
Set `SHEET_ID_PI=<SHEET_ID>` etc. in `.env.local`

### Step 4: Set MOCK_MODE=false
```env
MOCK_MODE=false
```

### Step 5: Prepare DATA Tab
The Google Sheet must have a tab named exactly `DATA` with the header row as described above.

---

## Adding a New Role

1. Create a new Google Sheet with the `DATA` tab and correct headers
2. Share with the service account (Editor access)
3. Add to `.env.local`:
   ```env
   ROLE_KEYS=PI,GET,DET,NEW
   SHEET_ID_NEW=<sheet-id>
   ROLE_LABEL_NEW=New Role Name
   ```
4. Restart the dev server

---

## Assessment Pair ID Format

```
EMP001_PI_2026_Annual_0007
│      │  │    │      └── Sequence (zero-padded, per sheet)
│      │  │    └── Cycle (sanitized)
│      │  └── Year
│      └── Role key
└── Employee code
```

Both RM row and BH row share the same Assessment Pair ID.
Multiple cycles for the same employee get different pair IDs.

---

## Locking Logic

- **Frontend**: disables form fields when `LOCK_STATUS` is `RM Locked` or `Fully Locked`
- **Backend**: checks `LOCK_STATUS` before any write; rejects locked rows with 400 error
- **Google Sheets**: `protectedRanges` added via API after each submission (real mode only)
- **Super Admin Unlock**: via `/admin/audit` page → Unlock Row form → creates audit entry

---

## Collaboration (2–3 HR Users)

- `SELECTED_BY` / `SELECTED_ON` fields show who selected a row
- Backend rejects re-submission of already-submitted rows
- Future: add optimistic locking (check timestamp before write)

---

## Extending Later

| Feature | Where to add |
|---------|-------------|
| Email reminders | `src/lib/email.js` + call from `workflow.js` after submit |
| Google OAuth login | `next-auth` with Google provider; replace `getCurrentUser()` |
| Reports / exports | New API route reading all rows + generating XLSX |
| More cycles | Just add new rows via Employee Selection → Add New Cycle Row |
| More questions | Add `Q6_RATING`, `Q6_COMMENT` columns to the sheet; app auto-detects |

---

## Scripts

```bash
npm run dev      # Start development server (http://localhost:3000)
npm run build    # Build for production
npm run start    # Start production server
npm run lint     # ESLint check
```

---

*RDC Concrete (India) Ltd – Internal Tool – v1.0*
