/**
 * GET /api/audit?roleKey=PI&limit=100
 * Returns audit log entries for a role.
 */
import { readAuditLog } from '../../../lib/audit';
import { getRoleConfig, isMockMode } from '../../../lib/roleConfig';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { roleKey, limit = '200' } = req.query;
  if (!roleKey) return res.status(400).json({ error: 'roleKey is required' });

  try {
    const spreadsheetId = isMockMode()
      ? 'mock'
      : getRoleConfig(roleKey)?.sheetId;

    if (!spreadsheetId) {
      return res.status(400).json({ error: `No sheet configured for role: ${roleKey}` });
    }

    const entries = await readAuditLog(spreadsheetId);
    // Return most recent first, limited
    const sorted = [...entries].reverse().slice(0, parseInt(limit));
    return res.status(200).json({ roleKey, entries: sorted, total: entries.length });
  } catch (err) {
    console.error('[audit]', err);
    return res.status(500).json({ error: err.message });
  }
}
