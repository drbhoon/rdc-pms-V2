/**
 * Generate the RDC PARAKH HR User Guide as a .docx file.
 * Run once: `node generate_user_guide.js` — produces RDC_PARAKH_User_Guide.docx
 */
const fs = require('fs');
const path = require('path');

// Resolve docx from the global node_modules
const NPM_GLOBAL = require('child_process')
  .execSync('npm root -g', { encoding: 'utf8' })
  .trim();
require('module').globalPaths.push(NPM_GLOBAL);
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat, HeadingLevel,
  BorderStyle, WidthType, ShadingType, ExternalHyperlink, PageBreak,
  PageNumber,
} = require(path.join(NPM_GLOBAL, 'docx'));

// ── Helpers ─────────────────────────────────────────────────────────────────

const BRAND   = '1E3A8A';   // deep blue
const ACCENT  = '4F46E5';   // indigo
const DANGER  = 'B91C1C';   // red-700
const SOFT_BG = 'F1F5F9';   // slate-100
const RULE    = 'CBD5E1';   // slate-300

function p(text, opts = {}) {
  return new Paragraph({
    spacing: { before: opts.before ?? 0, after: opts.after ?? 80 },
    alignment: opts.alignment,
    children: [
      new TextRun({
        text,
        bold: opts.bold,
        italics: opts.italics,
        size: opts.size ?? 20,        // 10pt default body
        color: opts.color,
        font: 'Arial',
      }),
    ],
  });
}

function rich(parts, opts = {}) {
  return new Paragraph({
    spacing: { before: opts.before ?? 0, after: opts.after ?? 80 },
    children: parts.map((part) => {
      if (typeof part === 'string') {
        return new TextRun({ text: part, size: opts.size ?? 20, font: 'Arial' });
      }
      return new TextRun({
        text: part.text,
        bold: part.bold,
        italics: part.italics,
        color: part.color,
        size: part.size ?? opts.size ?? 20,
        font: 'Arial',
      });
    }),
  });
}

function bullet(text, level = 0) {
  return new Paragraph({
    numbering: { reference: 'bullets', level },
    spacing: { before: 0, after: 40 },
    children: [new TextRun({ text, size: 20, font: 'Arial' })],
  });
}

function richBullet(parts, level = 0) {
  return new Paragraph({
    numbering: { reference: 'bullets', level },
    spacing: { before: 0, after: 40 },
    children: parts.map((part) => {
      if (typeof part === 'string') {
        return new TextRun({ text: part, size: 20, font: 'Arial' });
      }
      return new TextRun({
        text: part.text,
        bold: part.bold,
        italics: part.italics,
        color: part.color,
        size: 20,
        font: 'Arial',
      });
    }),
  });
}

function step(text, level = 0) {
  return new Paragraph({
    numbering: { reference: 'steps', level },
    spacing: { before: 0, after: 40 },
    children: [new TextRun({ text, size: 20, font: 'Arial' })],
  });
}

function richStep(parts, level = 0) {
  return new Paragraph({
    numbering: { reference: 'steps', level },
    spacing: { before: 0, after: 40 },
    children: parts.map((part) => {
      if (typeof part === 'string') {
        return new TextRun({ text: part, size: 20, font: 'Arial' });
      }
      return new TextRun({
        text: part.text,
        bold: part.bold,
        italics: part.italics,
        color: part.color,
        size: 20,
        font: 'Arial',
      });
    }),
  });
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 200, after: 80 },
    children: [new TextRun({ text, bold: true, size: 26, color: BRAND, font: 'Arial' })],
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BRAND, space: 1 } },
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 160, after: 60 },
    children: [new TextRun({ text, bold: true, size: 22, color: '1F2937', font: 'Arial' })],
  });
}

