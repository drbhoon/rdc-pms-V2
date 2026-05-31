/**
 * DashboardPanel.js
 * A collapsible section panel used in the dashboard view.
 */
import { useState } from 'react';
import StatusBadge from './StatusBadge';
import clsx from 'clsx';

export default function DashboardPanel({ title, items, color, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  const count = items?.length || 0;

  const headerColors = {
    purple: 'bg-purple-600',
    blue:   'bg-blue-600',
    yellow: 'bg-yellow-500',
    green:  'bg-green-600',
    gray:   'bg-gray-500',
  };

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden mb-4">
      {/* Panel header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          'w-full text-left px-4 py-3 flex items-center justify-between text-white font-semibold text-sm',
          headerColors[color] || 'bg-gray-600'
        )}
      >
        <span>
          {title}
          <span className="ml-2 bg-white bg-opacity-20 rounded px-2 py-0.5 text-xs">
            {count}
          </span>
        </span>
        <span className="text-xs opacity-75">{open ? '▲ Collapse' : '▼ Expand'}</span>
      </button>

      {/* Panel body */}
      {open && (
        <div className="overflow-x-auto">
          {count === 0 ? (
            <div className="text-center text-gray-400 py-6 text-sm">No items</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Emp Code</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Cycle</th>
                  <th>Pair ID</th>
                  <th>Status</th>
                  <th>RM</th>
                  <th>BH</th>
                  <th>Updated</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row, i) => (
                  <tr key={row.ASSESSMENT_PAIR_ID || i} className="hover:bg-gray-50">
                    <td className="font-mono font-semibold">{row.EMP_CODE}</td>
                    <td>{row.EMP_NAME}</td>
                    <td>{row.ROLE}</td>
                    <td>{row.CYCLE}</td>
                    <td className="text-xs text-gray-500 font-mono">{row.ASSESSMENT_PAIR_ID}</td>
                    <td><StatusBadge status={row.STATUS} /></td>
                    <td className="text-xs">{row.RM_NAME}</td>
                    <td className="text-xs">{row.BH_NAME}</td>
                    <td className="text-xs text-gray-400">{row.LAST_UPDATED_ON?.slice(0, 10) || '—'}</td>
                    <td>
                      {row.STATUS === 'Pending RM' && row.SELECTION_FLAG === 'Selected' && (
                        <a
                          href={`/assessment/rm?roleKey=${row.ROLE}&pairId=${row.ASSESSMENT_PAIR_ID}`}
                          className="text-blue-600 hover:underline text-xs"
                        >
                          RM Form →
                        </a>
                      )}
                      {row.STATUS === 'Pending BH' && (
                        <a
                          href={`/assessment/bh?roleKey=${row.ROLE}&pairId=${row.ASSESSMENT_PAIR_ID}`}
                          className="text-green-600 hover:underline text-xs"
                        >
                          BH Form →
                        </a>
                      )}
                      {row.STATUS === 'Finalized' && (
                        <a
                          href={`/assessment/bh?roleKey=${row.ROLE}&pairId=${row.ASSESSMENT_PAIR_ID}&view=1`}
                          className="text-gray-500 hover:underline text-xs"
                        >
                          View →
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
