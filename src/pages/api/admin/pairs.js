/**
 * GET /api/admin/pairs?roleKey=X&cycle=Y
 * Returns all assessment pairs for a given role + cycle.
 */
import { requireAuth } from '../../../lib/auth';
import { getPairsByRoleAndCycle } from '../../../lib/queries';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = requireAuth(req, res);
  if (!user) return;

  const { roleKey, cycle } = req.query;
  if (!roleKey || !cycle) return res.status(400).json({ error: 'roleKey and cycle are required' });

  try {
    const rows = await getPairsByRoleAndCycle(roleKey, cycle);

    const hrTok = (p, role) => {
      const r = (p.hrReviews || []).find((x) => x.role === role);
      return r ? { token: r.token, submittedOn: r.submittedOn } : null;
    };

    const pairs = rows.map((p) => ({
      pairId:        p.pairId,
      empCode:       p.empCode,
      empName:       p.empName,
      rmName:        p.rmName,
      bhName:        p.bhName,
      status:        p.status,
      lockStatus:    p.lockStatus,
      rmToken:       p.rmToken,
      bhToken:       p.bhToken,
      requireSelf:   !!p.requireSelf,
      selfToken:     p.requireSelf ? p.selfToken : null,
      selfName:      p.selfName,
      // V2 commenter stages
      requireHrSpoc: !!p.requireHrSpoc,
      requireHrHead: !!p.requireHrHead,
      requireCoto:   !!p.requireCoto,
      hrSpoc:        hrTok(p, 'HR_SPOC'),
      hrHead:        hrTok(p, 'HR_HEAD'),
      coto:          hrTok(p, 'COTO'),
      lastUpdatedBy: p.lastUpdatedBy,
      lastUpdatedOn: p.lastUpdatedOn,
    }));

    return res.status(200).json({ pairs });
  } catch (err) {
    console.error('[admin/pairs]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
