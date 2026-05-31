/**
 * GET /api/roles/[roleKey]/employees?cycle=Annual+2026
 * Returns employee rows (RM rows only) for the selected role and cycle.
 * Used by the Employee / Cycle Selection screen.
 */
import { getEmployeesForCycle } from '../../../../lib/workflow';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { roleKey, cycle } = req.query;

  if (!cycle) {
    return res.status(400).json({ error: 'cycle query parameter is required' });
  }

  try {
    const employees = await getEmployeesForCycle(roleKey, cycle);

    // Strip internal fields before sending to client
    const cleaned = employees.map(({ _rowNumber, _sheetGid, ...rest }) => rest);

    return res.status(200).json({ roleKey, cycle, employees: cleaned });
  } catch (err) {
    console.error('[employees]', err);
    return res.status(500).json({ error: err.message });
  }
}
