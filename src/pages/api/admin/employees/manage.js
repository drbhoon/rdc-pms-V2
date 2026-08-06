/**
 * POST /api/admin/employees/manage
 * body: { action: 'archive' | 'restore' | 'delete', empCode, roleKey }
 *
 * archive — soft-delete: sets isActive=false, marks all pairs as isArchived=true
 * restore — reverses archive
 * delete  — hard-delete: removes HR reviews, audit logs, pairs, and the
 *           employee record. Open to any HR admin PROVIDED the employee has no
 *           live assessment; a Super Admin can override that.
 */
import { requireAuth } from '../../../../lib/auth';
import {
  archiveEmployee,
  restoreEmployee,
  deleteEmployee,
  getLiveAssessments,
  appendAudit,
} from '../../../../lib/queries';

// Reader-facing stage names, so a refusal says "Awaiting BH" rather than
// "RM_SUBMITTED". Mirrors the StatusBadge map in the admin pages.
const STAGE_LABELS = {
  PENDING_SELF:      'Awaiting Self',
  PENDING_RM:        'Awaiting RM',
  RM_SUBMITTED:      'Awaiting BH',
  PENDING_BH:        'Awaiting BH',
  BH_SUBMITTED:      'Awaiting HR-SPOC',
  HR_SPOC_SUBMITTED: 'Awaiting HR-HEAD',
  HR_HEAD_SUBMITTED: 'Awaiting COTO',
};

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
      // The gate is the employee's state, not the caller's rank: an employee
      // with nothing in flight is safe for any HR admin to remove. What is not
      // safe is deleting someone mid-cycle — their reviewers are holding live
      // form links that would start 404ing, and the part-finished ratings go
      // with them. Super Admin keeps the override, matching pairs/delete.
      const live = await getLiveAssessments(empCode, roleKey);
      if (live.length && user.role !== 'HR_SUPER_ADMIN') {
        const detail = live
          .map((p) => `${p.cycle} (${STAGE_LABELS[p.status] || p.status})`)
          .join(', ');
        return res.status(409).json({
          error:
            `${empName || empCode} has ${live.length} live assessment${live.length > 1 ? 's' : ''} — ${detail}. ` +
            `Archive the employee instead, or delete the assessment from Cycle Management first.`,
        });
      }

      const { pairsDeleted } = await deleteEmployee(empCode, roleKey);

      // Written after the delete: deleteEmployee clears every audit row tied to
      // this employee's pairs, so an entry made first would be erased. This one
      // carries pairId=null and survives as the record of what happened.
      await appendAudit({
        action:      'EMPLOYEE_DELETED',
        pairId:      null,
        empCode,
        empName:     empName || empCode,
        roleKey,
        cycle:       null,
        performedBy: user.email,
        details:     { pairsDeleted, liveAtDeletion: live.length, deletedBy: user.email },
      });

      return res.status(200).json({
        ok: true,
        message: pairsDeleted
          ? `${empName || empCode} deleted, along with ${pairsDeleted} assessment${pairsDeleted > 1 ? 's' : ''}.`
          : `${empName || empCode} deleted.`,
      });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (err) {
    console.error('[employees/manage]', err?.code, err?.message);
    return res.status(500).json({ error: `Failed: ${err?.message || 'Unknown error'}` });
  }
}
