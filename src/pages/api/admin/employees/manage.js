/**
 * POST /api/admin/employees/manage
 * body: { action: 'archive' | 'restore' | 'delete', empCode, roleKey }
 *
 * archive — soft-delete: sets isActive=false, marks all pairs as isArchived=true
 * restore — reverses archive
 * delete  — hard-delete: removes audit logs, pairs, and the employee record
 */
import { requireAuth } from '../../../../lib/auth';
import {
  archiveEmployee,
  restoreEmployee,
  deleteEmployee,
  appendAudit,
} from '../../../../lib/queries';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = requireAuth(req, res);
  if (!user) return;

  const { action, empCode, roleKey, empName } = req.body || {};
  if (!action || !empCode || !roleKey)
    return res.status(400).json({ error: 'action, empCode and roleKey are required' });

  try {
    if (action === 'archive') {
      await archiveEmployee(empCode, roleKey, user.email);
      await appendAudit({
        action:      'EMPLOYEE_ARCHIVED',
        pairId:      null,
        empCode,
        empName:     empName || empCode,
        roleKey,
        cycle:       null,
        performedBy: user.email,
        details:     { archivedBy: user.email },
      });
      return res.status(200).json({ ok: true, message: 'Employee archived.' });
    }

    if (action === 'restore') {
      await restoreEmployee(empCode, roleKey);
      await appendAudit({
        action:      'EMPLOYEE_RESTORED',
        pairId:      null,
        empCode,
        empName:     empName || empCode,
        roleKey,
        cycle:       null,
        performedBy: user.email,
        details:     { restoredBy: user.email },
      });
      return res.status(200).json({ ok: true, message: 'Employee restored.' });
    }

    if (action === 'delete') {
      // Only Super Admin can hard-delete
      if (user.role !== 'HR_SUPER_ADMIN')
        return res.status(403).json({ error: 'Only Super Admin can permanently delete employees.' });
      await deleteEmployee(empCode, roleKey);
      return res.status(200).json({ ok: true, message: 'Employee and all associated data deleted.' });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (err) {
    console.error('[employees/manage]', err?.code, err?.message);
    return res.status(500).json({ error: `Failed: ${err?.message || 'Unknown error'}` });
  }
}
