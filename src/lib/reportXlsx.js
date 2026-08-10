/**
 * reportXlsx.js — shared Excel report builder used by both the admin Reports
 * page (multi-pair, client-side) and the HR-SPOC one-pair download (server).
 *
 * Layout: each employee gets up to THREE stacked rows — Self (if requireSelf),
 * RM, BH. Identity columns repeat on every row; the Reviewer column ("SELF" /
 * "RM" / "BH") distinguishes them.
 *
 * V2: HR commenter values (HR_SPOC / HR_HEAD / COTO fields) are appended as
 * extra columns AFTER "Submitted On" and are populated ONLY on each pair's BH
 * row (blank on the Self and RM rows). No extra stacked rows.
 *
 * Returns a SheetJS workbook. Callers output it:
 *   client:  XLSX.writeFile(wb, name)
 *   server:  XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' })
 */
import * as XLSX from 'xlsx';
import { questionAudience } from './ojt';

const HR_DEFS = [
  { role: 'HR_SPOC', label: 'HR-SPOC', key: 'hrSpoc' },
  { role: 'HR_HEAD', label: 'HR-HEAD', key: 'hrHead' },
  { role: 'COTO',    label: 'COTO',    key: 'coto'   },
];

function fmtDate(d) {
  return d ? new Date(d).toLocaleString('en-IN') : '';
}

/**
 * @param {object} opts
 * @param {string} opts.roleLabel
 * @param {string} opts.cycle
 * @param {Array}  opts.questions     [{ key, label, excludeFromSelf }]
 * @param {Array}  opts.profileCols   [{ key, label }]
 * @param {Array}  opts.rows          pair rows incl. *Answers, hrReviews, requireHr*
 * @param {object} [opts.hrFieldDefs] { hrSpoc:[{key,label}], hrHead:[...], coto:[...] }
 */
