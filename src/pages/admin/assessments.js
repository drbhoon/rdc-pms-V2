/**
 * admin/assessments.js
 * Cycle Management — launch assessments, view pair status, copy links.
 */
import { useState, useEffect, useCallback } from 'react';
import AdminLayout from '../../components/AdminLayout';

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    PENDING_SELF: { label: 'Awaiting Self', cls: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
    PENDING_RM:   { label: 'Awaiting RM',   cls: 'bg-orange-100 text-orange-700 border-orange-200' },
    RM_SUBMITTED: { label: 'Awaiting BH',   cls: 'bg-purple-100 text-purple-700 border-purple-200' },
    PENDING_BH:   { label: 'Awaiting BH',   cls: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
    FINALIZED:    { label: '✓ Finalised',   cls: 'bg-green-100  text-green-700  border-green-200'  },
  };
  const { label, cls } = map[status] || { label: status || 'Not Started', cls: 'bg-slate-100 text-slate-500 border-slate-200' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {label}
    </span>
  );
}

// ── Copy button ───────────────────────────────────────────────────────────────
function CopyBtn({ text, label }) {
  const [copied, setCopied] = useState(false);
  if (!text) return <span className="text-slate-300 text-xs">—</span>;
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
      title={`Copy ${label}`}
      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 transition-all"
    >
      {copied
        ? <svg className="w-3.5 h-3.5 text-green-600" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
        : <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path d="M8 2a1 1 0 000 2h2a1 1 0 100-2H8z" /><path d="M3 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v6h-4.586l1.293-1.293a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L10.414 13H15v3a2 2 0 01-2 2H5a2 2 0 01-2-2V5z" /></svg>
      }
      {copied ? 'Copied!' : label}
    </button>
  );
}

