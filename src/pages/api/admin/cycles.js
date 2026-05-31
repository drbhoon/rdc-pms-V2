/**
 * GET /api/admin/cycles?roleKey=X
 * Returns available assessment cycles for a given role.
 */
import { requireAuth } from '../../../lib/auth';
import { getCyclesByRole } from '../../../lib/queries';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = requireAuth(req, res);
  if (!user) return;

  const { roleKey } = req.query;
  if (!roleKey) return res.status(400).json({ error: 'roleKey is required' });

  try {
    const cycles = await getCyclesByRole(roleKey);
    return res.status(200).json({ cycles });
  } catch (err) {
    console.error('[admin/cycles]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