export function buildReportWorkbook({ roleLabel, cycle, questions, profileCols, rows, hrFieldDefs = {}, templateType = 'STANDARD' }) {
  const profileHeaders = profileCols.map((c) => c.label);

  // Which HR roles have at least one defined field → become column groups.
  const activeHr = HR_DEFS
    .map((d) => ({ ...d, fields: Array.isArray(hrFieldDefs[d.key]) ? hrFieldDefs[d.key] : [] }))
    .filter((d) => d.fields.length > 0);

  const hrHeaders = activeHr.flatMap((d) => d.fields.map((f) => `${d.label}: ${f.label}`));

  // Build the HR values for a given pair (shared by both layouts).
  function hrValuesForPair(r) {
    const reviews = r.hrReviews || {};
    return activeHr.flatMap((d) => {
      const filled = reviews[d.role] || {};
      return d.fields.map((f) => {
        const v = filled[f.key];
        return v === undefined || v === null ? '' : v;
      });
    });
  }

  // ── OJT (segmented) layout: ONE row per employee, columns grouped by
  //    audience (Employee / RM / BH), each from its own answer set. ──────────
  if (templateType === 'OJT') {
    return buildOjtWorkbook({ questions, profileCols, profileHeaders, rows, activeHr, hrHeaders, hrValuesForPair });
  }

  const headers = [
    'Sr No', 'Emp Code', 'Employee Name', 'Level 1 Name', 'Level 2 Name',
    ...profileHeaders,
    'Level 1 Email', 'Level 2 Email', 'Status', 'Reviewer',
    ...questions.map((q) => q.label),
    'Submitted On',
    ...hrHeaders,
  ];

  // Blank padding for the HR columns (used on Self/RM rows).
  const hrBlank = hrHeaders.map(() => '');

  // Build the HR values for a given pair (appears on the BH row only).
  function hrValuesFor(r) {
    const reviews = r.hrReviews || {};
    return activeHr.flatMap((d) => {
      const filled = reviews[d.role] || {};
      return d.fields.map((f) => {
        const v = filled[f.key];
        return v === undefined || v === null ? '' : v;
      });
    });
  }

  const dataRows = [];
  rows.forEach((r, idx) => {
    const sr = idx + 1;
    const profile = profileCols.map((c) => {
      const v = r.profileData?.[c.key];
      return v === undefined || v === null ? '' : v;
    });
    const selfAns = questions.map((q) => {
      if (q.excludeFromSelf) return '';
      const v = r.selfAnswers?.[q.key];
      return v === undefined || v === null ? '' : v;
    });
    const rmAns = questions.map((q) => {
      const v = r.rmAnswers?.[q.key];
      return v === undefined || v === null ? '' : v;
    });
    const bhAns = questions.map((q) => {
      const v = r.bhAnswers?.[q.key];
      return v === undefined || v === null ? '' : v;
    });
    const ident = [sr, r.empCode, r.empName, r.rmName, r.bhName, ...profile, r.rmEmail, r.bhEmail, r.status];

    // Feedback templates are employee-only — emit a single SELF row per employee
    // (no empty RM/BH rows).
    if (r.templateType === 'FEEDBACK') {
      dataRows.push([...ident, 'SELF', ...selfAns, fmtDate(r.selfSubmittedOn), ...hrBlank]);
      return;
    }

    if (r.requireSelf) {
      dataRows.push([...ident, 'SELF', ...selfAns, fmtDate(r.selfSubmittedOn), ...hrBlank]);
    }
    dataRows.push([...ident, 'Level 1', ...rmAns, fmtDate(r.rmSubmittedOn), ...hrBlank]);
    // Level 2 row carries the HR commenter values at the end.
    dataRows.push([...ident, 'Level 2', ...bhAns, fmtDate(r.bhSubmittedOn), ...hrValuesFor(r)]);
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);

  ws['!cols'] = headers.map((h) => {
    const lower = String(h).toLowerCase();
    if (lower === 'sr no') return { wch: 6 };
    if (lower === 'reviewer') return { wch: 10 };
    if (lower === 'emp code') return { wch: 12 };
    if (lower === 'status') return { wch: 16 };
    if (lower === 'employee name' || lower === 'level 1 name' || lower === 'level 2 name') return { wch: 24 };
    if (lower === 'level 1 email' || lower === 'level 2 email') return { wch: 28 };
    if (lower === 'submitted on') return { wch: 20 };
    if (lower.startsWith('hr-spoc:') || lower.startsWith('hr-head:') || lower.startsWith('coto:')) return { wch: 28 };
    return { wch: 30 };
  });
  ws['!freeze'] = { xSplit: 5, ySplit: 1 };

  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
    if (cell) cell.s = { font: { bold: true } };
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Assessment Report');
  return wb;
}

// OJT layout — one row per employee; question columns grouped Employee / RM / BH,
// each pulled from its own answer set.
function buildOjtWorkbook({ questions, profileCols, profileHeaders, rows, hrHeaders, hrValuesForPair }) {
  const empQ = questions.filter((q) => questionAudience(q) === 'EMPLOYEE');
  const rmQ  = questions.filter((q) => questionAudience(q) === 'RM');
  const bhQ  = questions.filter((q) => questionAudience(q) === 'BH');

  const headers = [
    'Sr No', 'Emp Code', 'Employee Name', 'Level 1 Name', 'Level 2 Name',
    ...profileHeaders,
    'Level 1 Email', 'Level 2 Email', 'Status',
    ...empQ.map((q) => `Employee: ${q.label}`),
    ...rmQ.map((q) => `RM: ${q.label}`),
    ...bhQ.map((q) => `BH: ${q.label}`),
    'Self Submitted', 'Level 1 Submitted', 'Level 2 Submitted',
    ...hrHeaders,
  ];

  const cell = (ans, q) => {
    const v = ans?.[q.key];
    return v === undefined || v === null ? '' : v;
  };

  const dataRows = rows.map((r, idx) => {
    const profile = profileCols.map((c) => {
      const v = r.profileData?.[c.key];
      return v === undefined || v === null ? '' : v;
    });
    return [
      idx + 1, r.empCode, r.empName, r.rmName, r.bhName,
      ...profile,
      r.rmEmail, r.bhEmail, r.status,
      ...empQ.map((q) => cell(r.selfAnswers, q)),
      ...rmQ.map((q) => cell(r.rmAnswers, q)),
      ...bhQ.map((q) => cell(r.bhAnswers, q)),
      fmtDate(r.selfSubmittedOn), fmtDate(r.rmSubmittedOn), fmtDate(r.bhSubmittedOn),
      ...hrValuesForPair(r),
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
  ws['!cols'] = headers.map((h) => {
    const lower = String(h).toLowerCase();
    if (lower === 'sr no') return { wch: 6 };
    if (lower === 'emp code') return { wch: 12 };
    if (lower === 'status') return { wch: 16 };
    if (lower === 'employee name' || lower === 'level 1 name' || lower === 'level 2 name') return { wch: 24 };
    if (lower === 'level 1 email' || lower === 'level 2 email') return { wch: 28 };
    if (lower.endsWith('submitted')) return { wch: 20 };
    return { wch: 30 };
  });
  ws['!freeze'] = { xSplit: 5, ySplit: 1 };
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let c = range.s.c; c <= range.e.c; c++) {
    const c0 = ws[XLSX.utils.encode_cell({ r: 0, c })];
    if (c0) c0.s = { font: { bold: true } };
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'OJT Report');
  return wb;
}

export function reportFilename(roleLabel, cycle) {
  const suffix = cycle || 'archived';
  return `${String(roleLabel || 'report').replace(/\s+/g, '_')}_${suffix}_report.xlsx`;
}
