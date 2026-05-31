/**
 * GET /api/admin/audit?roleKey=X&cycle=Y&limit=N
 * Returns filtered audit log entries. Requires HR admin session.
 */
import { requireAuth } from '../../../lib/auth';
import { getAuditLog } from '../../../lib/queries';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = requireAuth(req, res);
  if (!user) return;

  const { roleKey, cycle, limit } = req.query;
  const parsedLimit = limit ? parseInt(limit, 10) : 100;

  try {
    const entries = await getAuditLog({
      roleKey: roleKey || undefined,
      cycle:   cycle   || undefined,
      limit:   isNaN(parsedLimit) ? 100 : parsedLimit,
    });
    return res.status(200).json({ entries });
  } catch (err) {
    console.error('[admin/audit]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
