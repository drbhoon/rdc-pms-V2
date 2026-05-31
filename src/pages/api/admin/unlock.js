/**
 * POST /api/admin/unlock
 * Super admin only: unlock a finalized/locked row.
 *
 * Body: { roleKey, pairId, rowType, reason }
 * Headers: x-pms-user (must be in SUPER_ADMINS list)
 */
import { adminUnlockRow } from '../../../lib/workflow';
import { getCurrentUser, getSuperAdmins, isMockMode } from '../../../lib/roleConfig';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { roleKey, pairId, rowType, reason } = req.body;
  if (!roleKey || !pairId || !rowType) {
    return res.status(400).json({ error: 'roleKey, pairId, rowType are required' });
  }

  const user = getCurrentUser(req);
  const superAdmins = getSuperAdmins();

  // In mock mode, allow any user to test the unlock flow
  if (!isMockMode() && !superAdmins.includes(user)) {
    return res.status(403).json({ error: 'Access denied. Super admin only.' });
  }

  if (!reason || reason.trim().length < 5) {
    return res.status(400).json({ error: 'A reason (minimum 5 characters) is required for unlock.' });
  }

  try {
    const result = await adminUnlockRow(roleKey, pairId, rowType, user, reason);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('[unlock]', err);
    return res.status(400).json({ error: err.message });
  }
}
