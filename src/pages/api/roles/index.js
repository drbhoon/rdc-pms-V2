/**
 * GET /api/roles
 * Returns the list of configured roles.
 */
import { getRoleConfigs, isMockMode } from '../../../lib/roleConfig';

export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const roles = getRoleConfigs().map((r) => ({
    key: r.key,
    label: r.label,
    hasSheet: !!r.sheetId || isMockMode(),
  }));

  return res.status(200).json({ roles });
}
