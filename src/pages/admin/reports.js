/**
 * admin/reports.js
 * Assessment Reports — filter by role/cycle, download Excel.
 */
import { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import AdminLayout from '../../components/AdminLayout';

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    PENDING_SELF:      { label: 'Awaiting Self',    cls: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
    PENDING_RM:        { label: 'Awaiting RM',      cls: 'bg-orange-100 text-orange-700 border-orange-200' },
    RM_SUBMITTED:      { label: 'Awaiting BH',      cls: 'bg-purple-100 text-purple-700 border-purple-200' },
    BH_SUBMITTED:      { label: 'Awaiting HR-SPOC', cls: 'bg-teal-100   text-teal-700   border-teal-200'   },
    HR_SPOC_SUBMITTED: { label: 'Awaiting HR-HEAD', cls: 'bg-violet-100 text-violet-700 border-violet-200' },
    HR_HEAD_SUBMITTED: { label: 'Awaiting COTO',    cls: 'bg-rose-100   text-rose-700   border-rose-200'   },
    FINALIZED:         { label: '✓ Finalised',      cls: 'bg-green-100  text-green-700  border-green-200'  },
  };
  const { label, cls } = map[status] || { label: status || '—', cls: 'bg-slate-100 text-slate-500 border-slate-200' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {label}
    </span>
  );
}

