/**
 * POST /api/assessment/new-cycle
 * Creates a new RM row for an employee in a new or repeat cycle.
 *
 * Body: { roleKey, empCode, empName, cycle, rmName, rmEmail, bhName, bhEmail }
 */
import { createNewCycleRow } from '../../../lib/workflow';
import { getCurrentUser } from '../../../lib/roleConfig';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { roleKey, empCode, empName, cycle, rmName, rmEmail, bhName, bhEmail } = req.body;

  if (!roleKey || !empCode || !empName || !cycle) {
    return res.status(400).json({ error: 'roleKey, empCode, empName, cycle are required' });
  }

  const user = getCurrentUser(req);

  try {
    const result = await createNewCycleRow(roleKey, { empCode, empName, cycle, rmName, rmEmail, bhName, bhEmail }, user);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('[new-cycle]', err);
    return res.status(400).json({ error: err.message });
  }
}
