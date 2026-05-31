/**
 * EmployeeTable.js
 * Clean, compact employee list for cycle selection.
 * Click Select to assign a row for RM assessment (turns purple).
 */
import StatusBadge, { rowColorClass } from './StatusBadge';
import clsx from 'clsx';

export default function EmployeeTable({ employees, onToggleSelect, loadingPairId }) {
  if (!employees || employees.length === 0) {
    return (
      <div className="text-center text-gray-400 py-10 bg-white rounded border border-gray-200">
        No employees found for this cycle.
        <br />
        <span className="text-xs">Use &quot;+ Add New Cycle Row&quot; to create entries.</span>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded border border-gray-200 shadow-sm">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-100 border-b border-gray-200">
            <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">Emp Code</th>
            <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">Name</th>
            <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">Cycle</th>
            <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">RM</th>
            <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">BH</th>
            <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">Status</th>
            <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">Selected By</th>
            <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">Action</th>
          </tr>
        </thead>
        <tbody>
          {employees.map((emp) => {
            const isLoading   = loadingPairId === emp.ASSESSMENT_PAIR_ID;
            const canSelect   = ['Pending RM', '', undefined].includes(emp.STATUS);
            const isSelected  = emp.SELECTION_FLAG === 'Selected';
            const isRmPending = emp.STATUS === 'Pending BH' || emp.STATUS === 'RM Submitted';
            const isFinalized = emp.STATUS === 'Finalized';

            return (
              <tr
                key={emp.ASSESSMENT_PAIR_ID || emp.EMP_CODE}
                className={clsx(rowColorClass(emp), 'border-b border-gray-100 transition-colors')}
                title={emp.ASSESSMENT_PAIR_ID}
              >
                <td className="px-4 py-2.5 font-mono font-semibold text-gray-800">{emp.EMP_CODE}</td>
                <td className="px-4 py-2.5 font-medium">{emp.EMP_NAME}</td>
                <td className="px-4 py-2.5 text-gray-500 text-xs">{emp.CYCLE}</td>
                <td className="px-4 py-2.5 text-gray-600 text-xs">{emp.RM_NAME}</td>
                <td className="px-4 py-2.5 text-gray-600 text-xs">{emp.BH_NAME}</td>
                <td className="px-4 py-2.5"><StatusBadge status={emp.STATUS} /></td>
                <td className="px-4 py-2.5 text-xs text-gray-500">{emp.SELECTED_BY || '—'}</td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-1.5 flex-wrap">
                    {/* Select / Unselect */}
                    {canSelect && (
                      <button
                        onClick={() => onToggleSelect(emp.ASSESSMENT_PAIR_ID)}
                        disabled={isLoading}
                        className={clsx(
                          'text-xs px-3 py-1 rounded font-medium transition-colors',
                          isSelected
                            ? 'bg-purple-600 text-white hover:bg-purple-700'
                            : 'bg-white text-purple-700 border border-purple-300 hover:bg-purple-50'
                        )}
                      >
                        {isLoading ? '…' : isSelected ? '✓ Selected' : 'Select'}
                      </button>
                    )}

                    {/* RM Form */}
                    {canSelect && isSelected && (
                      <a
                        href={`/assessment/rm?roleKey=${encodeURIComponent(emp.ROLE)}&pairId=${encodeURIComponent(emp.ASSESSMENT_PAIR_ID)}`}
                        className="text-xs px-3 py-1 rounded font-medium bg-blue-600 text-white hover:bg-blue-700"
                      >
                        RM Form
                      </a>
                    )}

                    {/* BH Form */}
                    {isRmPending && (
                      <a
                        href={`/assessment/bh?roleKey=${encodeURIComponent(emp.ROLE)}&pairId=${encodeURIComponent(emp.ASSESSMENT_PAIR_ID)}`}
                        className="text-xs px-3 py-1 rounded font-medium bg-green-600 text-white hover:bg-green-700"
                      >
                        BH Form
                      </a>
                    )}

                    {/* View finalized */}
                    {isFinalized && (
                      <a
                        href={`/assessment/bh?roleKey=${encodeURIComponent(emp.ROLE)}&pairId=${encodeURIComponent(emp.ASSESSMENT_PAIR_ID)}&view=1`}
                        className="text-xs px-3 py-1 rounded font-medium bg-gray-100 text-gray-600 border border-gray-300 hover:bg-gray-200"
                      >
                        View
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