// ── Excel export ──────────────────────────────────────────────────────────────
// Layout: each employee gets up to THREE rows stacked vertically — Self (only
// if requireSelf=true), then RM, then BH. Identity columns (Sr No, Emp Code,
// Name, profile cols, RM Name, BH Name, Status) are repeated on every row so
// HR can filter / sort without losing context. The Reviewer column ("SELF" /
// "RM" / "BH") distinguishes them. Self answers are blank for questions
// flagged excludeFromSelf=true.
function downloadExcel(roleLabel, cycle, questions, profileCols, rows) {

  const profileHeaders = profileCols.map((c) => c.label);
  const headers = [
    'Sr No',
    'Emp Code',
    'Employee Name',
    'RM Name',
    'BH Name',
    ...profileHeaders,
    'RM Email',
    'BH Email',
    'Status',
    'Reviewer',                      // RM | BH — distinguishes the two rows
    ...questions.map((q) => q.label),
    'Submitted On',
  ];

  const dataRows = [];
  rows.forEach((r, idx) => {
    const sr      = idx + 1;
    const profile = profileCols.map((c) => {
      const v = r.profileData?.[c.key];
      return v === undefined || v === null ? '' : v;
    });
    // Self answers — blank for excludeFromSelf questions.
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

    // SELF row first (only if this pair was launched with requireSelf=true)
    if (r.requireSelf) {
      dataRows.push([
        sr,
        r.empCode,
        r.empName,
        r.rmName, r.bhName,
        ...profile,
        r.rmEmail, r.bhEmail,
        r.status,
        'SELF',
        ...selfAns,
        r.selfSubmittedOn ? new Date(r.selfSubmittedOn).toLocaleString('en-IN') : '',
      ]);
    }
    // RM row
    dataRows.push([
      sr,
      r.empCode,
      r.empName,
      r.rmName, r.bhName,
      ...profile,
      r.rmEmail, r.bhEmail,
      r.status,
      'RM',
      ...rmAns,
      r.rmSubmittedOn ? new Date(r.rmSubmittedOn).toLocaleString('en-IN') : '',
    ]);
    // BH row directly below
    dataRows.push([
      sr,
      r.empCode,
      r.empName,
      r.rmName, r.bhName,
      ...profile,
      r.rmEmail, r.bhEmail,
      r.status,
      'BH',
      ...bhAns,
      r.bhSubmittedOn ? new Date(r.bhSubmittedOn).toLocaleString('en-IN') : '',
    ]);
  });

  const wsData = [headers, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Column widths — Sr No narrow, identity wider, questions roomy
  ws['!cols'] = headers.map((h) => {
    const lower = String(h).toLowerCase();
    if (lower === 'sr no') return { wch: 6 };
    if (lower === 'reviewer') return { wch: 10 };
    if (lower === 'emp code') return { wch: 12 };
    if (lower === 'status') return { wch: 14 };
    if (lower === 'employee name' || lower === 'rm name' || lower === 'bh name') return { wch: 24 };
    if (lower === 'rm email' || lower === 'bh email') return { wch: 28 };
    if (lower === 'submitted on') return { wch: 20 };
    return { wch: 30 };
  });

  // Freeze header row + first 5 columns (Sr No, Emp Code, Name, RM Name, BH Name)
  ws['!freeze'] = { xSplit: 5, ySplit: 1 };

  // Bold header row
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
    if (cell) cell.s = { font: { bold: true } };
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Assessment Report');

  const suffix = cycle || 'archived';
  const filename = `${roleLabel.replace(/\s+/g, '_')}_${suffix}_report.xlsx`;
  XLSX.writeFile(wb, filename);
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ReportsPage({ user }) {
  const [tab, setTab]       = useState('active'); // 'active' | 'archived'
  const [roles, setRoles]   = useState([]);
  const [cycles, setCycles] = useState([]);
  const [roleKey, setRoleKey] = useState('');
  const [cycle, setCycle]     = useState('');
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Load roles
  useEffect(() => {
    fetch('/api/admin/roles')
      .then((r) => r.json())
      .then((d) => setRoles(d.roles || []))
      .catch(console.error);
  }, []);

  // Reset data when tab changes
  useEffect(() => { setData(null); setCycle(''); }, [tab]);

  // Load cycles when role changes (only for active tab)
  useEffect(() => {
    if (!roleKey) { setCycles([]); setCycle(''); setData(null); return; }
    if (tab === 'active') {
      fetch(`/api/admin/cycles?roleKey=${encodeURIComponent(roleKey)}`)
        .then((r) => r.json())
        .then((d) => setCycles(d.cycles || []))
        .catch(console.error);
    }
    setCycle('');
    setData(null);
  }, [roleKey, tab]);

  const loadReport = useCallback(() => {
    if (!roleKey) return;
    if (tab === 'active' && !cycle) return;
    setLoading(true);
    const params = new URLSearchParams({ roleKey });
    if (tab === 'archived') {
      params.set('archived', '1');
      if (cycle) params.set('cycle', cycle);
    } else {
      params.set('cycle', cycle);
    }
    fetch(`/api/admin/reports?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [roleKey, cycle, tab]);

  useEffect(() => { loadReport(); }, [loadReport]);

  function handleExport() {
    if (!data) return;
    setExporting(true);
    try {
      downloadExcel(data.role.roleLabel, cycle || (tab === 'archived' ? 'Archived' : ''), data.questions, data.profileCols || [], data.rows);
    } catch (err) {
      alert('Export failed: ' + err.message);
    } finally {
      setExporting(false);
    }
  }

  const rows         = data?.rows || [];
  const questions    = data?.questions || [];
  const profileCols  = data?.profileCols || [];

  const summary = tab === 'active'
    ? {
        total:     rows.length,
        self:      rows.filter((r) => r.status === 'PENDING_SELF').length,
        pending:   rows.filter((r) => r.status === 'PENDING_RM').length,
        submitted: rows.filter((r) => r.status === 'RM_SUBMITTED').length,
        finalized: rows.filter((r) => r.status === 'FINALIZED').length,
      }
    : {
        total:     rows.length,
        cycles:    [...new Set(rows.map((r) => r.cycle))].length,
      };

  return (
    <AdminLayout title="Reports" user={user}>
      <div className="space-y-6">

        {/* ── Tab bar ── */}
        <div className="flex gap-1 bg-white rounded-xl border border-slate-200 shadow-sm p-1 w-fit">
          <button
            onClick={() => setTab('active')}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${tab === 'active' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}
          >Active Assessments</button>
          <button
            onClick={() => setTab('archived')}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${tab === 'archived' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}
          >Archived</button>
        </div>

        {/* ── Filters + Export ── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-6 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-slate-700 mr-1">Filter</span>

            <select
              value={roleKey}
              onChange={(e) => setRoleKey(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="">Select Template</option>
              {roles.map((r) => (
                <option key={r.roleKey} value={r.roleKey}>{r.roleLabel || r.roleKey}</option>
              ))}
            </select>

            {/* Cycle selector — only for active tab */}
            {tab === 'active' && (
              <select
                value={cycle}
                onChange={(e) => setCycle(e.target.value)}
                disabled={!roleKey || cycles.length === 0}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
              >
                <option value="">Select Cycle</option>
                {cycles.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}

            {/* Cycle filter for archived (optional) */}
            {tab === 'archived' && cycles.length > 0 && (
              <select
                value={cycle}
                onChange={(e) => setCycle(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">All Cycles</option>
                {cycles.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}

            {data && rows.length > 0 && (
              <button
                onClick={handleExport}
                disabled={exporting}
                className="ml-auto flex items-center gap-2 rounded-lg bg-green-600 hover:bg-green-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 transition-all"
              >
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                {exporting ? 'Exporting…' : 'Download Excel'}
              </button>
            )}
          </div>
        </div>

        {/* ── Summary cards ── */}
        {data && (() => {
          const cards = tab === 'active'
            ? [
                { label: 'Total',         value: summary.total,     cls: 'text-slate-700'  },
                { label: 'Awaiting Self', value: summary.self,      cls: 'text-indigo-600' },
                { label: 'Awaiting RM',   value: summary.pending,   cls: 'text-orange-600' },
                { label: 'Awaiting BH',   value: summary.submitted, cls: 'text-purple-600' },
                { label: 'Finalised',     value: summary.finalized, cls: 'text-green-600'  },
              ]
            : [
                { label: 'Archived Records', value: summary.total,  cls: 'text-amber-600' },
                { label: 'Cycles Covered',   value: summary.cycles, cls: 'text-slate-700' },
              ];
          return (
            <div className={`grid gap-4 ${tab === 'active' ? 'grid-cols-2 sm:grid-cols-5' : 'grid-cols-2'}`}>
              {cards.map(({ label, value, cls }) => (
                <div key={label} className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4">
                  <div className={`text-2xl font-bold ${cls}`}>{value}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{label}</div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* ── Table ── */}
        {loading ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-6 py-12 text-center text-sm text-slate-400">
            Loading report…
          </div>
        ) : !roleKey || (tab === 'active' && !cycle) ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-6 py-12 text-center text-sm text-slate-400">
            {tab === 'active' ? 'Select a template and cycle to view the report.' : 'Select a template to view archived assessments.'}
          </div>
        ) : rows.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-6 py-12 text-center text-sm text-slate-400">
            {tab === 'archived' ? 'No archived assessments for this role.' : 'No assessments found for this cycle.'}
          </div>
        ) : (
          <div className={`bg-white rounded-xl border shadow-sm overflow-hidden ${tab === 'archived' ? 'border-amber-200' : 'border-slate-200'}`}>
            {tab === 'archived' && (
              <div className="px-6 py-3 bg-amber-50 border-b border-amber-100 text-xs text-amber-700 font-medium">
                Archived assessments — read-only history
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className={`border-b ${tab === 'archived' ? 'bg-amber-50/50 border-amber-100' : 'bg-slate-50 border-slate-100'}`}>
                    <th className="px-3 py-3 text-left font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap w-12">Sr No.</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap min-w-[200px]">Employee</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap min-w-[220px]">RM / BH</th>
                    {profileCols.map((c) => (
                      <th key={`ph-${c.key}`} className="px-3 py-3 text-left font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap" title={c.label}>
                        <div className="truncate max-w-[140px]">{c.label}</div>
                      </th>
                    ))}
                    <th className="px-4 py-3 text-left font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                      {tab === 'archived' ? 'Cycle / Archived' : 'Status'}
                    </th>
                    {questions.map((q) => (
                      <th key={q.key} className="px-3 py-3 text-left font-semibold text-slate-500 uppercase tracking-wide min-w-[100px]" title={q.label}>
                        <div className="truncate max-w-[120px]">{q.label}</div>
                        <div className="text-[10px] font-normal text-slate-400 normal-case mt-0.5">Self → RM → BH</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row, idx) => (
                    <tr key={row.pairId} className={`transition-colors ${tab === 'archived' ? 'hover:bg-amber-50/40' : 'hover:bg-slate-50'}`}>
                      <td className="px-3 py-4 align-top text-slate-500 font-medium tabular-nums">{idx + 1}</td>
                      <td className="px-4 py-4 align-top min-w-[200px]">
                        <div className="font-medium text-slate-800 text-sm leading-snug break-words">{row.empName}</div>
                        <div className="font-mono text-slate-400 mt-1">{row.empCode}</div>
                      </td>
                      <td className="px-4 py-4 align-top min-w-[220px]">
                        <div className="text-slate-700 text-sm leading-snug break-words">
                          <span className="text-[10px] uppercase tracking-wide text-slate-400 mr-1">RM</span>
                          {row.rmName || '—'}
                        </div>
                        <div className="text-slate-500 text-sm leading-snug break-words mt-1.5">
                          <span className="text-[10px] uppercase tracking-wide text-slate-400 mr-1">BH</span>
                          {row.bhName || '—'}
                        </div>
                      </td>
                      {profileCols.map((c) => {
                        const v = row.profileData?.[c.key];
                        const isEmpty = v === undefined || v === null || v === '';
                        return (
                          <td key={`pc-${row.pairId}-${c.key}`} className="px-3 py-3 text-slate-600 whitespace-nowrap" title={!isEmpty ? String(v) : ''}>
                            {isEmpty ? <span className="text-slate-300">—</span> : <span className="truncate block max-w-[160px]">{String(v)}</span>}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3">
                        {tab === 'archived' ? (
                          <>
                            <div className="font-medium text-slate-700">{row.cycle || '—'}</div>
                            <div className="text-slate-400 text-[10px] mt-0.5">
                              {row.archivedOn ? new Date(row.archivedOn).toLocaleDateString('en-IN') : '—'}
                            </div>
                          </>
                        ) : (
                          <>
                            <StatusBadge status={row.status} />
                            {row.lockStatus === 'LOCKED' && (
                              <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
                                Locked
                              </span>
                            )}
                          </>
                        )}
                      </td>
                      {questions.map((q) => {
                        const selfVal = row.selfAnswers?.[q.key];
                        const rmVal   = row.rmAnswers?.[q.key];
                        const bhVal   = row.bhAnswers?.[q.key];
                        const hasSelf = selfVal !== undefined && selfVal !== null && selfVal !== '';
                        const hasRm   = rmVal   !== undefined && rmVal   !== null && rmVal   !== '';
                        const hasBh   = bhVal   !== undefined && bhVal   !== null && bhVal   !== '';
                        const showSelfRow = row.requireSelf && !q.excludeFromSelf;
                        return (
                          <td key={q.key} className="px-3 py-3 align-top">
                            {showSelfRow && (
                              hasSelf ? (
                                <div className="text-indigo-700 font-medium">{String(selfVal)}</div>
                              ) : (
                                <div className="text-slate-300 text-[10px]">—</div>
                              )
                            )}
                            {hasRm ? (
                              <div className="text-blue-700 font-medium">{String(rmVal)}</div>
                            ) : (
                              <div className="text-slate-300">—</div>
                            )}
                            {hasBh ? (
                              <div className="text-green-700 font-medium">{String(bhVal)}</div>
                            ) : (
                              <div className="text-slate-300 text-[10px]">—</div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-6 py-3 border-t border-slate-100 text-xs text-slate-400">
                {rows.length} assessment{rows.length !== 1 ? 's' : ''}
                {' · '}
                <span className="text-indigo-600">Indigo = Self</span>
                {' · '}
                <span className="text-blue-600">Blue = RM</span>
                {' · '}
                <span className="text-green-600">Green = BH</span>
              </div>
            </div>
          </div>
        )}
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
