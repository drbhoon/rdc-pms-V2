/**
 * admin/setup.js — Role Template Management
 *
 * FLOW:
 *  Step 1 — Upload Excel: drag/drop → reads headers → goes to Step 2
 *  Step 2 — Review columns: assign routing, verify profile/question split → "Create Template"
 *
 * NO fixed column names required. Detection is dynamic from Excel headers.
 * Template name derived from filename (editable). Delete supported.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import AdminLayout from '../../components/AdminLayout';
import HrStagesEditor, { ActivationSummary } from '../../components/HrStagesEditor';

// Seed HR-stage field definitions from auto-detected HR_*/COTO_* columns.
// `cols` = [{ header, type }] where type is hr_spoc | hr_head | coto.
function seedHrStagesFromCols(cols) {
  const mk = (type) => cols
    .filter((c) => c.type === type)
    .map((c) => ({ key: c.header.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, ''), label: c.header, fieldType: 'narrative' }));
  return {
    hrSpocFields: mk('hr_spoc'),
    hrHeadFields: mk('hr_head'),
    cotoFields:   mk('coto'),
  };
}

// ── Column Classification ─────────────────────────────────────────────────────
// Returns one of: rm_name | rm_email | bh_name | bh_email |
//                 identity | profile | rating | narrative | number | date

const IDENTITY_KEYS = new Set(['EMP_CODE', 'EMP_NAME', 'EMPCODE', 'EMPNAME',
  'EMPLOYEE_CODE', 'EMPLOYEE_NAME', 'EMPLOYEE_ID', 'CYCLE', 'ROLE',
  'EMP_EMAIL', 'EMPEMAIL', 'EMPLOYEE_EMAIL', 'EMPLOYEEEMAIL', 'EMP_MAIL']);

function classifyHeader(header) {
  const raw = header.trim();
  const h   = raw.toUpperCase().replace(/\s+/g, '_');
  const orig = raw.toUpperCase();

  // ── V2: HR commenter field columns (HR_SPOC_* / HR_HEAD_* / COTO_*).
  // These are NOT assessment questions; they belong to the post-BH commenter
  // stages and are configured in the HR Review Stages editor, not here.
  if (/^HR[_\s-]?SPOC[_\s-]/i.test(raw)) return 'hr_spoc';
  if (/^HR[_\s-]?HEAD[_\s-]/i.test(raw)) return 'hr_head';
  if (/^COTO[_\s-]/i.test(raw))          return 'coto';

  // ── Routing: reviewer (RM / BM / Reporting Manager)
  if (/^(RM|BM)_/i.test(raw)) {
    if (/name/i.test(raw))            return 'rm_name';
    if (/e?mail/i.test(raw))          return 'rm_email';  // handles typo BM_Emai
  }
  // ── Routing: approver (BH / Batch Head / Branch Head)
  if (/^BH_/i.test(raw)) {
    if (/name/i.test(raw))            return 'bh_name';
    if (/e?mail/i.test(raw))          return 'bh_email';
  }
  // Loose routing patterns (e.g. "Reporting Manager Email")
  if (/\b(rm|bm|reporting_?manager|batch_?manager)\b/i.test(raw)) {
    if (/name/i.test(raw))            return 'rm_name';
    if (/e?mail/i.test(raw))          return 'rm_email';
  }
  if (/\b(bh|batch_?head|branch_?head)\b/i.test(raw)) {
    if (/name/i.test(raw))            return 'bh_name';
    if (/e?mail/i.test(raw))          return 'bh_email';
  }

  // ── Fixed identity keys
  if (IDENTITY_KEYS.has(h)) return 'identity';

  // ── Profile (employee data, not a scored question)
  if (/\b(qualification|designation|department|plant|location|zone|region|division|branch|city|grade|level)\b/i.test(raw))
    return 'profile';

  // ── Numbered questions → rating  (handles leading spaces too)
  // Only columns with a leading digit (e.g. "1. Knowledge of Job") are assessment questions
  if (/^\s*\d+[\.\)]\s/.test(raw))   return 'rating';
  if (/^Q\d+_RATING$/i.test(raw))    return 'rating';

  // ── Narrative assessment questions (filled by RM/BH in the form)
  // Only classified as narrative if they explicitly look like RM/BH answer fields
  if (/\b(recommend|absorption|justification)\b/i.test(raw)) return 'narrative';

  // ── Date employee-info fields (not scored — stored in profileData)
  if (/\b(date|doj|dob|joining|born|since|expir)/i.test(raw))          return 'profile_date';

  // ── Number employee-info fields (not scored — stored in profileData)
  if (/\b(sr\.?\s*no|serial|stipend|salary|amount|strength|count)\b/i.test(raw)) return 'profile_number';

  if (/\b(comment|remark|observation|feedback|summary|suggestion|sales|volume|number)\b/i.test(raw))
    return 'profile';

  // Unknown → profile (safer default — HR can promote to question type if needed)
  return 'profile';
}

