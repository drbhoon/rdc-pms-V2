/**
 * admin/audit.js
 * Audit Log & Unlock — view all audit events, super admin can unlock pairs.
 */
import { useState, useEffect, useCallback } from 'react';
import AdminLayout from '../../components/AdminLayout';

const ACTION_COLORS = {
  ROW_SELECTED:    'bg-purple-100  text-purple-700  border-purple-200',
  ROW_UNSELECTED:  'bg-slate-100   text-slate-600   border-slate-200',
  SELF_SUBMITTED:  'bg-indigo-100  text-indigo-700  border-indigo-200',
  RM_SUBMITTED:    'bg-blue-100    text-blue-700    border-blue-200',
  BH_ROW_CREATED:  'bg-teal-100    text-teal-700    border-teal-200',
  BH_SUBMITTED:    'bg-green-100   text-green-700   border-green-200',
  ROW_LOCKED:      'bg-red-100     text-red-700     border-red-200',
  ROW_UNLOCKED:    'bg-yellow-100  text-yellow-700  border-yellow-200',
  CYCLE_CREATED:   'bg-indigo-100  text-indigo-700  border-indigo-200',
  PAIR_UNLOCKED:   'bg-orange-100  text-orange-700  border-orange-200',
  PAIR_CREATED:    'bg-sky-100     text-sky-700     border-sky-200',
  INVITE_SENT:     'bg-emerald-100 text-emerald-700 border-emerald-200',
  INVITE_RESENT:   'bg-emerald-100 text-emerald-700 border-emerald-200',
  INVITE_FAILED:   'bg-red-100     text-red-700     border-red-200',
  LOGIN_SUCCESS:   'bg-emerald-100 text-emerald-700 border-emerald-200',
  LOGIN_FAILED:    'bg-amber-100   text-amber-800   border-amber-200',
  LOGIN_RATE_LIMITED: 'bg-red-100     text-red-700     border-red-200',
};

