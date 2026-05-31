/**
 * admin/index.js
 * HR Admin Dashboard — stats, selectors, assessment pairs table with auto-refresh.
 */
import { useState, useEffect, useCallback } from 'react';
import AdminLayout from '../../components/AdminLayout';

// ── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    PENDING_SELF:      { label: 'Awaiting Self',    cls: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
    PENDING_RM:        { label: 'Awaiting RM',      cls: 'bg-orange-100 text-orange-700 border-orange-200' },
    RM_SUBMITTED:      { label: 'Awaiting BH',      cls: 'bg-purple-100 text-purple-700 border-purple-200' },
    PENDING_BH:        { label: 'Awaiting BH',      cls: 'bg-purple-100 text-purple-700 border-purple-200' },
    BH_SUBMITTED:      { label: 'Awaiting HR-SPOC', cls: 'bg-teal-100   text-teal-700   border-teal-200'   },
    HR_SPOC_SUBMITTED: { label: 'Awaiting HR-HEAD', cls: 'bg-violet-100 text-violet-700 border-violet-200' },
    HR_HEAD_SUBMITTED: { label: 'Awaiting COTO',    cls: 'bg-rose-100   text-rose-700   border-rose-200'   },
    FINALIZED:         { label: '✓ Finalised',      cls: 'bg-green-100  text-green-700  border-green-200'  },
  };
  const { label, cls } = map[status] || { label: status, cls: 'bg-slate-100 text-slate-600 border-slate-200' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {label}
    </span>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, borderColor, textColor }) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm pl-5 pr-6 py-5 border-l-4 ${borderColor} flex items-center gap-4`}>
      <div>
        <div className={`text-3xl font-bold ${textColor}`}>{value ?? '—'}</div>
        <div className="text-xs text-slate-500 mt-0.5 font-medium">{label}</div>
      </div>
    </div>
  );
}

// ── Copy-to-clipboard icon button ─────────────────────────────────────────────
function CopyButton({ text, label }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }
  return (
    <button
      onClick={handleCopy}
      title={`Copy ${label} link`}
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 transition-all"
    >
      {copied ? (
        <svg className="w-3.5 h-3.5 text-green-600" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
          <path d="M8 2a1 1 0 000 2h2a1 1 0 100-2H8z" />
          <path d="M3 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v6h-4.586l1.293-1.293a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L10.414 13H15v3a2 2 0 01-2 2H5a2 2 0 01-2-2V5z" />
        </svg>
      )}
      {copied ? 'Copied' : label}
    </button>
  );
}

// ── Reset-all-data modal (super-admin only — testing helper) ─────────────────
function ResetAllModal({ onClose, onDone }) {
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState('');
  const [result, setResult]   = useState(null);
  const REQUIRED = 'WIPE ALL DATA';

  async function go() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/admin/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: REQUIRED }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Reset failed (HTTP ${res.status})`);
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center px-4">
      <div className="bg-white max-w-lg w-full rounded-2xl shadow-2xl border-2 border-red-300 overflow-hidden">
        <div className="bg-red-600 text-white px-6 py-4 flex items-center gap-3">
          <svg className="w-6 h-6 shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <h2 className="text-lg font-bold">Wipe ALL Test Data</h2>
        </div>

        <div className="px-6 py-5 space-y-4">
          {result ? (
            <div className="space-y-3">
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
                <div className="font-semibold mb-1">Database wiped successfully.</div>
                <div className="text-xs leading-relaxed">
                  Deleted {result.before?.auditLog ?? 0} audit rows · {result.before?.assessmentPair ?? 0} pairs · {' '}
                  {result.before?.reviewerLink ?? 0} reviewer links · {result.before?.employee ?? 0} employees · {' '}
                  {result.before?.roleTemplate ?? 0} templates.
                </div>
                <div className="text-xs mt-2 text-emerald-700">
                  Preserved: {result.preserved?.hrUser ?? 0} HR user(s) — you stay logged in.
                </div>
              </div>
              <button onClick={() => { onDone(); onClose(); }}
                className="w-full rounded-lg bg-slate-800 hover:bg-slate-900 text-white px-4 py-2.5 text-sm font-semibold">
                Reload Dashboard
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-700 leading-relaxed">
                This permanently deletes <strong>everything</strong> in the database except your HR user accounts:
              </p>
              <ul className="text-xs text-slate-600 space-y-1 pl-5 list-disc">
                <li>All assessment pairs (every cycle, every status, including Finalised)</li>
                <li>All employees uploaded to any template</li>
                <li>All role templates</li>
                <li>All reviewer links and audit log entries</li>
              </ul>
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                This action cannot be undone. Use only during the testing phase.
              </p>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Type <code className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-red-700">{REQUIRED}</code> to confirm:
                </label>
                <input
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoFocus
                  placeholder={REQUIRED}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
                />
              </div>
              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div>
              )}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button onClick={onClose} disabled={busy}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                  Cancel
                </button>
                <button
                  onClick={go}
                  disabled={busy || confirm !== REQUIRED}
                  className="rounded-lg bg-red-600 hover:bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed">
                  {busy ? 'Wiping…' : 'Wipe ALL Data'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function DashboardPage({ user }) {
  const [roles, setRoles]         = useState([]);
  const [cycles, setCycles]       = useState([]);
  const [roleKey, setRoleKey]     = useState('');
  const [cycle, setCycle]         = useState('');
  const [stats, setStats]         = useState(null);
  const [pairs, setPairs]         = useState([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [loadingPairs, setLoadingPairs] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);

  // Load roles once
  useEffect(() => {
    fetch('/api/admin/roles')
      .then((r) => r.json())
      .then((d) => {
        setRoles(d.roles || []);
        if (d.roles?.length) setRoleKey(d.roles[0].roleKey);
      })
      .catch(console.error);
  }, []);

  // Load cycles when role changes
  useEffect(() => {
    if (!roleKey) return;
    setCycle('');
    fetch(`/api/admin/cycles?roleKey=${encodeURIComponent(roleKey)}`)
      .then((r) => r.json())
      .then((d) => {
        setCycles(d.cycles || []);
        if (d.cycles?.length) setCycle(d.cycles[0]);
      })
      .catch(console.error);
  }, [roleKey]);

  // Load stats + pairs
  const loadData = useCallback(() => {
    if (!roleKey || !cycle) return;
    setLoadingStats(true);
    setLoadingPairs(true);

    const qs = `roleKey=${encodeURIComponent(roleKey)}&cycle=${encodeURIComponent(cycle)}`;

    fetch(`/api/admin/stats?${qs}`)
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch(console.error)
      .finally(() => setLoadingStats(false));

    fetch(`/api/admin/pairs?${qs}`)
      .then((r) => r.json())
      .then((d) => setPairs(d.pairs || []))
      .catch(console.error)
      .finally(() => setLoadingPairs(false));
  }, [roleKey, cycle]);

  useEffect(() => {
    loadData();
    const id = setInterval(loadData, 30000);
    return () => clearInterval(id);
  }, [loadData]);

  const host = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <AdminLayout title="Dashboard" user={user}>
      {/* ── Selectors ── */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-600 whitespace-nowrap">Role</label>
          <select
            value={roleKey}
            onChange={(e) => setRoleKey(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 min-w-[160px]"
          >
            {roles.map((r) => (
              <option key={r.roleKey} value={r.roleKey}>{r.roleLabel || r.roleKey}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-600 whitespace-nowrap">Cycle</label>
          <select
            value={cycle}
            onChange={(e) => setCycle(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 min-w-[160px]"
          >
            {cycles.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {user?.role === 'HR_SUPER_ADMIN' && (
            <button
              onClick={() => setShowResetModal(true)}
              title="Wipe all test data — destructive, super admin only"
              className="rounded-lg border-2 border-red-300 bg-red-50 hover:bg-red-100 px-3 py-1.5 text-xs font-bold text-red-700 transition-all flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              CLEAR ALL DATA
            </button>
          )}
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="w-2 h-2 rounded-full bg-green-400 inline-block animate-pulse" />
            Auto-refreshes every 30s
          </div>
        </div>
      </div>

      {showResetModal && (
        <ResetAllModal
          onClose={() => setShowResetModal(false)}
          onDone={() => { window.location.reload(); }}
        />
      )}

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4 mb-6">
        {loadingStats && !stats ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 h-24 animate-pulse" />
          ))
        ) : (
          <>
            <StatCard label="Total Selected"  value={stats?.total ?? stats?.totalSelected} borderColor="border-l-blue-500"   textColor="text-blue-600"   />
            <StatCard label="Awaiting Self"   value={stats?.pendingSelf}   borderColor="border-l-indigo-500" textColor="text-indigo-600" />
            <StatCard label="Awaiting RM"     value={stats?.pendingRm}     borderColor="border-l-orange-500" textColor="text-orange-600" />
            <StatCard label="Awaiting BH"     value={stats?.rmSubmitted}   borderColor="border-l-purple-500" textColor="text-purple-600" />
            <StatCard label="Awaiting HR-SPOC" value={stats?.awaitingHrSpoc} borderColor="border-l-teal-500"   textColor="text-teal-600"   />
            <StatCard label="Awaiting HR-HEAD" value={stats?.awaitingHrHead} borderColor="border-l-violet-500" textColor="text-violet-600" />
            <StatCard label="Awaiting COTO"   value={stats?.awaitingCoto}  borderColor="border-l-rose-500"   textColor="text-rose-600"   />
            <StatCard label="Finalised"       value={stats?.finalized}     borderColor="border-l-green-500"  textColor="text-green-600"  />
          </>
        )}
      </div>

      {/* ── Pairs Table ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Assessment Pairs</h2>
          <span className="text-xs text-slate-400">{pairs.length} record{pairs.length !== 1 ? 's' : ''}</span>
        </div>

        {loadingPairs && pairs.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-400">Loading…</div>
        ) : pairs.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-400">
            No assessment pairs found for this role and cycle.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['Emp Code', 'Name', 'RM', 'BH', 'Status', 'Last Updated', 'Action'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pairs.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{p.empCode}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{p.empName}</td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{p.rmName || <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{p.bhName || <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {p.updatedAt
                        ? new Date(p.updatedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {p.status === 'FINALIZED' ? (
                          <a
                            href={`/admin/audit?pairId=${encodeURIComponent(p.pairId || '')}`}
                            title="Open Audit log — Super Admin can unlock if needed"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-all"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            HR Action
                          </a>
                        ) : (
                          <>
                            {p.rmToken && p.status === 'PENDING_RM' && (
                              <CopyButton text={`${host}/form/rm/${p.rmToken}`} label="RM Link" />
                            )}
                            {p.bhToken && p.status === 'RM_SUBMITTED' && (
                              <CopyButton text={`${host}/form/bh/${p.bhToken}`} label="BH Link" />
                            )}
                            {p.rmToken && p.status !== 'PENDING_RM' && p.status !== 'RM_SUBMITTED' && (
                              <span className="text-xs text-slate-300">—</span>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

export async function getServerSideProps({ req }) {
  const raw = req.cookies?.pms_session;
  if (!raw) {
    return { redirect: { destination: '/admin/login', permanent: false } };
  }
  try {
    const user = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    return { props: { user } };
  } catch {
    return { redirect: { destination: '/admin/login', permanent: false } };
  }
}
