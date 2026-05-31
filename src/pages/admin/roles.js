/**
 * Admin – Role / Template Setup
 * Shows sheet structure preview and column classification for each role.
 */
import { useState, useEffect } from 'react';
import Layout from '../../components/Layout';
import clsx from 'clsx';

const TYPE_COLORS = {
  identity:      'bg-blue-100 text-blue-800 border-blue-300',
  narrative:     'bg-purple-100 text-purple-800 border-purple-300',
  routing:       'bg-yellow-100 text-yellow-800 border-yellow-300',
  rating:        'bg-green-100 text-green-800 border-green-300',
  rating_comment:'bg-teal-100 text-teal-800 border-teal-300',
  system:        'bg-gray-100 text-gray-600 border-gray-300',
  other:         'bg-orange-100 text-orange-800 border-orange-300',
};

export default function RoleSetup() {
  const [roles, setRoles] = useState([]);
  const [selectedRole, setSelectedRole] = useState('');
  const [template, setTemplate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [approved, setApproved] = useState({});

  useEffect(() => {
    fetch('/api/roles')
      .then((r) => r.json())
      .then((d) => {
        setRoles(d.roles || []);
        if (d.roles?.length) setSelectedRole(d.roles[0].key);
      });
  }, []);

  useEffect(() => {
    if (!selectedRole) return;
    setLoading(true);
    setError('');
    setTemplate(null);
    fetch(`/api/roles/${selectedRole}/template`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setTemplate(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedRole]);

  return (
    <Layout title="Role / Template Setup">
      {/* Role selector */}
      <div className="flex items-center gap-3 mb-6">
        <label className="form-label mb-0">Select Role</label>
        <select
          className="form-select w-56"
          value={selectedRole}
          onChange={(e) => setSelectedRole(e.target.value)}
        >
          {roles.map((r) => (
            <option key={r.key} value={r.key}>{r.label} ({r.key})</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded px-4 py-3 text-red-700 text-sm mb-4">
          {error}
        </div>
      )}

      {loading && <div className="text-gray-500 py-6 text-center">Loading template…</div>}

      {template && (
        <div className="space-y-4">
          {/* Sheet info */}
          <div className="card">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><span className="form-label">Role Key</span>{template.roleKey}</div>
              <div><span className="form-label">Sheet Name</span>{template.sheetName}</div>
              <div><span className="form-label">Total Columns</span>{template.totalColumns}</div>
              <div>
                <span className="form-label">Questions</span>
                {template.questionGroups?.length || 0} rating groups
              </div>
            </div>
          </div>

          {/* Column classification */}
          <div className="card">
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-4">
              Column Classification Preview
            </h2>
            <div className="flex flex-wrap gap-2">
              {template.classified?.map((col) => (
                <span
                  key={col.index}
                  className={clsx(
                    'inline-flex items-center gap-1 px-2 py-1 rounded border text-xs font-medium',
                    TYPE_COLORS[col.type] || TYPE_COLORS.other
                  )}
                  title={`Type: ${col.type} | Index: ${col.index}`}
                >
                  {col.key}
                </span>
              ))}
            </div>

            {/* Legend */}
            <div className="mt-4 flex flex-wrap gap-3">
              {Object.entries(TYPE_COLORS).map(([type, cls]) => (
                <span key={type} className={clsx('px-2 py-0.5 rounded border text-xs', cls)}>
                  {type}
                </span>
              ))}
            </div>
          </div>

          {/* Question groups */}
          {template.questionGroups?.length > 0 && (
            <div className="card">
              <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
                Assessment Questions ({template.questionGroups.length})
              </h2>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Rating Column</th>
                    <th>Comment Column</th>
                  </tr>
                </thead>
                <tbody>
                  {template.questionGroups.map((q) => (
                    <tr key={q.num}>
                      <td>{q.num}</td>
                      <td className="font-mono">{q.ratingKey}</td>
                      <td className="font-mono text-gray-500">{q.commentKey || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Approve button */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setApproved((prev) => ({ ...prev, [selectedRole]: true }))}
              className={approved[selectedRole] ? 'btn-success' : 'btn-primary'}
            >
              {approved[selectedRole] ? '✓ Template Approved' : 'Approve Template'}
            </button>
            {approved[selectedRole] && (
              <span className="text-green-600 text-sm">
                Template for <strong>{selectedRole}</strong> is approved and ready for use.
              </span>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}
