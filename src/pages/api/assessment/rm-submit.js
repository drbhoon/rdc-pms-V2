/**
 * POST /api/assessment/rm-submit
 * Submits the RM assessment for a given pair.
 *
 * Body: {
 *   roleKey,
 *   pairId,
 *   values: { RECOMMENDATION, COMMENTS, GROWTH_POTENTIAL, Q1_RATING, Q1_COMMENT, ... }
 * }
 * Headers: x-pms-user
 */
import { submitRmAssessment } from '../../../lib/workflow';
import { getCurrentUser } from '../../../lib/roleConfig';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { roleKey, pairId, values } = req.body;

  if (!roleKey || !pairId || !values) {
    return res.status(400).json({ error: 'roleKey, pairId, and values are required' });
  }

  const user = getCurrentUser(req);

  try {
    const result = await submitRmAssessment(roleKey, pairId, values, user);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('[rm-submit]', err);
    return res.status(400).json({ error: err.message });
  }
}