// Question types the HR can switch between
const Q_TYPES         = ['rating', 'narrative', 'number', 'date', 'profile'];
const PROFILE_TYPES   = ['profile', 'profile_date', 'profile_number']; // profile sub-types
const ALL_TYPES       = [...Q_TYPES, 'profile_date', 'profile_number'];
const Q_LABELS = {
  rating:          'Rating (1–5)',
  narrative:       'Narrative (text)',
  number:          'Number',
  date:            'Date',
  profile:         'Profile / Info (not a question)',
  profile_date:    'Date (employee info)',
  profile_number:  'Number (employee info)',
};
const Q_BADGE = {
  rating:         'bg-blue-100 text-blue-700',
  narrative:      'bg-purple-100 text-purple-700',
  number:         'bg-amber-100 text-amber-700',
  date:           'bg-green-100 text-green-700',
  profile:        'bg-slate-100 text-slate-500',
  profile_date:   'bg-teal-50 text-teal-700',
  profile_number: 'bg-orange-50 text-orange-700',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function slugify(name) {
  return name
    .replace(/\.[^/.]+$/, '')          // remove extension
    .replace(/[^a-zA-Z0-9]+/g, '-')   // non-alphanum → dash
    .replace(/^-+|-+$/g, '')           // trim dashes
    .toUpperCase()
    .slice(0, 40);
}

function Toast({ message, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 4500); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl px-5 py-3.5 shadow-2xl text-sm font-medium max-w-sm
      ${type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}`}>
      {type === 'error'
        ? <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
        : <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
      }
      {message}
    </div>
  );
}

// ── STEP 1: Upload drop zone ──────────────────────────────────────────────────
function UploadZone({ onParsed }) {
  const [dragging, setDragging] = useState(false);
  const [err, setErr]           = useState('');
  const fileRef = useRef();

  function parseFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });

        // Pick the best sheet: prefer one whose first row contains EMP_CODE or RM_NAME
        // (handles multi-sheet files where Summary/title sheet comes first)
        const KEY_COLS = ['EMP_CODE', 'EMP_NAME', 'RM_NAME', 'RM_EMAIL', 'BH_NAME', 'BH_EMAIL'];
        let bestSheet = wb.SheetNames[0];
        let bestScore = -1;
        for (const name of wb.SheetNames) {
          const s = wb.Sheets[name];
          if (!s['!ref']) continue;
          const r0 = XLSX.utils.decode_range(s['!ref']).s.r;
          const cols = XLSX.utils.sheet_to_json(s, { header: 1, range: r0, defval: '' })[0] || [];
          const score = cols.filter(v => KEY_COLS.includes(String(v).trim().toUpperCase())).length;
          if (score > bestScore) { bestScore = score; bestSheet = name; }
        }

        const ws = wb.Sheets[bestSheet];
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
        const headers = [];
        for (let c = range.s.c; c <= range.e.c; c++) {
          const cell = ws[XLSX.utils.encode_cell({ r: range.s.r, c })];
          if (cell && cell.v != null) headers.push(String(cell.v).trim());
        }
        if (!headers.length) { setErr('No headers found in first row.'); return; }
        onParsed(file.name, headers);
      } catch { setErr('Could not parse Excel. Ensure it is a valid .xlsx/.xls file.'); }
    };
    reader.readAsArrayBuffer(file);
  }

  return (
    <div className="max-w-xl mx-auto">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) parseFile(f); }}
        onClick={() => fileRef.current?.click()}
        className={`rounded-2xl border-2 border-dashed px-8 py-14 text-center cursor-pointer transition-all
          ${dragging ? 'border-blue-400 bg-blue-50 scale-[1.01]' : 'border-slate-300 hover:border-blue-400 hover:bg-blue-50/40'}`}
      >
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
          onChange={(e) => { const f = e.target.files[0]; if (f) parseFile(f); }} />
        <svg className="mx-auto w-12 h-12 text-slate-300 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
        <p className="text-base font-semibold text-slate-700 mb-1">Drop your Assessment Excel here</p>
        <p className="text-sm text-slate-400">or click to browse — supports .xlsx and .xls</p>
        <p className="text-xs text-slate-300 mt-3">Column headers from your file will become questions automatically</p>
      </div>
      {err && <p className="mt-3 text-sm text-red-600 text-center">{err}</p>}
    </div>
  );
}

// ── STEP 2: Column review & confirm ──────────────────────────────────────────
function ReviewPanel({ filename, headers, onCreated, onBack }) {
  // Initialise columns with auto-classification
  // skipSelf is per-question and only used when includeSelf is true
  const [cols, setCols] = useState(() =>
    headers.map((h) => ({ header: h, type: classifyHeader(h), skipSelf: false }))
  );
  const [templateName, setTemplateName] = useState(
    filename.replace(/\.[^/.]+$/, '') // strip extension
  );
  const [roleKey, setRoleKey]   = useState(slugify(filename));
  const [includeSelf, setIncludeSelf] = useState(false);
  // V2: HR commenter stages, seeded from any detected HR_*/COTO_* columns.
  const [hrStages, setHrStages] = useState(() =>
    seedHrStagesFromCols(headers.map((h) => ({ header: h, type: classifyHeader(h) })))
  );
  const [saving, setSaving]     = useState(false);
  const [toast, setToast]       = useState(null);

  // Derived groups
  const rmNameCandidates  = cols.filter((c) => c.type === 'rm_name');
  const rmEmailCandidates = cols.filter((c) => c.type === 'rm_email');
  const bhNameCandidates  = cols.filter((c) => c.type === 'bh_name');
  const bhEmailCandidates = cols.filter((c) => c.type === 'bh_email');

  const [rmNameCol,  setRmNameCol]  = useState(rmNameCandidates[0]?.header  || '');
  const [rmEmailCol, setRmEmailCol] = useState(rmEmailCandidates[0]?.header || '');
  const [bhNameCol,  setBhNameCol]  = useState(bhNameCandidates[0]?.header  || '');
  const [bhEmailCol, setBhEmailCol] = useState(bhEmailCandidates[0]?.header || '');

  // All non-routing columns
  const nonRoutingCols = cols.filter((c) =>
    !['rm_name', 'rm_email', 'bh_name', 'bh_email'].includes(c.type)
  );
  const identityCols  = nonRoutingCols.filter((c) => c.type === 'identity');
  const profileCols   = nonRoutingCols.filter((c) => PROFILE_TYPES.includes(c.type));
  const questionCols  = nonRoutingCols.filter((c) =>
    ['rating', 'narrative', 'number', 'date'].includes(c.type)
  );

  function updateType(header, newType) {
    setCols((prev) => prev.map((c) => c.header === header ? { ...c, type: newType } : c));
  }

  function toggleSkipSelf(header) {
    setCols((prev) => prev.map((c) => c.header === header ? { ...c, skipSelf: !c.skipSelf } : c));
  }

  // All possible routing columns (all non-identity for flexible assignment)
  const allColHeaders = cols.map((c) => c.header);

  async function handleCreate() {
    if (!roleKey.trim())       return setToast({ message: 'Template Key is required.', type: 'error' });
    if (!templateName.trim())  return setToast({ message: 'Template Name is required.', type: 'error' });
    if (!questionCols.length)  return setToast({ message: 'No question columns found. Mark some columns as Rating / Narrative / Number / Date.', type: 'error' });

    const questions = questionCols.map((c, i) => ({
      question_key:     c.header,
      question_label:   c.header,
      field_type:       c.type,
      display_order:    i + 1,
      // When self is enabled, ticked rows are skipped from the self form.
      // When self is disabled, the flag is harmless but we still persist false
      // so HR can flip the master switch later without losing per-question intent.
      excludeFromSelf:  !!c.skipSelf,
    }));
    const profileColsData = [...identityCols, ...profileCols].map((c) => ({
      key: c.header, label: c.header, field_type: c.type,
    }));

    setSaving(true);
    try {
      const res = await fetch('/api/admin/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roleKey: roleKey.trim().toUpperCase(),
          roleLabel: templateName.trim(),
          filename,
          questions,
          profileCols: profileColsData,
          rmNameCol:  rmNameCol  || null,
          rmEmailCol: rmEmailCol || null,
          bhNameCol:  bhNameCol  || null,
          bhEmailCol: bhEmailCol || null,
          includeSelf: !!includeSelf,
          // V2 commenter stages
          hrSpocName:  hrStages.hrSpocName  || null,
          hrSpocEmail: hrStages.hrSpocEmail || null,
          hrHeadName:  hrStages.hrHeadName  || null,
          hrHeadEmail: hrStages.hrHeadEmail || null,
          cotoName:    hrStages.cotoName    || null,
          cotoEmail:   hrStages.cotoEmail   || null,
          hrSpocFields: hrStages.hrSpocFields || [],
          hrHeadFields: hrStages.hrHeadFields || [],
          cotoFields:   hrStages.cotoFields   || [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setToast({
        message: `✓ Template "${roleKey.toUpperCase()}" created — ${questions.length} questions, ${profileColsData.length} profile fields.`,
        type: 'success',
      });
      setTimeout(() => onCreated(), 1500);
    } catch (err) {
      setToast({ message: err.message, type: 'error' });
      setSaving(false);
    }
  }

  const routingCols = cols.filter((c) =>
    ['rm_name', 'rm_email', 'bh_name', 'bh_email'].includes(c.type)
  );

  return (
    <div className="space-y-5">
      {/* Template identity */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Template Identity</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Template Name <span className="text-red-500">*</span>
            </label>
            <input value={templateName} onChange={(e) => setTemplateName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            <p className="text-xs text-slate-400 mt-1">Auto-filled from filename — edit as needed</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Template Key (short code) <span className="text-red-500">*</span>
            </label>
            <input value={roleKey} onChange={(e) => setRoleKey(e.target.value.toUpperCase())}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            <p className="text-xs text-slate-400 mt-1">Used in URLs — e.g. COLTS-T, PI, GET</p>
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-3">
          <span className="font-medium text-slate-500">Source file:</span> {filename}
          &nbsp;·&nbsp; <span className="font-medium text-slate-500">Total columns:</span> {headers.length}
          &nbsp;·&nbsp; <span className="font-medium text-slate-500">Questions detected:</span> {questionCols.length}
          &nbsp;·&nbsp; <span className="font-medium text-slate-500">Profile fields:</span> {identityCols.length + profileCols.length}
        </p>

        {/* Self-assessment master switch */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex items-start gap-3">
          <label className="inline-flex items-center cursor-pointer mt-0.5">
            <input
              type="checkbox"
              checked={includeSelf}
              onChange={(e) => setIncludeSelf(e.target.checked)}
              className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
            />
            <span className="ml-2 text-sm font-semibold text-slate-700">Has self-assessment</span>
          </label>
          <div className="text-xs text-slate-400 leading-relaxed">
            When enabled, every assessment launched against this template starts with a self-assessment by the employee
            (using <code className="font-mono bg-slate-50 px-1 rounded">EMP_EMAIL</code> from the Employees file).
            The RM is invited automatically once the self-assessment is submitted.
            By default the self-form asks <strong>every</strong> question — tick <em>"Skip Self"</em> below
            for the few evaluative questions (e.g. Salary Recommendation) that should not be shown to the employee.
          </div>
        </div>

        {/* Pipeline activation summary */}
        <div className="mt-4 pt-4 border-t border-slate-100">
          <ActivationSummary includeSelf={includeSelf} value={hrStages} />
        </div>
      </div>

      {/* V2: HR commenter stages */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <HrStagesEditor value={hrStages} onChange={setHrStages} />
      </div>

      {/* Routing fields */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 mt-0.5">
            <svg className="w-3.5 h-3.5 text-indigo-600" viewBox="0 0 20 20" fill="currentColor">
              <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v1h8v-1zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-1a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v1h-3zM4.75 14.094A5.973 5.973 0 004 17v1H1v-1a3 3 0 013.75-2.906z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-700">Reviewer & Approver Routing Fields</h3>
            <p className="text-xs text-slate-400 mt-0.5">Which columns hold the Reviewer (RM/BM) and Approver (BH) name and email? These are used to send form links.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Reviewer Name column', val: rmNameCol,  set: setRmNameCol },
            { label: 'Reviewer Email column', val: rmEmailCol, set: setRmEmailCol },
            { label: 'Approver Name column',  val: bhNameCol,  set: setBhNameCol },
            { label: 'Approver Email column', val: bhEmailCol, set: setBhEmailCol },
          ].map(({ label, val, set }) => (
            <div key={label}>
              <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
              <select value={val} onChange={(e) => set(e.target.value)}
                className="w-full text-xs rounded-lg border border-slate-300 px-2 py-1.5 focus:border-blue-400 focus:outline-none bg-white">
                <option value="">— not set —</option>
                {allColHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          ))}
        </div>
        {routingCols.length > 0 && (
          <p className="text-xs text-slate-400 mt-3">
            Auto-detected routing columns: {routingCols.map((c) => (
              <span key={c.header} className="inline-flex items-center gap-1 mx-0.5 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 font-mono">{c.header}</span>
            ))}
          </p>
        )}
      </div>

      {/* Profile / Identity fields */}
      {(identityCols.length + profileCols.length) > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
              <svg className="w-3.5 h-3.5 text-slate-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-700">Employee Profile Fields</h3>
              <p className="text-xs text-slate-400 mt-0.5">These columns are stored as employee data — not scored in the assessment form.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[...identityCols, ...profileCols].map((c) => {
              const badge =
                c.type === 'identity'       ? 'bg-slate-200 text-slate-700' :
                c.type === 'profile_date'   ? 'bg-teal-50 text-teal-700 border border-teal-200' :
                c.type === 'profile_number' ? 'bg-orange-50 text-orange-700 border border-orange-200' :
                                              'bg-slate-100 text-slate-500';
              const tag =
                c.type === 'identity'       ? '(id)' :
                c.type === 'profile_date'   ? '(date)' :
                c.type === 'profile_number' ? '(number)' : '(info)';
              return (
                <span key={c.header}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${badge}`}>
                  {c.header}
                  <span className="text-[10px] opacity-60">{tag}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Question columns */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
            <svg className="w-3.5 h-3.5 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
              <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
              <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-700">Assessment Questions ({questionCols.length})</h3>
            <p className="text-xs text-slate-400 mt-0.5">Adjust type if auto-detection is wrong. Move to "Profile / Info" to exclude from assessment.</p>
          </div>
        </div>

        {questionCols.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">No question columns detected. Check the non-routing columns below and change their type.</p>
        ) : (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2.5 text-left text-slate-500 font-semibold w-8">#</th>
                  <th className="px-3 py-2.5 text-left text-slate-500 font-semibold">Column Header (becomes question label)</th>
                  <th className="px-3 py-2.5 text-left text-slate-500 font-semibold w-44">Field Type</th>
                  {includeSelf && (
                    <th className="px-3 py-2.5 text-center text-slate-500 font-semibold w-24" title="Tick to hide from the employee's self-assessment">
                      Skip&nbsp;Self?
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {nonRoutingCols.map((c, i) => {
                  const isQ = ['rating', 'narrative', 'number', 'date'].includes(c.type);
                  if (!isQ) return null;
                  const qNum = questionCols.findIndex((q) => q.header === c.header) + 1;
                  return (
                    <tr key={c.header} className="hover:bg-slate-50/60">
                      <td className="px-3 py-2 text-slate-400">{qNum}</td>
                      <td className="px-3 py-2 text-slate-700 max-w-xs" title={c.header}>
                        <span className="truncate block">{c.header}</span>
                      </td>
                      <td className="px-3 py-2">
                        <select value={c.type}
                          onChange={(e) => updateType(c.header, e.target.value)}
                          className="w-full text-xs rounded border border-slate-200 px-1.5 py-1 focus:border-blue-400 focus:outline-none bg-white">
                          {Q_TYPES.map((t) => <option key={t} value={t}>{Q_LABELS[t]}</option>)}
                        </select>
                      </td>
                      {includeSelf && (
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={!!c.skipSelf}
                            onChange={() => toggleSkipSelf(c.header)}
                            title="Skip this question in the employee's self-assessment"
                            className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                          />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Show profile columns with option to promote to question */}
        {profileCols.length > 0 && (
          <details className="mt-3">
            <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600">
              {profileCols.length} column(s) classified as Profile — click to expand and promote to questions if needed
            </summary>
            <div className="mt-2 border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <tbody className="divide-y divide-slate-100">
                  {profileCols.map((c) => (
                    <tr key={c.header} className="hover:bg-slate-50/60">
                      <td className="px-3 py-2 max-w-xs truncate">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium mr-1 ${Q_BADGE[c.type] || 'bg-slate-100 text-slate-500'}`}>
                          {c.type === 'profile_date' ? 'date' : c.type === 'profile_number' ? 'number' : 'info'}
                        </span>
                        <span className="text-slate-500">{c.header}</span>
                      </td>
                      <td className="px-3 py-2 w-52">
                        <select value={c.type}
                          onChange={(e) => updateType(c.header, e.target.value)}
                          className="w-full text-xs rounded border border-slate-200 px-1.5 py-1 bg-white">
                          {ALL_TYPES.map((t) => <option key={t} value={t}>{Q_LABELS[t]}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button onClick={onBack}
          className="px-4 py-2.5 rounded-lg text-sm font-medium text-slate-600 border border-slate-300 hover:bg-slate-50 transition-all">
          ← Back
        </button>
        <button onClick={handleCreate} disabled={saving}
          className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-all">
          {saving ? 'Creating Template…' : `✓ Create Template (${questionCols.length} questions)`}
        </button>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

// ── Template List ─────────────────────────────────────────────────────────────
function TemplateList({ refreshKey }) {
  const [roles, setRoles]       = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [toast, setToast]       = useState(null);
  const [loading, setLoading]   = useState(true);
  // edits[roleKey] = { includeSelf, questions } — pending unsaved edits
  const [edits, setEdits]       = useState({});
  const [savingKey, setSavingKey] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/templates').then((r) => r.json())
      .then((d) => {
        setRoles(d.roles || []);
        setEdits({});
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load, refreshKey]);

  // Collect the HR-stage fields off a template/edit into the editor's value shape.
  function hrStagesOf(src) {
    return {
      hrSpocName: src.hrSpocName ?? '', hrSpocEmail: src.hrSpocEmail ?? '', hrSpocFields: src.hrSpocFields || [],
      hrHeadName: src.hrHeadName ?? '', hrHeadEmail: src.hrHeadEmail ?? '', hrHeadFields: src.hrHeadFields || [],
      cotoName:   src.cotoName   ?? '', cotoEmail:   src.cotoEmail   ?? '', cotoFields:   src.cotoFields   || [],
    };
  }

  // Pull the current edited view of a template (falls back to original)
  function viewOf(role) {
    const e = edits[role.roleKey];
    return {
      includeSelf: e?.includeSelf ?? !!role.includeSelf,
      questions:   e?.questions   ?? (role.questions || []),
      hrStages:    e?.hrStages    ?? hrStagesOf(role),
    };
  }
  function isDirty(roleKey) { return edits[roleKey] !== undefined; }

  function setRoleEdit(roleKey, patch) {
    setEdits((prev) => {
      const role = roles.find((r) => r.roleKey === roleKey);
      const current = prev[roleKey] || {
        includeSelf: !!role?.includeSelf,
        questions:   role?.questions || [],
        hrStages:    role ? hrStagesOf(role) : {},
      };
      return { ...prev, [roleKey]: { ...current, ...patch } };
    });
  }

  function toggleIncludeSelf(roleKey, next) {
    setRoleEdit(roleKey, { includeSelf: next });
  }
  function toggleQuestionSkipSelf(roleKey, qIdx) {
    const role = roles.find((r) => r.roleKey === roleKey);
    if (!role) return;
    const current = edits[roleKey]?.questions || role.questions || [];
    const updated = current.map((q, i) =>
      i === qIdx ? { ...q, excludeFromSelf: !q.excludeFromSelf } : q
    );
    setRoleEdit(roleKey, { questions: updated });
  }
  function discardEdits(roleKey) {
    setEdits((prev) => {
      const next = { ...prev };
      delete next[roleKey];
      return next;
    });
  }

  async function saveTemplate(role) {
    const view = viewOf(role);
    setSavingKey(role.roleKey);
    try {
      const res = await fetch('/api/admin/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roleKey:     role.roleKey,
          roleLabel:   role.roleLabel,
          questions:   view.questions,
          profileCols: role.profileCols || [],
          rmNameCol:   role.rmNameCol  ?? null,
          rmEmailCol:  role.rmEmailCol ?? null,
          bhNameCol:   role.bhNameCol  ?? null,
          bhEmailCol:  role.bhEmailCol ?? null,
          filename:    role.filename ?? null,
          includeSelf: !!view.includeSelf,
          // V2 commenter stages
          hrSpocName:  view.hrStages.hrSpocName  || null,
          hrSpocEmail: view.hrStages.hrSpocEmail || null,
          hrHeadName:  view.hrStages.hrHeadName  || null,
          hrHeadEmail: view.hrStages.hrHeadEmail || null,
          cotoName:    view.hrStages.cotoName    || null,
          cotoEmail:   view.hrStages.cotoEmail   || null,
          hrSpocFields: view.hrStages.hrSpocFields || [],
          hrHeadFields: view.hrStages.hrHeadFields || [],
          cotoFields:   view.hrStages.cotoFields   || [],
        }),
      });
      let data = {};
      try { data = await res.json(); } catch {}
      if (!res.ok) throw new Error(data.error || `Save failed (HTTP ${res.status})`);
      setToast({ message: `Template "${role.roleKey}" updated.`, type: 'success' });
      discardEdits(role.roleKey);
      load();
    } catch (err) {
      setToast({ message: err.message || 'Save failed', type: 'error' });
    } finally {
      setSavingKey(null);
    }
  }

  async function handleDelete(roleKey, roleLabel) {
    if (!confirm(`Delete template "${roleLabel}" (${roleKey})?\n\nThe template will be hidden from dropdowns and cannot be used for new cycles. Historical reports, employees, and audit logs linked to it are preserved.`))
      return;
    setDeleting(roleKey);
    try {
      const res = await fetch(`/api/admin/templates?key=${encodeURIComponent(roleKey)}`, { method: 'DELETE' });
      let data = {};
      try { data = await res.json(); } catch { /* non-JSON response — keep empty */ }
      if (!res.ok) throw new Error(data.error || `Delete failed (HTTP ${res.status})`);
      setToast({ message: `Template "${roleKey}" deleted.`, type: 'success' });
      load();
    } catch (err) {
      setToast({ message: err.message || 'Delete failed', type: 'error' });
    } finally {
      setDeleting(null);
    }
  }

  const typeBadge = (t) => ({
    rating: 'bg-blue-100 text-blue-700', narrative: 'bg-purple-100 text-purple-700',
    number: 'bg-amber-100 text-amber-700', date: 'bg-green-100 text-green-700',
  }[t] || 'bg-slate-100 text-slate-500');

  if (loading) return (
    <div className="space-y-3">
      {[0,1,2].map((i) => <div key={i} className="h-14 rounded-xl bg-slate-100 animate-pulse" />)}
    </div>
  );

  return (
    <>
      {roles.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <svg className="mx-auto w-12 h-12 text-slate-200 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          <p className="text-sm">No templates yet. Upload your first assessment Excel file.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {roles.map((r) => {
            const view = viewOf(r);
            const dirty = isDirty(r.roleKey);
            return (
            <div key={r.roleKey} className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
              {/* Header row */}
              <div className="px-4 py-3 bg-slate-50">
                {/* Top line: label + action buttons */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800 break-all leading-snug">
                      {r.roleLabel || r.roleKey}
                      {view.includeSelf && (
                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-700 border border-indigo-200 align-middle">
                          + Self
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5 font-mono">{r.roleKey}</p>
                    {r.filename && r.filename !== r.roleLabel && (
                      <p className="text-xs text-slate-400 truncate">{r.filename}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 mt-0.5">
                    <span className="text-xs text-slate-400 whitespace-nowrap">
                      {r.questions?.length ?? 0}q
                    </span>
                    <button onClick={() => setExpanded(expanded === r.roleKey ? null : r.roleKey)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-semibold px-3 py-1.5 rounded-lg border border-blue-200 hover:bg-blue-50 transition-all whitespace-nowrap">
                      {expanded === r.roleKey ? 'Hide' : 'View'}
                    </button>
                    <button
                      onClick={() => handleDelete(r.roleKey, r.roleLabel)}
                      disabled={deleting === r.roleKey}
                      className="text-xs text-red-500 hover:text-red-700 font-semibold px-3 py-1.5 rounded-lg border border-red-200 hover:bg-red-50 transition-all disabled:opacity-40 whitespace-nowrap">
                      {deleting === r.roleKey ? '…' : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Routing info */}
              {expanded === r.roleKey && (
                <div className="px-4 py-3 border-b border-slate-100 bg-indigo-50/50">
                  <p className="text-xs font-semibold text-indigo-700 mb-2">Routing Fields</p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-600">
                    <span><span className="text-slate-400">Reviewer Name:</span> {r.rmNameCol || <em className="text-slate-300">not set</em>}</span>
                    <span><span className="text-slate-400">Reviewer Email:</span> {r.rmEmailCol || <em className="text-slate-300">not set</em>}</span>
                    <span><span className="text-slate-400">Approver Name:</span> {r.bhNameCol || <em className="text-slate-300">not set</em>}</span>
                    <span><span className="text-slate-400">Approver Email:</span> {r.bhEmailCol || <em className="text-slate-300">not set</em>}</span>
                  </div>
                </div>
              )}

              {/* Self-assessment toggle (editable) */}
              {expanded === r.roleKey && (() => {
                const changed = view.includeSelf !== !!r.includeSelf;
                return (
                  <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/40">
                    <label className="inline-flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!view.includeSelf}
                        onChange={(e) => toggleIncludeSelf(r.roleKey, e.target.checked)}
                        className="w-4 h-4 mt-0.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                      />
                      <span>
                        <span className="text-sm font-semibold text-slate-700">Has self-assessment</span>
                        <span className="block text-xs text-slate-400 mt-0.5">
                          When on, every new pair starts with the employee filling a self-assessment.
                          Tick "Skip Self" on individual questions below to hide them from the employee.
                        </span>
                      </span>
                    </label>
                    {changed && (
                      <div className="mt-3 ml-6 rounded-lg bg-amber-50 border border-amber-300 px-3 py-2 text-xs text-amber-900 leading-relaxed">
                        <strong>⚠ Important — this change applies only to NEW pairs.</strong><br />
                        Pairs already launched in any cycle keep the self-assessment setting they had at launch time.
                        For example, an existing pair in <em>PENDING_RM</em> will continue straight to RM (no self step) even after you save this change.
                      </div>
                    )}
                    <div className="mt-3">
                      <ActivationSummary includeSelf={view.includeSelf} value={view.hrStages} />
                    </div>
                  </div>
                );
              })()}

              {/* V2: HR commenter stages (editable) */}
              {expanded === r.roleKey && (
                <div className="px-4 py-4 border-b border-slate-100 bg-slate-50/40">
                  <HrStagesEditor
                    value={view.hrStages}
                    onChange={(next) => setRoleEdit(r.roleKey, { hrStages: next })}
                  />
                </div>
              )}

              {/* Questions table */}
              {expanded === r.roleKey && view.questions?.length > 0 && (
                <div className="overflow-x-auto max-h-72 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-white border-b border-slate-100 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left font-semibold text-slate-500">#</th>
                        <th className="px-4 py-2 text-left font-semibold text-slate-500">Question / Column</th>
                        <th className="px-4 py-2 text-left font-semibold text-slate-500">Type</th>
                        {view.includeSelf && (
                          <th className="px-4 py-2 text-center font-semibold text-slate-500 w-24" title="Tick to hide from the employee's self-assessment">
                            Skip&nbsp;Self?
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {view.questions.map((q, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-4 py-2 text-slate-400">{i + 1}</td>
                          <td className="px-4 py-2 text-slate-700 max-w-sm" title={q.question_label}>
                            <span className="truncate block">{q.question_label}</span>
                          </td>
                          <td className="px-4 py-2">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${typeBadge(q.field_type)}`}>
                              {q.field_type}
                            </span>
                          </td>
                          {view.includeSelf && (
                            <td className="px-4 py-2 text-center">
                              <input
                                type="checkbox"
                                checked={!!q.excludeFromSelf}
                                onChange={() => toggleQuestionSkipSelf(r.roleKey, i)}
                                title="Skip this question in the employee's self-assessment"
                                className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                              />
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Save / Discard bar (only when there are pending edits) */}
              {expanded === r.roleKey && dirty && (
                <div className="px-4 py-3 border-t border-amber-100 bg-amber-50 flex items-center justify-between gap-3">
                  <span className="text-xs text-amber-700">You have unsaved changes for this template.</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => discardEdits(r.roleKey)}
                      disabled={savingKey === r.roleKey}
                      className="text-xs text-slate-600 hover:text-slate-800 font-semibold px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-white transition-all disabled:opacity-40">
                      Discard
                    </button>
                    <button
                      onClick={() => saveTemplate(r)}
                      disabled={savingKey === r.roleKey}
                      className="text-xs text-white font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 transition-all disabled:opacity-40">
                      {savingKey === r.roleKey ? 'Saving…' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function SetupPage({ user }) {
  const [step, setStep]         = useState(1); // 1 = upload, 2 = review
  const [filename, setFilename] = useState('');
  const [headers, setHeaders]   = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);

  function handleParsed(name, hdrs) {
    setFilename(name);
    setHeaders(hdrs);
    setStep(2);
  }

  function handleCreated() {
    setStep(1);
    setFilename('');
    setHeaders([]);
    setRefreshKey((k) => k + 1);
  }

  return (
    <AdminLayout title="Role Templates" user={user}>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 items-start">

        {/* Left: Upload or Review */}
        <div>
          {step === 1 ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-6">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">1</span>
                <h2 className="text-sm font-semibold text-slate-700">Upload Assessment Excel</h2>
              </div>
              <UploadZone onParsed={handleParsed} />
              <div className="mt-6 p-4 bg-slate-50 rounded-xl text-xs text-slate-500 space-y-1.5">
                <p className="font-semibold text-slate-600">What happens automatically:</p>
                <p>• Column headers become assessment questions</p>
                <p>• Routing columns (BM_Name, BH_Name, RM_Email etc.) auto-detected</p>
                <p>• Numbered columns (1. ... 14. ...) become rating questions</p>
                <p>• Profile fields (Qualification, Designation etc.) stored but not scored</p>
                <p>• You can adjust any classification before creating the template</p>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs flex items-center justify-center font-bold">1</span>
                <span className="w-4 h-px bg-slate-300" />
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">2</span>
                <h2 className="text-sm font-semibold text-slate-700">Review Columns & Create Template</h2>
              </div>
              <ReviewPanel
                filename={filename}
                headers={headers}
                onCreated={handleCreated}
                onBack={() => setStep(1)}
              />
            </div>
          )}
        </div>

        {/* Right: Template library */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700">Template Library</h2>
            <span className="text-xs text-slate-400">Click View to see questions</span>
          </div>
          <TemplateList refreshKey={refreshKey} />
        </div>
      </div>
    </AdminLayout>
  );
}

export async function getServerSideProps({ req }) {
  const raw = req.cookies?.pms_session;
  if (!raw) return { redirect: { destination: '/admin/login', permanent: false } };
  try {
    const user = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    return { props: { user } };
  } catch {
    return { redirect: { destination: '/admin/login', permanent: false } };
  }
}
