/**
 * GET /api/assessment/pair?roleKey=PI&pairId=EMP001_PI_2026_Annual_0001
 * Returns both RM and BH rows for an assessment pair (for form pre-fill).
 */
import { getRoleRows } from '../../../lib/workflow';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { roleKey, pairId } = req.query;
  if (!roleKey || !pairId) {
    return res.status(400).json({ error: 'roleKey and pairId are required' });
  }

  try {
    const { rows, headers } = await getRoleRows(roleKey);
    const pair = rows.filter((r) => r.ASSESSMENT_PAIR_ID === pairId);
    const rm = pair.find((r) => r.ROW_TYPE === 'RM');
    const bh = pair.find((r) => r.ROW_TYPE === 'BH');

    if (!rm) return res.status(404).json({ error: `No RM row found for pairId: ${pairId}` });

    // Strip internal fields
    const clean = (r) => { if (!r) return null; const { _rowNumber, _sheetGid, ...rest } = r; return rest; };

    return res.status(200).json({ roleKey, pairId, rm: clean(rm), bh: clean(bh), headers });
  } catch (err) {
    console.error('[pair]', err);
    return res.status(500).json({ error: err.message });
  }
}
