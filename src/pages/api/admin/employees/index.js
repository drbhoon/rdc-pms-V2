/**
 * GET /api/admin/employees?roleKey=X          → active employees
 * GET /api/admin/employees?roleKey=X&archived=1 → archived employees
 */
import { requireAuth } from '../../../../lib/auth';
import { getEmployeesByRole, getArchivedEmployees } from '../../../../lib/queries';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = requireAuth(req, res);
  if (!user) return;

  const { roleKey, archived } = req.query;
  if (!roleKey) return res.status(400).json({ error: 'roleKey is required' });

  try {
    const employees = archived === '1'
      ? await getArchivedEmployees(roleKey)
      : await getEmployeesByRole(roleKey);
    return res.status(200).json({ employees });
  } catch (err) {
    console.error('[employees/index]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
