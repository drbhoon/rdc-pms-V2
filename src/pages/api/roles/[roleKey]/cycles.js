/**
 * GET /api/roles/[roleKey]/cycles
 * Returns all unique cycles present in the role sheet.
 */
import { getCycles } from '../../../../lib/workflow';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { roleKey } = req.query;

  try {
    const cycles = await getCycles(roleKey);
    return res.status(200).json({ roleKey, cycles });
  } catch (err) {
    console.error('[cycles]', err);
    return res.status(500).json({ error: err.message });
  }
}