// ── Launch modal ──────────────────────────────────────────────────────────────
// role includes rmNameCol / rmEmailCol / bhNameCol / bhEmailCol so we can
// auto-populate from employee.profileData (stored during bulk upload).
function LaunchModal({ employee, cycle, roleKey, role, startOn, onClose, onLaunched }) {
  const pd = employee.profileData || {};

  const [form, setForm] = useState({
    rmName:  String(pd[role?.rmNameCol]  || ''),
    rmEmail: String(pd[role?.rmEmailCol] || ''),
    bhName:  String(pd[role?.bhNameCol]  || ''),
    bhEmail: String(pd[role?.bhEmailCol] || ''),
  });
  const [localStartOn, setLocalStartOn] = useState(startOn || '');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const autoFilled = role?.rmNameCol && (
    form.rmName || form.rmEmail || form.bhName || form.bhEmail
  );

  function set(field, val) { setForm((f) => ({ ...f, [field]: val })); }

  async function handleConfirm() {
    if (!form.rmName || !form.rmEmail || !form.bhName || !form.bhEmail) {
      return setError('All four fields are required.');
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/admin/pairs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roleKey,
          cycle,
          empCode: employee.empCode,
          empName: employee.empName,
          startOn: localStartOn || null,
          ...form,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create pair');

      // Always fire invites — runInvites() server-side already skips pairs
      // whose startOn is in the future, so this is safe even when HR set
      // a Start On date. Eliminates the !localStartOn front-end check that
      // was incorrectly suppressing fires for past-dated startOn values.
      try {
        await fetch('/api/admin/assessments/send-invites', { method: 'POST' });
      } catch (_) { /* silent — cron will catch it */ }

      onLaunched();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-base font-semibold text-slate-800">Launch Assessment</h3>
            <p className="text-xs text-slate-500 mt-0.5">{employee.empName} ({employee.empCode}) · {cycle}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {autoFilled && (
          <div className="mb-4 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700">
            Pre-filled from employee data — verify before launching.
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div>
        )}

        <div className="space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Reporting Manager</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-600 mb-1">
                RM Name <span className="text-red-500">*</span>
                {role?.rmNameCol && <span className="ml-1 text-slate-400">({role.rmNameCol})</span>}
              </label>
              <input value={form.rmName} onChange={(e) => set('rmName', e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="Full name" />
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">
                RM Email <span className="text-red-500">*</span>
                {role?.rmEmailCol && <span className="ml-1 text-slate-400">({role.rmEmailCol})</span>}
              </label>
              <input type="email" value={form.rmEmail} onChange={(e) => set('rmEmail', e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="rm@rdcconcrete.com" />
            </div>
          </div>
          <div className="pt-1">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Start On <span className="normal-case text-slate-400">(optional — invite email sent on/after this date)</span>
            </label>
            <input
              type="date"
              value={localStartOn}
              onChange={(e) => setLocalStartOn(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            <p className="text-xs text-slate-400 mt-1">Leave blank to send the invite in the next cron tick.</p>
          </div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide pt-1">Business Head</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-600 mb-1">
                BH Name <span className="text-red-500">*</span>
                {role?.bhNameCol && <span className="ml-1 text-slate-400">({role.bhNameCol})</span>}
              </label>
              <input value={form.bhName} onChange={(e) => set('bhName', e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="Full name" />
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">
                BH Email <span className="text-red-500">*</span>
                {role?.bhEmailCol && <span className="ml-1 text-slate-400">({role.bhEmailCol})</span>}
              </label>
              <input type="email" value={form.bhEmail} onChange={(e) => set('bhEmail', e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="bh@rdcconcrete.com" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-6">
          <button onClick={onClose} className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-all">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
          >
            {saving ? 'Launching…' : 'Launch Assessment'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AssessmentsPage({ user }) {
  const [roles, setRoles]         = useState([]);
  const [cycles, setCycles]       = useState([]);
  const [roleKey, setRoleKey]     = useState('');
  const [cycle, setCycle]         = useState('');
  const [newCycleName, setNewCycleName] = useState('');
  const [employees, setEmployees] = useState([]);
  const [pairs, setPairs]         = useState([]);
  const [loading, setLoading]     = useState(false);
  const [launchTarget, setLaunchTarget] = useState(null);

  // Bulk selection
  const [selected, setSelected]       = useState(new Set());
  const [bulkLaunching, setBulkLaunching] = useState(false);
  const [bulkResult, setBulkResult]   = useState(null); // { ok, skipped, errors }
  const [deleting, setDeleting]       = useState(null); // pairId being deleted
  const [startOn, setStartOn]         = useState('');    // shared Start On for bulk launch
  const [invitesResult, setInvitesResult]   = useState(null);

  const host = typeof window !== 'undefined' ? window.location.origin : '';

  // Load roles (includes routing column names for auto-fill)
  useEffect(() => {
    fetch('/api/admin/roles')
      .then((r) => r.json())
      .then((d) => {
        setRoles(d.roles || []);
        if (d.roles?.length) setRoleKey(d.roles[0].roleKey);
      })
      .catch(console.error);
  }, []);

  // Load cycles on role change
  useEffect(() => {
    if (!roleKey) return;
    setCycle('');
    setSelected(new Set());
    fetch(`/api/admin/cycles?roleKey=${encodeURIComponent(roleKey)}`)
      .then((r) => r.json())
      .then((d) => {
        setCycles(d.cycles || []);
        if (d.cycles?.length) setCycle(d.cycles[0]);
      })
      .catch(console.error);
  }, [roleKey]);

  // Load employees + pairs
  const loadData = useCallback(() => {
    if (!roleKey || !cycle) return;
    setLoading(true);
    setSelected(new Set());
    setBulkResult(null);
    const qs = `roleKey=${encodeURIComponent(roleKey)}&cycle=${encodeURIComponent(cycle)}`;
    Promise.all([
      fetch(`/api/admin/employees?roleKey=${encodeURIComponent(roleKey)}`).then((r) => r.json()),
      fetch(`/api/admin/pairs?${qs}`).then((r) => r.json()),
    ])
      .then(([empData, pairData]) => {
        setEmployees(empData.employees || []);
        setPairs(pairData.pairs || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [roleKey, cycle]);

  useEffect(() => { loadData(); }, [loadData]);

  function handleAddCycle() {
    const name = newCycleName.trim();
    if (!name) return;
    if (!cycles.includes(name)) setCycles((prev) => [name, ...prev]);
    setCycle(name);
    setNewCycleName('');
  }

  // Map pair data by empCode for quick lookup
  const pairMap = {};
  pairs.forEach((p) => { pairMap[p.empCode] = p; });

  // Current role object (includes routing column names)
  const currentRole = roles.find((r) => r.roleKey === roleKey) || null;

  // Employees without a pair yet (eligible for launch)
  const unlaunchedEmps = employees.filter((e) => !pairMap[e.empCode]);

  // Checkbox helpers
  const allUnlaunchedSelected = unlaunchedEmps.length > 0 &&
    unlaunchedEmps.every((e) => selected.has(e.empCode));

  function toggleSelect(empCode) {
    setSelected((prev) => {
      const s = new Set(prev);
      s.has(empCode) ? s.delete(empCode) : s.add(empCode);
      return s;
    });
  }

  function toggleAll() {
    if (allUnlaunchedSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(unlaunchedEmps.map((e) => e.empCode)));
    }
  }

  // Delete a PENDING_RM pair
  async function handleDeletePair(pairId, empName) {
    if (!confirm(`Delete assessment for ${empName}?\n\nThis will remove the pair record. You can relaunch afterward if needed.`))
      return;

    setDeleting(pairId);
    try {
      const res = await fetch(`/api/admin/pairs/delete?pairId=${encodeURIComponent(pairId)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      loadData();
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setDeleting(null);
    }
  }

  // Resend the invite email for a single pair (manual override for HR when
  // an email got lost). Auto-targets the right reviewer by current status.
  const [resending, setResending] = useState(null);
  async function handleResend(pairId, empName) {
    if (resending) return;
    setResending(pairId);
    try {
      const res = await fetch('/api/admin/pairs/resend-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Resend failed (HTTP ${res.status})`);
      setInvitesResult({
        rmGroupsEmailed: data.role === 'RM' ? 1 : 0,
        bhGroupsEmailed: data.role === 'BH' ? 1 : 0,
        selfGroupsEmailed: data.role === 'SELF' ? 1 : 0,
        rmPairsMarked: 0, bhPairsMarked: 0, selfPairsMarked: 0,
        errors: [],
        manual: `${data.role} invite resent to ${data.recipient} for ${empName}`,
      });
    } catch (err) {
      alert(`Resend failed: ${err.message}`);
    } finally {
      setResending(null);
    }
  }

  // Bulk launch — uses profileData routing columns directly, no modal
  async function handleBulkLaunch() {
    if (!cycle || selected.size === 0) return;
    setBulkLaunching(true);
    setBulkResult(null);

    const targets = employees.filter((e) => selected.has(e.empCode) && !pairMap[e.empCode]);
    let ok = 0, skipped = 0;
    const errors = [];

    for (const emp of targets) {
      const pd = emp.profileData || {};
      const rmName  = String(pd[currentRole?.rmNameCol]  || '').trim();
      const rmEmail = String(pd[currentRole?.rmEmailCol] || '').trim();
      const bhName  = String(pd[currentRole?.bhNameCol]  || '').trim();
      const bhEmail = String(pd[currentRole?.bhEmailCol] || '').trim();

      if (!rmName || !rmEmail || !bhName || !bhEmail) {
        skipped++;
        errors.push(`${emp.empName} (${emp.empCode}): missing routing data`);
        continue;
      }

      try {
        const res = await fetch('/api/admin/pairs/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roleKey, cycle,
            empCode: emp.empCode, empName: emp.empName,
            rmName, rmEmail, bhName, bhEmail,
            startOn: startOn || null,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');
        ok++;
      } catch (e) {
        skipped++;
        errors.push(`${emp.empName}: ${e.message}`);
      }
    }

    setBulkResult({ ok, skipped, errors });

    // Always fire invites after a successful launch. runInvites() filters
    // internally for `startOn IS NULL OR startOn <= now()`, so future-dated
    // pairs are correctly skipped server-side. Calling on an empty queue
    // is a no-op. This eliminates any front-end date-comparison bug.
    let invitesAutoFired = false;
    if (ok > 0) {
      try {
        const res = await fetch('/api/admin/assessments/send-invites', { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
          setInvitesResult(data);
          invitesAutoFired = true;
        }
      } catch (e) { /* silent — cron will pick up any missed invites */ }
    }

    setBulkResult({ ok, skipped, errors, invitesAutoFired });
    setBulkLaunching(false);
    loadData();
  }

  // Profile summary: show up to 3 non-email fields prioritising routing names
  function profileSummary(emp) {
    const pd = emp.profileData || {};
    const r  = currentRole;
    // Priority: rm name, bh name, then other non-email fields
    const priority = [r?.rmNameCol, r?.bhNameCol].filter(Boolean);
    const others   = Object.keys(pd).filter((k) => !priority.includes(k) && !/e?mail/i.test(k));
    const keys     = [...priority, ...others].filter((k) => pd[k] != null && pd[k] !== '').slice(0, 3);
    return keys.map((k) => `${k}: ${pd[k]}`).join(' · ') || '—';
  }

  return (
    <AdminLayout title="Cycle Management" user={user}>
      {/* ── Top controls ── */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-600 whitespace-nowrap">Role</label>
          <select value={roleKey} onChange={(e) => setRoleKey(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 min-w-[150px]">
            {roles.map((r) => <option key={r.roleKey} value={r.roleKey}>{r.roleLabel || r.roleKey}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-600 whitespace-nowrap">Cycle</label>
          <select value={cycle} onChange={(e) => setCycle(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 min-w-[150px]">
            {cycles.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-600 whitespace-nowrap">Start On</label>
          <input
            type="date"
            value={startOn}
            onChange={(e) => setStartOn(e.target.value)}
            title="Applied to every pair you launch next. Blank = invite sent in the next cron tick."
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
          {startOn && (
            <button
              onClick={() => setStartOn('')}
              className="text-xs text-slate-400 hover:text-slate-600"
              title="Clear Start On">
              clear
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={loadData}
            disabled={!roleKey || !cycle || loading}
            title="Refresh status from the database"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1.5">
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
            </svg>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <input value={newCycleName} onChange={(e) => setNewCycleName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddCycle()}
            placeholder="New cycle name…"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 w-44" />
          <button onClick={handleAddCycle} disabled={!newCycleName.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
            + New Cycle
          </button>
        </div>
      </div>

      {/* ── Invite result banner ── */}
      {invitesResult && (() => {
        const hasErrors = (invitesResult.errors?.length || 0) > 0;
        const totalSent = (invitesResult.selfGroupsEmailed || 0)
                       + (invitesResult.rmGroupsEmailed   || 0)
                       + (invitesResult.bhGroupsEmailed   || 0);
        const cls = hasErrors
          ? 'bg-amber-50 border-amber-200 text-amber-800'
          : totalSent > 0
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-slate-50 border-slate-200 text-slate-700';
        return (
          <div className={`mb-4 rounded-xl px-5 py-3 text-sm border ${cls}`}>
            {invitesResult.manual ? (
              <span><strong>✓</strong> {invitesResult.manual}</span>
            ) : hasErrors ? (
              <span>
                <strong>{totalSent} email(s) sent</strong> · <strong>{invitesResult.errors.length} failed</strong>: {invitesResult.errors.join('; ')}.
                Use the <em>Resend</em> button on the row to retry.
              </span>
            ) : totalSent === 0 ? (
              <span>
                No emails were due to send (all pending invites already marked, or none waiting).
                Use <em>Resend</em> on a row to force-send.
              </span>
            ) : (
              <span>
                <strong>✓ {totalSent} email{totalSent !== 1 ? 's' : ''} sent</strong>
                {(invitesResult.selfGroupsEmailed || 0) > 0 && <> · {invitesResult.selfGroupsEmailed} Self ({invitesResult.selfPairsMarked || 0} pair{invitesResult.selfPairsMarked !== 1 ? 's' : ''})</>}
                {(invitesResult.rmGroupsEmailed   || 0) > 0 && <> · {invitesResult.rmGroupsEmailed} RM ({invitesResult.rmPairsMarked || 0} pair{invitesResult.rmPairsMarked !== 1 ? 's' : ''})</>}
                {(invitesResult.bhGroupsEmailed   || 0) > 0 && <> · {invitesResult.bhGroupsEmailed} BH ({invitesResult.bhPairsMarked || 0} pair{invitesResult.bhPairsMarked !== 1 ? 's' : ''})</>}
                . See <a className="underline" href="/admin/audit?action=INVITE_SENT">Audit log</a> for the paper trail.
              </span>
            )}
          </div>
        );
      })()}

      {/* ── Bulk result banner ── */}
      {bulkResult && (
        <div className={`mb-4 rounded-xl px-5 py-3 text-sm border ${bulkResult.skipped === 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
          <span className="font-semibold">{bulkResult.ok} launched</span>
          {bulkResult.skipped > 0 && <span className="ml-2 text-amber-700">{bulkResult.skipped} skipped — {bulkResult.errors.join('; ')}</span>}
          {bulkResult.ok > 0 && (
            <span className="ml-2 text-emerald-700">
              {bulkResult.invitesAutoFired
                ? (startOn && new Date(startOn) > new Date()
                    ? `· Invites scheduled — emails go out on/after ${startOn}.`
                    : '· Reviewer invites were emailed automatically.')
                : '· Reviewer invites will be emailed by the next cron tick.'}
            </span>
          )}
        </div>
      )}

      {/* ── Main table ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-700">
            {cycle ? `${roleKey} — ${cycle}` : 'Select a role and cycle'}
          </h2>
          <div className="flex items-center gap-3 ml-auto">
            <span className="text-xs text-slate-400">{employees.length} employees</span>
            {selected.size > 0 && (
              <button
                onClick={handleBulkLaunch}
                disabled={bulkLaunching}
                title={startOn
                  ? `Invites will be scheduled — first email goes out on/after ${startOn}.`
                  : 'Launch immediately and email reviewers now.'}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all flex items-center gap-2 disabled:cursor-not-allowed ${
                  startOn
                    ? 'bg-emerald-600/40 text-white/90 hover:bg-emerald-600/60 disabled:opacity-60'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60'
                }`}
              >
                {bulkLaunching
                  ? <><svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Launching…</>
                  : startOn
                    ? `🕒 Schedule Launch (${selected.size})`
                    : `🚀 Launch Selected (${selected.size})`
                }
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="px-6 py-12 text-center text-sm text-slate-400">Loading…</div>
        ) : employees.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-400">
            No employees found for this role. Add employees in the Employees section first.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-4 py-3 w-10">
                    {unlaunchedEmps.length > 0 && (
                      <input type="checkbox" checked={allUnlaunchedSelected} onChange={toggleAll}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        title="Select all unlaunched" />
                    )}
                  </th>
                  {['Emp Code', 'Name', 'RM · BH · Profile', 'Status', 'Self Link', 'RM Link', 'BH Link', 'Action'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.map((emp) => {
                  const pair    = pairMap[emp.empCode];
                  const canSelect = !pair;
                  const isSelected = selected.has(emp.empCode);

                  return (
                    <tr key={emp.id || emp.empCode}
                      className={`transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                      <td className="px-4 py-3 w-10">
                        {canSelect && (
                          <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(emp.empCode)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{emp.empCode}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{emp.empName}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 max-w-sm truncate" title={profileSummary(emp)}>
                        {profileSummary(emp)}
                      </td>
                      <td className="px-4 py-3">
                        {pair ? <StatusBadge status={pair.status} /> : <span className="text-xs text-slate-400">Not launched</span>}
                      </td>
                      {/* Self Link — only meaningful when this pair was launched with requireSelf=true */}
                      <td className="px-4 py-3">
                        {pair?.requireSelf && pair?.selfToken
                          ? (pair.status === 'PENDING_SELF'
                              ? <CopyBtn text={`${host}/form/self/${pair.selfToken}`} label="Self Link" />
                              : <span className="inline-flex items-center px-2 py-1 text-xs text-slate-400 bg-slate-50 rounded-md" title="Self-assessment already submitted">used</span>)
                          : <span className="text-slate-300 text-xs" title="Template does not require self-assessment">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {pair?.rmToken
                          ? (pair.status === 'PENDING_SELF'
                              ? <span className="inline-flex items-center px-2 py-1 text-xs text-slate-300 bg-slate-50 rounded-md cursor-not-allowed" title="Unlocks when employee submits self-assessment">locked</span>
                              : pair.status === 'FINALIZED'
                                  ? <span className="inline-flex items-center px-2 py-1 text-xs text-slate-400 bg-slate-50 rounded-md" title="Form submitted and locked">used</span>
                                  : <CopyBtn text={`${host}/form/rm/${pair.rmToken}`} label="RM Link" />)
                          : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {pair?.bhToken
                          ? (pair.status === 'PENDING_SELF' || pair.status === 'PENDING_RM'
                              ? <span className="inline-flex items-center px-2 py-1 text-xs text-slate-300 bg-slate-50 rounded-md cursor-not-allowed" title="Unlocks when RM submits">locked</span>
                              : pair.status === 'FINALIZED'
                                  ? <span className="inline-flex items-center px-2 py-1 text-xs text-slate-400 bg-slate-50 rounded-md" title="Form submitted and locked">used</span>
                                  : <CopyBtn text={`${host}/form/bh/${pair.bhToken}`} label="BH Link" />)
                          : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 space-x-2 flex items-center">
                        {!pair ? (
                          <button onClick={() => setLaunchTarget(emp)}
                            className="rounded-lg border border-blue-300 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 transition-all"
                            title="Edit routing info before launching">
                            Edit & Launch
                          </button>
                        ) : pair.status === 'PENDING_SELF' || pair.status === 'PENDING_RM' ? (
                          <>
                            <button
                              onClick={() => handleResend(pair.pairId, emp.empName)}
                              disabled={resending === pair.pairId}
                              className="rounded-lg border border-emerald-300 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 transition-all flex items-center gap-1"
                              title="Force-resend the invite email to the current reviewer">
                              <svg className={`w-3 h-3 ${resending === pair.pairId ? 'animate-spin' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                              </svg>
                              {resending === pair.pairId ? '…' : 'Resend'}
                            </button>
                            <button
                              onClick={() => handleDeletePair(pair.pairId, emp.empName)}
                              disabled={deleting === pair.pairId}
                              className="rounded-lg border border-red-300 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-40 transition-all"
                              title="Delete this pending assessment to relaunch or reroute">
                              {deleting === pair.pairId ? '…' : 'Delete'}
                            </button>
                          </>
                        ) : pair.status === 'RM_SUBMITTED' ? (
                          <button
                            onClick={() => handleResend(pair.pairId, emp.empName)}
                            disabled={resending === pair.pairId}
                            className="rounded-lg border border-emerald-300 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 transition-all flex items-center gap-1"
                            title="Force-resend the BH invite email">
                            <svg className={`w-3 h-3 ${resending === pair.pairId ? 'animate-spin' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                            </svg>
                            {resending === pair.pairId ? '…' : 'Resend BH'}
                          </button>
                        ) : pair.status === 'FINALIZED' ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700" title="Assessment completed and locked">
                            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            Completed
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 italic">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {unlaunchedEmps.length > 0 && (
              <div className="px-6 py-3 border-t border-slate-100 text-xs text-slate-400">
                Tip: Check boxes to select employees, then click <strong>Launch Selected</strong> to bulk-launch using routing data from their profile.
                Use <strong>Edit &amp; Launch</strong> to manually set or override routing info.
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Launch modal (single, with edit) ── */}
      {launchTarget && (
        <LaunchModal
          employee={launchTarget}
          cycle={cycle}
          roleKey={roleKey}
          role={currentRole}
          startOn={startOn}
          onClose={() => setLaunchTarget(null)}
          onLaunched={loadData}
        />
      )}
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
