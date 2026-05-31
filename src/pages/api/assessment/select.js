/**
 * POST /api/assessment/select
 * Toggle selection of an employee-cycle row.
 *
 * Body: { roleKey, pairId }
 * Headers: x-pms-user (current HR user)
 */
import { toggleSelection } from '../../../lib/workflow';
import { getCurrentUser } from '../../../lib/roleConfig';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { roleKey, pairId } = req.body;
  if (!roleKey || !pairId) {
    return res.status(400).json({ error: 'roleKey and pairId are required' });
  }

  const user = getCurrentUser(req);

  try {
    const result = await toggleSelection(roleKey, pairId, user);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('[select]', err);
    return res.status(400).json({ error: err.message });
  }
}
