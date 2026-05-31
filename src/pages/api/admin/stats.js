/**
 * GET /api/admin/stats?roleKey=X&cycle=Y
 * Returns dashboard statistics for a given role + cycle.
 */
import { requireAuth } from '../../../lib/auth';
import { getDashboardStats } from '../../../lib/queries';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = requireAuth(req, res);
  if (!user) return;

  const { roleKey, cycle } = req.query;
  if (!roleKey || !cycle) return res.status(400).json({ error: 'roleKey and cycle are required' });

  try {
    const stats = await getDashboardStats(roleKey, cycle);
    return res.status(200).json(stats);
  } catch (err) {
    console.error('[admin/stats]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
