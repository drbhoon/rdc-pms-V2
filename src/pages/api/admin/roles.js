/**
 * GET /api/admin/roles
 * Returns all role templates. Requires HR admin session.
 */
import { requireAuth } from '../../../lib/auth';
import { getAllRoles } from '../../../lib/queries';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = requireAuth(req, res);
  if (!user) return;

  try {
    const roles = await getAllRoles();
    return res.status(200).json({
      roles: roles.map((r) => ({
        roleKey:    r.roleKey,
        roleLabel:  r.roleLabel,
        rmNameCol:  r.rmNameCol  || null,
        rmEmailCol: r.rmEmailCol || null,
        bhNameCol:  r.bhNameCol  || null,
        bhEmailCol: r.bhEmailCol || null,
      })),
    });
  } catch (err) {
    console.error('[admin/roles]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
