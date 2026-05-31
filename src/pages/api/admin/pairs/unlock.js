/**
 * POST /api/admin/pairs/unlock
 * Super-admin only: unlocks a finalized/locked assessment pair.
 * Body: { pairId, reason }
 */
import { requireSuperAdmin } from '../../../../lib/auth';
import { getPairById, unlockPair, appendAudit } from '../../../../lib/queries';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = requireSuperAdmin(req, res);
  if (!user) return;

  const { pairId, reason } = req.body || {};

  if (!pairId) return res.status(400).json({ error: 'pairId is required' });
  if (!reason || reason.trim().length < 10) {
    return res.status(400).json({ error: 'A reason of at least 10 characters is required' });
  }

  try {
    const pair = await getPairById(pairId);
    if (!pair) return res.status(404).json({ error: 'Pair not found' });

    await unlockPair(pairId, user.email);

    await appendAudit({
      action:      'ADMIN_UNLOCK',
      pairId:      pair.pairId,
      empCode:     pair.empCode,
      empName:     pair.empName,
      roleKey:     pair.roleKey,
      cycle:       pair.cycle,
      performedBy: user.email,
      details:     { reason: reason.trim() },
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[pairs/unlock]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
