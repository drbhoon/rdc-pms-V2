/**
 * GET /api/dashboard?roleKey=PI
 * Returns pending/finalized lists for the dashboard.
 */
import { getDashboardData } from '../../../lib/workflow';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { roleKey } = req.query;
  if (!roleKey) return res.status(400).json({ error: 'roleKey is required' });

  try {
    const data = await getDashboardData(roleKey);
    // Strip internal fields
    const clean = (arr) =>
      arr.map(({ _rowNumber, _sheetGid, ...rest }) => rest);

    return res.status(200).json({
      roleKey,
      pendingRm:   clean(data.pendingRm),
      selected:    clean(data.selected),
      pendingBh:   clean(data.pendingBh),
      rmSubmitted: clean(data.rmSubmitted),
      finalized:   clean(data.finalized),
      counts: {
        pendingRm:   data.pendingRm.length,
        selected:    data.selected.length,
        pendingBh:   data.pendingBh.length,
        rmSubmitted: data.rmSubmitted.length,
        finalized:   data.finalized.length,
      },
    });
  } catch (err) {
    console.error('[dashboard]', err);
    return res.status(500).json({ error: err.message });
  }
}
