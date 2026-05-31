/**
 * Dashboard – Pending / Reminder view
 * Shows: Pending RM, Selected/In Progress, Pending BH, RM Submitted, Finalized
 */
import { useState, useEffect, useCallback } from 'react';
import Layout from '../../components/Layout';
import DashboardPanel from '../../components/DashboardPanel';

export default function Dashboard() {
  const [roleKey, setRoleKey] = useState('PI');
  const [roles, setRoles] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Load role list
  useEffect(() => {
    fetch('/api/roles')
      .then((r) => r.json())
      .then((d) => {
        setRoles(d.roles || []);
        if (d.roles?.length) setRoleKey(d.roles[0].key);
      });
  }, []);

  const loadDashboard = useCallback(async () => {
    if (!roleKey) return;
    setLoading(true);
    setError('');
    try {
      const r = await fetch(`/api/dashboard?roleKey=${encodeURIComponent(roleKey)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setData(d);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [roleKey]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  return (
    <Layout title="Dashboard – Workflow Status">
      {/* Role selector + refresh */}
      <div className="flex items-center gap-3 mb-6">
        <label className="form-label mb-0">Role</label>
        <select
          className="form-select w-48"
          value={roleKey}
          onChange={(e) => setRoleKey(e.target.value)}
        >
          {roles.map((r) => (
            <option key={r.key} value={r.key}>{r.label}</option>
          ))}
        </select>
        <button onClick={loadDashboard} className="btn-secondary" disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded px-4 py-3 text-red-700 text-sm mb-4">
          {error}
        </div>
      )}

      {/* Summary counts */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {[
            { label: 'Pending RM',   count: data.counts?.pendingRm,   color: 'bg-purple-100 text-purple-800 border-purple-300' },
            { label: 'Selected',     count: data.counts?.selected,    color: 'bg-purple-200 text-purple-900 border-purple-400' },
            { label: 'Pending BH',   count: data.counts?.pendingBh,   color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
            { label: 'RM Submitted', count: data.counts?.rmSubmitted, color: 'bg-blue-100 text-blue-800 border-blue-300' },
            { label: 'Finalized',    count: data.counts?.finalized,   color: 'bg-green-100 text-green-800 border-green-300' },
          ].map(({ label, count, color }) => (
            <div key={label} className={`rounded-lg border px-4 py-3 text-center ${color}`}>
              <div className="text-2xl font-bold">{count ?? '—'}</div>
              <div className="text-xs font-medium">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Pending panels */}
      {data && (
        <>
          <DashboardPanel
            title="Selected – Pending RM Submission"
            items={data.selected}
            color="purple"
            defaultOpen
          />
          <DashboardPanel
            title="Not Yet Selected – Pending RM"
            items={data.pendingRm}
            color="gray"
            defaultOpen={false}
          />
          <DashboardPanel
            title="RM Submitted – Pending BH"
            items={data.pendingBh}
            color="yellow"
            defaultOpen
          />
          <DashboardPanel
            title="RM Submitted (RM rows)"
            items={data.rmSubmitted}
            color="blue"
            defaultOpen={false}
          />
          <DashboardPanel
            title="Finalized"
            items={data.finalized}
            color="green"
            defaultOpen={false}
          />
        </>
      )}

      {!data && !loading && (
        <div className="text-center text-gray-400 py-12">Select a role and click Refresh.</div>
      )}
    </Layout>
  );
}