function ActionBadge({ action }) {
  const cls = ACTION_COLORS[action] || 'bg-slate-100 text-slate-600 border-slate-200';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {action}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AuditPage({ user }) {
  const isSuperAdmin = user?.role === 'HR_SUPER_ADMIN';

  // Audit log state
  const [roles, setRoles]         = useState([]);
  const [cycles, setCycles]       = useState([]);
  const [filterRole, setFilterRole]   = useState('');
  const [filterCycle, setFilterCycle] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [entries, setEntries]     = useState([]);
  const [loading, setLoading]     = useState(false);

  // Unlock form state
  const [unlockForm, setUnlockForm] = useState({ pairId: '', reason: '' });
  const [unlocking, setUnlocking]   = useState(false);
  const [unlockResult, setUnlockResult] = useState(null);

  // Prefill pairId from ?pairId= and action filter from ?action= query params
  // (deep-links from Dashboard "HR Action" badge and Cycle Management banner).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const qid = params.get('pairId');
    if (qid) setUnlockForm((f) => ({ ...f, pairId: qid }));
    const qaction = params.get('action');
    if (qaction) setFilterAction(qaction);
  }, []);

  // Load roles
  useEffect(() => {
    fetch('/api/admin/roles')
      .then((r) => r.json())
      .then((d) => setRoles(d.roles || []))
      .catch(console.error);
  }, []);

  // Load cycles when role filter changes
  useEffect(() => {
    if (!filterRole) { setCycles([]); return; }
    fetch(`/api/admin/cycles?roleKey=${encodeURIComponent(filterRole)}`)
      .then((r) => r.json())
      .then((d) => setCycles(d.cycles || []))
      .catch(console.error);
  }, [filterRole]);

  const loadAudit = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterRole)   params.set('roleKey', filterRole);
    if (filterCycle)  params.set('cycle', filterCycle);
    if (filterAction) params.set('action', filterAction);
    fetch(`/api/admin/audit?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => setEntries(d.entries || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [filterRole, filterCycle, filterAction]);

  useEffect(() => { loadAudit(); }, [loadAudit]);

  async function handleUnlock(e) {
    e.preventDefault();
    if (unlockForm.reason.trim().length < 10) {
      return setUnlockResult({ ok: false, message: 'Reason must be at least 10 characters.' });
    }
    setUnlocking(true);
    setUnlockResult(null);
    try {
      const res = await fetch('/api/admin/pairs/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(unlockForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unlock failed');
      setUnlockResult({ ok: true, message: `Pair ${unlockForm.pairId} unlocked successfully. An audit entry has been created.` });
      setUnlockForm({ pairId: '', reason: '' });
      loadAudit();
    } catch (err) {
      setUnlockResult({ ok: false, message: err.message });
    } finally {
      setUnlocking(false);
    }
  }

  // All unique action types from loaded data (for filter dropdown)
  const actionTypes = [...new Set(entries.map((e) => e.action || e.ACTION).filter(Boolean))].sort();

  return (
    <AdminLayout title="Audit &amp; Unlock" user={user}>
      <div className="space-y-6">
        {/* ── Audit log ── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
            <h2 className="text-sm font-semibold text-slate-700 mr-auto">Audit Log</h2>

            {/* Filters */}
            <select
              value={filterRole}
              onChange={(e) => { setFilterRole(e.target.value); setFilterCycle(''); }}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="">All Roles</option>
              {roles.map((r) => (
                <option key={r.roleKey} value={r.roleKey}>{r.roleLabel || r.roleKey}</option>
              ))}
            </select>

            <select
              value={filterCycle}
              onChange={(e) => setFilterCycle(e.target.value)}
              disabled={!filterRole}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
            >
              <option value="">All Cycles</option>
              {cycles.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="">All Actions</option>
              {actionTypes.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>

            <button
              onClick={loadAudit}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-all"
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="px-6 py-12 text-center text-sm text-slate-400">Loading audit entries…</div>
          ) : entries.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-400">No audit entries found for the selected filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {['Timestamp', 'Action', 'Employee', 'Cycle', 'Performed By', 'Details'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {entries.map((e, i) => {
                    const action    = e.action    || e.ACTION;
                    const empCode   = e.empCode   || e.EMP_CODE;
                    const empName   = e.empName   || e.EMP_NAME;
                    const cycle     = e.cycle     || e.CYCLE;
                    const by        = e.performedBy || e.PERFORMED_BY;
                    const details   = e.details   || e.DETAILS;
                    const ts        = e.timestamp || e.TIMESTAMP || e.createdAt;
                    return (
                      <tr key={e.id || i} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-xs font-mono text-slate-500 whitespace-nowrap">
                          {ts ? new Date(ts).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
                        </td>
                        <td className="px-4 py-3"><ActionBadge action={action} /></td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-800 text-xs">{empName || '—'}</div>
                          {empCode && <div className="font-mono text-xs text-slate-400">{empCode}</div>}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">{cycle || '—'}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">{by || '—'}</td>
                        <td className="px-4 py-3 text-xs text-slate-500 max-w-xs truncate" title={details ? JSON.stringify(details) : ''}>{details ? JSON.stringify(details) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="px-6 py-3 border-t border-slate-100 text-xs text-slate-400">
                {entries.length} audit entr{entries.length !== 1 ? 'ies' : 'y'}
              </div>
            </div>
          )}
        </div>

        {/* ── Super Admin Unlock ── */}
        {isSuperAdmin && (
          <div className="bg-white rounded-xl border border-red-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-red-100 bg-red-50">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-red-600" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
                <h2 className="text-sm font-semibold text-red-700">Unlock Assessment (Super Admin Only)</h2>
              </div>
              <p className="text-xs text-red-600 mt-1">
                This action reopens a submitted assessment for editing. All changes are logged.
              </p>
            </div>

            <div className="p-6">
              {unlockResult && (
                <div className={`mb-5 rounded-lg border px-4 py-3 text-sm ${
                  unlockResult.ok
                    ? 'bg-green-50 border-green-200 text-green-700'
                    : 'bg-red-50 border-red-200 text-red-700'
                }`}>
                  {unlockResult.message}
                </div>
              )}

              <form onSubmit={handleUnlock} className="space-y-4 max-w-lg">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Assessment Pair ID <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={unlockForm.pairId}
                    onChange={(e) => setUnlockForm((f) => ({ ...f, pairId: e.target.value }))}
                    required
                    placeholder="e.g. pair_abc123def456"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    The Pair ID is the unique internal identifier for one assessment (one employee × one cycle × one template).
                    It is auto-generated when the cycle is launched and appears in the audit log rows below as well as in
                    Dashboard &rarr; Action &rarr; HR Action. Use it here to unlock a finalised assessment so the RM/BH can edit again.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Reason <span className="text-red-500">*</span>
                    <span className="text-slate-400 font-normal ml-1">(minimum 10 characters)</span>
                  </label>
                  <textarea
                    value={unlockForm.reason}
                    onChange={(e) => setUnlockForm((f) => ({ ...f, reason: e.target.value }))}
                    required
                    minLength={10}
                    rows={3}
                    placeholder="Describe why this assessment needs to be unlocked…"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm resize-none focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                  <p className={`text-xs mt-1 ${unlockForm.reason.length < 10 && unlockForm.reason.length > 0 ? 'text-red-500' : 'text-slate-400'}`}>
                    {unlockForm.reason.length} / 10 characters minimum
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={unlocking || unlockForm.reason.trim().length < 10 || !unlockForm.pairId.trim()}
                  className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {unlocking ? 'Unlocking…' : 'Unlock Assessment'}
                </button>
              </form>
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
