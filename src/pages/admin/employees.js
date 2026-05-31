/**
 * admin/employees.js
 * Employee Management — bulk upload via Excel, view/search employee table.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import AdminLayout from '../../components/AdminLayout';

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ message, type, onClose }) {
  useEffect(() => {
    const id = setTimeout(onClose, 4000);
    return () => clearTimeout(id);
  }, [onClose]);
  const base = 'fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl px-5 py-3.5 shadow-xl text-sm font-medium';
  const cls = type === 'error' ? `${base} bg-red-600 text-white` : `${base} bg-green-600 text-white`;
  return (
    <div className={cls}>
      {type === 'error'
        ? <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
        : <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
      }
      {message}
    </div>
  );
}

// ── Upload section ────────────────────────────────────────────────────────────
function UploadSection({ roles, onUploaded }) {
  const [roleKey, setRoleKey]     = useState('');
  const [rows, setRows]           = useState([]);
  const [fileName, setFileName]   = useState('');
  const [dragging, setDragging]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult]       = useState(null);
  const [toast, setToast]         = useState(null);
  const fileRef = useRef();

  useEffect(() => {
    if (roles.length && !roleKey) setRoleKey(roles[0].roleKey);
  }, [roles, roleKey]);

  function parseFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        // cellDates: true → Excel date serials become JS Date objects (not raw numbers like 45853)
        const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const parsed = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false, dateNF: 'yyyy-mm-dd' });
        // Extra safety: if any Date objects slipped through, convert them to YYYY-MM-DD strings
        const cleaned = parsed.map((row) => {
          const out = {};
          for (const [k, v] of Object.entries(row)) {
            out[k] = v instanceof Date ? v.toISOString().slice(0, 10) : v;
          }
          return out;
        });
        setRows(cleaned);
        setFileName(file.name);
        setResult(null);
      } catch {
        setToast({ message: 'Could not parse Excel file.', type: 'error' });
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }

  async function handleUpload() {
    if (!roleKey) return setToast({ message: 'Please select a role.', type: 'error' });
    if (!rows.length) return setToast({ message: 'Please upload an Excel file first.', type: 'error' });
    setUploading(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/employees/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleKey, rows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setResult(data);
      setToast({ message: `${data.upserted ?? rows.length} records uploaded/updated.`, type: 'success' });
      onUploaded(roleKey);
    } catch (err) {
      setToast({ message: err.message, type: 'error' });
    } finally {
      setUploading(false);
    }
  }

  const preview = rows.slice(0, 10);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <h2 className="text-sm font-semibold text-slate-700 mb-5">Upload Employee Excel</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Role <span className="text-red-500">*</span></label>
          <select
            value={roleKey}
            onChange={(e) => setRoleKey(e.target.value)}
            className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            {roles.map((r) => (
              <option key={r.roleKey} value={r.roleKey}>{r.roleLabel || r.roleKey}</option>
            ))}
          </select>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`rounded-xl border-2 border-dashed px-6 py-8 text-center cursor-pointer transition-all ${
            dragging ? 'border-blue-400 bg-blue-50' : 'border-slate-300 hover:border-blue-400 hover:bg-blue-50/40'
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => e.target.files[0] && parseFile(e.target.files[0])}
          />
          <svg className="mx-auto w-8 h-8 text-slate-400 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.338-2.32 5.75 5.75 0 011.091 11.096H6.75z" />
          </svg>
          {fileName ? (
            <p className="text-sm font-medium text-blue-600">{fileName} — {rows.length} rows</p>
          ) : (
            <>
              <p className="text-sm font-medium text-slate-600">Drop Excel file here or <span className="text-blue-600">browse</span></p>
              <p className="text-xs text-slate-400 mt-1">Supports .xlsx and .xls</p>
            </>
          )}
        </div>
        <p className="text-xs text-slate-400">
          Required columns: <code className="bg-slate-100 px-1 rounded">EMP_CODE</code> | <code className="bg-slate-100 px-1 rounded">EMP_NAME</code> — all other columns stored as profile data.
        </p>

        {/* Preview */}
        {preview.length > 0 && (
          <div>
            <p className="text-xs font-medium text-slate-600 mb-1">Preview (first {preview.length} of {rows.length} rows)</p>
            <div className="overflow-x-auto max-h-52 border border-slate-200 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    {Object.keys(preview[0]).map((k) => (
                      <th key={k} className="px-3 py-2 text-left font-semibold text-slate-500 border-b border-slate-200 whitespace-nowrap">{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      {Object.values(row).map((v, j) => (
                        <td key={j} className="px-3 py-2 text-slate-700 whitespace-nowrap">{String(v)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {result && (
          <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
            Successfully processed: <strong>{result.upserted ?? rows.length}</strong> records uploaded / updated.
            {result.empEmailColumn ? (
              <span className="block text-xs mt-1 text-emerald-600">
                ✓ EMP_EMAIL captured (column &ldquo;{result.empEmailColumn}&rdquo;) — {result.withEmailCount ?? 0} of {result.upserted ?? rows.length} rows have an email.
              </span>
            ) : (
              <span className="block text-xs mt-1 text-amber-600">
                ⚠ No EMP_EMAIL column detected. Self-assessment invites won&rsquo;t fire for these employees until you re-upload with an EMP_EMAIL column.
              </span>
            )}
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={uploading || !rows.length}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
        >
          {uploading ? 'Uploading…' : 'Upload Employees'}
        </button>
      </div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

// ── Employee table ────────────────────────────────────────────────────────────
function EmployeeTable({ roles, triggerRoleKey, user }) {
  const [roleKey, setRoleKey]       = useState('');
  const [employees, setEmployees]   = useState([]);
  const [search, setSearch]         = useState('');
  const [loading, setLoading]       = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [acting, setActing]         = useState(null); // empCode being acted on
  const [toast, setToast]           = useState(null);

  const isSuperAdmin = user?.role === 'HR_SUPER_ADMIN';

  useEffect(() => {
    if (roles.length && !roleKey) setRoleKey(roles[0].roleKey);
  }, [roles, roleKey]);

  useEffect(() => {
    if (triggerRoleKey) setRoleKey(triggerRoleKey);
  }, [triggerRoleKey]);

  const loadEmployees = useCallback(() => {
    if (!roleKey) return;
    setLoading(true);
    const url = showArchived
      ? `/api/admin/employees?roleKey=${encodeURIComponent(roleKey)}&archived=1`
      : `/api/admin/employees?roleKey=${encodeURIComponent(roleKey)}`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => setEmployees(d.employees || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [roleKey, showArchived]);

  useEffect(() => { loadEmployees(); }, [loadEmployees]);

  async function handleAction(action, emp) {
    const labels = { archive: 'Archive', restore: 'Restore', delete: 'Permanently Delete' };
    const warns  = {
      archive: `Archive ${emp.empName} (${emp.empCode})?\n\nThis will hide them from active cycles. Their assessment history is preserved and can be viewed in Reports > Archived.`,
      restore: `Restore ${emp.empName} (${emp.empCode}) to active?`,
      delete:  `PERMANENTLY DELETE ${emp.empName} (${emp.empCode})?\n\nThis will erase:\n• The employee record\n• ALL their assessment pairs (all cycles)\n• All audit log entries\n\nThis CANNOT be undone. Reports for this employee will no longer be available.`,
    };
    if (!confirm(warns[action])) return;

    setActing(emp.empCode);
    try {
      const res = await fetch('/api/admin/employees/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, empCode: emp.empCode, roleKey, empName: emp.empName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `${labels[action]} failed`);
      setToast({ message: data.message, type: 'success' });
      loadEmployees();
    } catch (err) {
      setToast({ message: err.message, type: 'error' });
    } finally {
      setActing(null);
    }
  }

  const filtered = employees.filter((e) => {
    const q = search.toLowerCase();
    return (
      (e.empCode || '').toLowerCase().includes(q) ||
      (e.empName || '').toLowerCase().includes(q)
    );
  });

  // Show up to 3 columns from profileData (skip routing email columns)
  const profileKeys = employees.length
    ? Object.keys(employees[0]?.profileData || {})
        .filter((k) => !/e?mail/i.test(k))
        .slice(0, 3)
    : [];

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold text-slate-700 mr-auto">Employees</h2>

        {/* Active / Archived toggle */}
        <div className="flex rounded-lg border border-slate-300 overflow-hidden text-sm">
          <button
            onClick={() => setShowArchived(false)}
            className={`px-3 py-1.5 font-medium transition-all ${!showArchived ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
          >Active</button>
          <button
            onClick={() => setShowArchived(true)}
            className={`px-3 py-1.5 font-medium transition-all ${showArchived ? 'bg-amber-500 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
          >Archived</button>
        </div>

        <select
          value={roleKey}
          onChange={(e) => setRoleKey(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          {roles.map((r) => (
            <option key={r.roleKey} value={r.roleKey}>{r.roleLabel || r.roleKey}</option>
          ))}
        </select>

        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or code…"
            className="pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 w-52"
          />
        </div>

        <button onClick={loadEmployees} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-all">
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="px-6 py-12 text-center text-sm text-slate-400">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="px-6 py-12 text-center text-sm text-slate-400">
          {search
            ? 'No employees match your search.'
            : showArchived
              ? 'No archived employees for this role.'
              : 'No active employees for this role. Upload some above.'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Emp Code</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide" title="From EMP_EMAIL column — used for self-assessment invites">Email</th>
                {profileKeys.map((k) => (
                  <th key={k} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{k}</th>
                ))}
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((emp) => {
                const busy = acting === emp.empCode;
                return (
                  <tr key={emp.id || emp.empCode} className={`transition-colors ${showArchived ? 'bg-amber-50/30 hover:bg-amber-50' : 'hover:bg-slate-50'}`}>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{emp.empCode}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{emp.empName}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 max-w-[200px] truncate" title={emp.email || ''}>
                      {emp.email
                        ? <a href={`mailto:${emp.email}`} className="text-blue-600 hover:underline">{emp.email}</a>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    {profileKeys.map((k) => (
                      <td key={k} className="px-4 py-3 text-xs text-slate-500 max-w-[160px] truncate">{String(emp.profileData?.[k] ?? '—')}</td>
                    ))}
                    <td className="px-4 py-3">
                      {showArchived
                        ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700 border border-amber-200">Archived</span>
                        : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 border border-green-200">Active</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {showArchived ? (
                          /* ── Archived view: Restore + Delete (Super Admin) ── */
                          <>
                            <button
                              onClick={() => handleAction('restore', emp)}
                              disabled={busy}
                              className="text-xs font-medium px-2.5 py-1 rounded-lg border border-green-300 text-green-700 hover:bg-green-50 disabled:opacity-40 transition-all whitespace-nowrap"
                            >{busy ? '…' : 'Restore'}</button>
                            {isSuperAdmin && (
                              <button
                                onClick={() => handleAction('delete', emp)}
                                disabled={busy}
                                className="text-xs font-medium px-2.5 py-1 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-40 transition-all whitespace-nowrap"
                              >{busy ? '…' : 'Delete'}</button>
                            )}
                          </>
                        ) : (
                          /* ── Active view: Archive + Delete (Super Admin) ── */
                          <>
                            <button
                              onClick={() => handleAction('archive', emp)}
                              disabled={busy}
                              className="text-xs font-medium px-2.5 py-1 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-40 transition-all whitespace-nowrap"
                            >{busy ? '…' : 'Archive'}</button>
                            {isSuperAdmin && (
                              <button
                                onClick={() => handleAction('delete', emp)}
                                disabled={busy}
                                className="text-xs font-medium px-2.5 py-1 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-40 transition-all whitespace-nowrap"
                              >{busy ? '…' : 'Delete'}</button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-6 py-3 border-t border-slate-100 text-xs text-slate-400">
            Showing {filtered.length} of {employees.length} {showArchived ? 'archived' : 'active'} employees
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function EmployeesPage({ user }) {
  const [roles, setRoles]                     = useState([]);
  const [uploadedRoleKey, setUploadedRoleKey] = useState(null);

  useEffect(() => {
    fetch('/api/admin/roles')
      .then((r) => r.json())
      .then((d) => setRoles(d.roles || []))
      .catch(console.error);
  }, []);

  return (
    <AdminLayout title="Employees" user={user}>
      <div className="space-y-6">
        <UploadSection roles={roles} onUploaded={setUploadedRoleKey} />
        <EmployeeTable roles={roles} triggerRoleKey={uploadedRoleKey} user={user} />
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
