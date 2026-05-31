/**
 * StatusBadge.js
 * Colored badge for workflow status and lock status.
 */
import clsx from 'clsx';

const STATUS_STYLES = {
  'Pending RM':   'bg-purple-100 text-purple-800 border border-purple-300',
  'Selected':     'bg-purple-200 text-purple-900 border border-purple-400',
  'RM Submitted': 'bg-blue-100   text-blue-800   border border-blue-300',
  'Pending BH':   'bg-yellow-100 text-yellow-800 border border-yellow-300',
  'Finalized':    'bg-green-100  text-green-800  border border-green-300',
  'Unlocked':     'bg-gray-100   text-gray-600   border border-gray-300',
  'RM Locked':    'bg-blue-100   text-blue-700   border border-blue-200',
  'Fully Locked': 'bg-red-100    text-red-700    border border-red-200',
};

export default function StatusBadge({ status }) {
  if (!status) return null;
  const style = STATUS_STYLES[status] || 'bg-gray-100 text-gray-600 border border-gray-300';
  return (
    <span className={clsx('inline-block px-2 py-0.5 rounded text-xs font-medium', style)}>
      {status}
    </span>
  );
}

/** Row background class based on workflow status (for employee table rows) */
export function rowColorClass(row) {
  if (row.STATUS === 'Finalized')    return 'row-green';
  if (row.STATUS === 'RM Submitted') return 'row-rm';
  if (row.SELECTION_FLAG === 'Selected' || row.STATUS === 'Pending RM') return 'row-selected';
  return 'row-idle';
}
