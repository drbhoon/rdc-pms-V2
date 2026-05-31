/**
 * DELETE /api/admin/pairs/delete?pairId=X
 * Deletes an assessment pair. Only allowed when status = PENDING_RM.
 * Super Admin can delete any status.
 */
import { requireAuth } from '../../../../lib/auth';
import { getPairById, deletePair, appendAudit } from '../../../../lib/queries';

export default async function handler(req, res) {
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

  const user = requireAuth(req, res);
  if (!user) return;

  let pairId = req.query.pairId;
  if (!pairId) return res.status(400).json({ error: 'pairId is required' });

  // Sanitize pairId (should be a string)
  if (typeof pairId !== 'string') pairId = String(pairId).trim();
  if (!pairId) return res.status(400).json({ error: 'Invalid pairId' });

  try {
    const pair = await getPairById(pairId);
    if (!pair) return res.status(404).json({ error: 'Pair not found' });

    // Only PENDING_RM can be deleted by regular HR; Super Admin can delete any
    if (pair.status !== 'PENDING_RM' && user.role !== 'HR_SUPER_ADMIN') {
      return res.status(403).json({
        error: `Cannot delete: assessment is already ${pair.status}. Only Super Admin can delete submitted assessments.`,
      });
    }

    // Log before delete (pair record will be gone after)
    const logDetails = {
      deletedPairId: pair.pairId,
      empCode: pair.empCode,
      empName: pair.empName,
      rmName: pair.rmName,
      rmEmail: pair.rmEmail,
      status: pair.status,
    };

    await deletePair(pairId);

    // appendAudit with pairId=null since pair is gone
    await appendAudit({
      action:      'PAIR_DELETED',
      pairId:      null,
      empCode:     pair.empCode,
      empName:     pair.empName,
      roleKey:     pair.roleKey,
      cycle:       pair.cycle,
      performedBy: user.email,
      details:     logDetails,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[pairs/delete] Error:', {
      message: err.message,
      code: err.code,
      meta: err.meta,
      pairId,
    });
    return res.status(500).json({ error: 'Failed to delete pair' });
  }
}