// Coloured callout box (single-cell table) — used for the destructive warning
function callout({ heading, body, color, bg }) {
  return new Table({
    width: { size: 9026, type: WidthType.DXA },
    columnWidths: [9026],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 9026, type: WidthType.DXA },
            shading: { fill: bg, type: ShadingType.CLEAR },
            margins: { top: 140, bottom: 140, left: 200, right: 200 },
            borders: {
              top:    { style: BorderStyle.SINGLE, size: 12, color },
              bottom: { style: BorderStyle.SINGLE, size: 12, color },
              left:   { style: BorderStyle.SINGLE, size: 12, color },
              right:  { style: BorderStyle.SINGLE, size: 12, color },
            },
            children: [
              new Paragraph({
                spacing: { before: 0, after: 60 },
                children: [new TextRun({ text: heading, bold: true, size: 22, color, font: 'Arial' })],
              }),
              new Paragraph({
                spacing: { before: 0, after: 0 },
                children: [new TextRun({ text: body, size: 20, color: '1F2937', font: 'Arial' })],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

// Bordered table cell helper
function cell(text, opts = {}) {
  return new TableCell({
    width: { size: opts.width, type: WidthType.DXA },
    shading: opts.bg ? { fill: opts.bg, type: ShadingType.CLEAR } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 4, color: RULE },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE },
      left:   { style: BorderStyle.SINGLE, size: 4, color: RULE },
      right:  { style: BorderStyle.SINGLE, size: 4, color: RULE },
    },
    children: [new Paragraph({
      spacing: { before: 0, after: 0 },
      children: [new TextRun({
        text,
        bold: opts.bold,
        size: opts.size ?? 18,   // 9pt for table content
        color: opts.color,
        font: 'Arial',
      })],
    })],
  });
}

// ── Document content ────────────────────────────────────────────────────────

const children = [];

// Title block
children.push(
  new Paragraph({
    spacing: { before: 0, after: 60 },
    alignment: AlignmentType.LEFT,
    children: [new TextRun({ text: 'RDC PARAKH', bold: true, size: 44, color: BRAND, font: 'Arial' })],
  }),
  new Paragraph({
    spacing: { before: 0, after: 80 },
    children: [new TextRun({ text: 'HR User Guide — Operational Quick Reference', bold: true, size: 26, color: '1F2937', font: 'Arial' })],
  }),
  new Paragraph({
    spacing: { before: 0, after: 60 },
    children: [
      new TextRun({ text: 'System: ', size: 20, color: '475569', font: 'Arial' }),
      new ExternalHyperlink({
        link: 'https://rdc-pms-production.up.railway.app',
        children: [new TextRun({ text: 'https://rdc-pms-production.up.railway.app', size: 20, color: ACCENT, underline: {}, font: 'Arial' })],
      }),
    ],
  }),
  new Paragraph({
    spacing: { before: 0, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BRAND, space: 6 } },
    children: [new TextRun({
      text: 'Three-layer flow: Self (employee, optional) → RM (Reviewer) → BH (Approver). Reviewers receive emails automatically; you only do the setup work.',
      size: 19, italics: true, color: '475569', font: 'Arial',
    })],
  }),
);

// 0. Log In
children.push(h1('0. Log In'));
children.push(step('Open the system URL above.'));
children.push(richStep(['Click ', { text: 'Login', bold: true }, ', enter your HR email and password.']));
children.push(richStep(['Sidebar shows: ', { text: 'Dashboard · Setup · Employees · Cycle Management · Reports · Audit', bold: true }, '.']));

// 1. Template
children.push(h1('1. One-Time: Create the Assessment Template'));
children.push(p('The template defines the questions and routing for one assessment type (e.g. GET Annual).'));
children.push(richStep(['Go to ', { text: 'Setup', bold: true }, '.']));
children.push(step('Drag your assessment Excel onto the upload area.'));
children.push(step('Review the auto-classification on the right:'));
children.push(richBullet([{ text: 'Routing fields', bold: true }, ' — confirm RM Name/Email and BH Name/Email columns.'], 1));
children.push(richBullet([{ text: 'Profile fields', bold: true }, ' — basic employee data (Designation, Plant, etc.).'], 1));
children.push(richBullet([{ text: 'Question columns', bold: true }, ' — anything numbered like "1. Knowledge of Job".'], 1));
children.push(richStep([
  { text: '(Optional) Enable Self-Assessment:', bold: true, color: ACCENT },
  ' tick ', { text: '"Has self-assessment"', bold: true }, ' on the Identity card. A new ',
  { text: 'Skip Self?', bold: true }, ' column appears in the question table.',
]));
children.push(richBullet([
  { text: 'Leave it unticked', bold: true }, ' for most questions (asked of self by default).',
], 1));
children.push(richBullet([
  { text: 'Tick it', bold: true }, ' only for evaluative questions that should NOT be shown to the employee — e.g. ',
  { text: 'Potential for Growth', italics: true }, ', ', { text: 'Salary Recommendation', italics: true }, '.',
], 1));
children.push(richStep(['Click ', { text: '✓ Create Template', bold: true }, '.']));
children.push(rich([
  { text: 'To toggle Self on an existing template: ', bold: true },
  'Setup → ', { text: 'View', bold: true }, ' on the card → tick ',
  { text: 'Has self-assessment', bold: true }, ' → tick ',
  { text: 'Skip Self?', bold: true }, ' per question → ',
  { text: 'Save Changes', bold: true }, '.',
]));
children.push(rich([
  { text: 'To delete: ', bold: true },
  'click ', { text: 'Delete', bold: true },
  ' on the card. Hidden from dropdowns; existing reports remain intact.',
]));

// 2. Employees
children.push(h1('2. One-Time per Cycle: Upload Employees'));
children.push(richStep(['Go to ', { text: 'Employees', bold: true }, '.']));
children.push(step('Pick the template from the dropdown.'));
children.push(step('Drag the Employees Excel onto the upload area.'));
children.push(rich([{ text: 'Required columns:', bold: true }], { before: 60, after: 40 }));
children.push(richBullet([{ text: 'EMP_CODE', bold: true }, ' — unique employee code']));
children.push(richBullet([{ text: 'EMP_NAME', bold: true }, ' — full name']));
children.push(richBullet([
  { text: 'EMP_EMAIL', bold: true, color: ACCENT },
  ' — required if the template has Self-Assessment (without it, the launch will fail for that employee)',
]));
children.push(richBullet([{ text: 'EMP_ROLE', bold: true }, ' — actual job title (e.g. ', { text: 'Trainee Engineer', italics: true }, ') used in invite emails']));
children.push(bullet('Routing columns matching the template (RM_Name, RM_Email, BH_Name, BH_Email)'));
children.push(richStep(['Click ', { text: 'Upload Employees', bold: true }, '. The green banner confirms how many were imported and whether emails were captured.']));
children.push(richStep(['Verify the ', { text: 'Email', bold: true }, ' column is populated in the employee table below.']));

// 3. Launch
children.push(h1('3. Launch a Cycle'));
children.push(richStep(['Go to ', { text: 'Cycle Management', bold: true }, '.']));
children.push(richStep([
  { text: 'Role', bold: true }, ' → pick template. ',
  { text: 'Cycle', bold: true }, ' → pick or type a name and click ',
  { text: '+ New Cycle', bold: true }, '.',
]));
children.push(richStep([
  { text: 'Start On', bold: true }, ' (optional): leave blank to invite immediately, or pick a future date.',
]));
children.push(step('Tick the employees you want to assess.'));
children.push(richStep(['Click ', { text: '🚀 Launch Selected (n)', bold: true }, '.']));
children.push(p('What happens automatically:', { bold: true, before: 80, after: 60 }));
children.push(richBullet([
  { text: 'If template has Self-Assessment:', bold: true, color: ACCENT },
  ' status → ', { text: 'Awaiting Self', bold: true },
  '. Employee gets indigo "Action Required: Self-Assessment" email. When they submit, RM is auto-emailed.',
]));
children.push(richBullet([
  { text: 'If no Self-Assessment:', bold: true },
  ' status → ', { text: 'Awaiting RM', bold: true }, '. RM is auto-emailed straight away.',
]));
children.push(richBullet([
  'After RM submits → ', { text: 'Awaiting BH', bold: true }, ' → BH auto-emailed.',
]));
children.push(richBullet([
  'After BH submits → ', { text: '✓ Finalised', bold: true, color: '15803D' }, ' (locked).',
]));
children.push(p('Daily reminder emails go to pending reviewers at midnight IST until they submit. You don’t need to chase.', { italics: true, before: 40, after: 80 }));
children.push(rich([
  { text: 'To copy a link manually: ', bold: true },
  'click 📋 in the ',
  { text: 'Self / RM / BH Link', bold: true },
  ' columns. Locked links show "locked"; submitted ones show "used".',
]));
children.push(rich([
  { text: 'To delete a wrong launch: ', bold: true },
  'click ', { text: 'Delete', bold: true }, ' in the Action column. Available before the RM submits.',
]));

// 4. Monitor
children.push(h1('4. Monitor Progress'));
children.push(rich([
  { text: 'Dashboard', bold: true }, ' (live, refreshes every 30s): six stat cards — ',
  { text: 'Total · Awaiting Self · Awaiting RM · RM Submitted · Awaiting BH · Finalised', italics: true },
  '. Green ', { text: 'HR Action', bold: true }, ' badge on Finalised pairs deep-links into Audit.',
]));
children.push(rich([
  { text: 'Cycle Management', bold: true }, ' is the operational view: copy links, delete bad launches, click ',
  { text: 'Refresh', bold: true }, ' to re-pull state.',
]));

// 5. Reports
children.push(h1('5. Pull Reports'));
children.push(richStep([
  { text: 'Reports', bold: true }, ' → ',
  { text: 'Active Assessments', bold: true }, ' tab.',
]));
children.push(richStep(['Pick ', { text: 'Template', bold: true }, ', then ', { text: 'Cycle', bold: true }, '.']));
children.push(richStep([
  'On-screen answer cells stack ',
  { text: 'Indigo (Self)', bold: true, color: ACCENT },
  ' → ',
  { text: 'Blue (RM)', bold: true, color: '1D4ED8' },
  ' → ',
  { text: 'Green (BH)', bold: true, color: '15803D' },
  '.',
]));
children.push(richStep([
  'Click ', { text: 'Download Excel', bold: true }, ' for a flat report — each employee gets up to three rows (Self, RM, BH); Reviewer column distinguishes them.',
]));
children.push(rich([
  'The ', { text: 'Archived', bold: true }, ' tab keeps history of past cycles available even after the template is deactivated.',
]));

// 6. Unlock
children.push(h1('6. Unlock a Finalised Assessment (Super Admin only)'));
children.push(richStep([
  { text: 'Audit', bold: true }, ' page → fill ', { text: 'Pair ID', bold: true },
  ' (or click the green ', { text: 'HR Action', bold: true }, ' badge from Dashboard — auto-fills).',
]));
children.push(step('Type a reason (≥ 10 characters).'));
children.push(richStep(['Click ', { text: 'Unlock Assessment', bold: true }, '. Form re-opens for the BH; unlock is logged.']));

// Page break before troubleshooting
children.push(new Paragraph({ children: [new PageBreak()] }));

// Common Gotchas table
children.push(h1('Common Gotchas'));

const COL_W = [3200, 3000, 2826]; // sums to 9026 (A4 content width)

children.push(new Table({
  width: { size: 9026, type: WidthType.DXA },
  columnWidths: COL_W,
  rows: [
    new TableRow({
      tableHeader: true,
      children: [
        cell('Symptom',      { width: COL_W[0], bold: true, bg: BRAND, color: 'FFFFFF', size: 19 }),
        cell('Likely cause', { width: COL_W[1], bold: true, bg: BRAND, color: 'FFFFFF', size: 19 }),
        cell('Fix',          { width: COL_W[2], bold: true, bg: BRAND, color: 'FFFFFF', size: 19 }),
      ],
    }),
    new TableRow({
      children: [
        cell('"Self-assessment is enabled… but employee has no EMP_EMAIL"', { width: COL_W[0] }),
        cell('Excel didn’t have EMP_EMAIL column for that employee',     { width: COL_W[1] }),
        cell('Re-upload Employees Excel with the column populated, then launch again', { width: COL_W[2] }),
      ],
    }),
    new TableRow({
      children: [
        cell('RM didn’t get the email',                                                           { width: COL_W[0], bg: SOFT_BG }),
        cell('RM_Email column was blank or invalid in the Employees Excel',                            { width: COL_W[1], bg: SOFT_BG }),
        cell('Fix the email, re-upload, delete the broken pair, launch again',                          { width: COL_W[2], bg: SOFT_BG }),
      ],
    }),
    new TableRow({
      children: [
        cell('Reviewer says "link not working"',                          { width: COL_W[0] }),
        cell('Link copied incorrectly, or pair was already submitted',    { width: COL_W[1] }),
        cell('Open the link yourself — if "Already submitted" shows, status is fine', { width: COL_W[2] }),
      ],
    }),
    new TableRow({
      children: [
        cell('Employee role shows as the template name in emails',        { width: COL_W[0], bg: SOFT_BG }),
        cell('EMP_ROLE column missing from Excel',                         { width: COL_W[1], bg: SOFT_BG }),
        cell('Add EMP_ROLE column with the job title (e.g. Trainee Engineer)', { width: COL_W[2], bg: SOFT_BG }),
      ],
    }),
    new TableRow({
      children: [
        cell('Same employee can’t be assessed twice in one cycle',   { width: COL_W[0] }),
        cell('By design — one pair per (employee + template + cycle)',     { width: COL_W[1] }),
        cell('Use a different cycle name (e.g. FY25-26 Mid-Year)',         { width: COL_W[2] }),
      ],
    }),
    new TableRow({
      children: [
        cell('Self-form skipped a question I expected',                   { width: COL_W[0], bg: SOFT_BG }),
        cell('That question is marked "Skip Self" in the template',        { width: COL_W[1], bg: SOFT_BG }),
        cell('Setup → View template → untick Skip Self → Save Changes',    { width: COL_W[2], bg: SOFT_BG }),
      ],
    }),
  ],
}));

// Spacer
children.push(new Paragraph({ spacing: { before: 0, after: 200 }, children: [new TextRun({ text: '', font: 'Arial' })] }));

// Testing-only callout
children.push(callout({
  heading: '⚠ Testing-Only: Clear All Data',
  body: 'The Dashboard shows a red "CLEAR ALL DATA" button (Super Admin only). It wipes every template, employee, pair, link, and audit row — your HR login stays. Use only during testing. The button will be removed before live rollout.',
  color: DANGER,
  bg: 'FEE2E2',
}));

// Footer note
children.push(new Paragraph({
  spacing: { before: 240, after: 0 },
  alignment: AlignmentType.CENTER,
  children: [new TextRun({
    text: 'RDC Concrete (India) Ltd  ·  RDC PARAKH System  ·  Internal Use',
    italics: true, size: 16, color: '94A3B8', font: 'Arial',
  })],
}));

// ── Document ────────────────────────────────────────────────────────────────

const doc = new Document({
  creator: 'RDC PARAKH',
  title: 'RDC PARAKH HR User Guide',
  styles: {
    default: { document: { run: { font: 'Arial', size: 20 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 26, bold: true, font: 'Arial', color: BRAND },
        paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 22, bold: true, font: 'Arial', color: '1F2937' },
        paragraph: { spacing: { before: 160, after: 60 }, outlineLevel: 1 } },
    ],
  },
  numbering: {
    config: [
      { reference: 'bullets',
        levels: [
          { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 480, hanging: 240 } } } },
          { level: 1, format: LevelFormat.BULLET, text: '◦', alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 960, hanging: 240 } } } },
        ] },
      { reference: 'steps',
        levels: [
          { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 480, hanging: 360 } } } },
          { level: 1, format: LevelFormat.LOWER_LETTER, text: '%2.', alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 960, hanging: 360 } } } },
        ] },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 },           // A4
        margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },  // 0.75"
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: 'RDC PARAKH · HR User Guide', italics: true, size: 16, color: '94A3B8', font: 'Arial' })],
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [
            new TextRun({ text: 'Page ', size: 16, color: '94A3B8', font: 'Arial' }),
            new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '94A3B8', font: 'Arial' }),
            new TextRun({ text: ' of ', size: 16, color: '94A3B8', font: 'Arial' }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: '94A3B8', font: 'Arial' }),
          ],
        })],
      }),
    },
    children,
  }],
});

const OUT = path.join(__dirname, 'RDC_PARAKH_User_Guide.docx');
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log('Wrote', OUT, '—', buf.length, 'bytes');
});
