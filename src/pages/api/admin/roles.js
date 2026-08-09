/**
 * GET /api/admin/roles
 * Returns all role templates. Requires HR admin session.
 */
import { requireAuth } from '../../../lib/auth';
import { getAllRoles } from '../../../lib/queries';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = requireAuth(req, res);
  if (!user) return;

  try {
    const roles = await getAllRoles();
    return res.status(200).json({
      roles: roles.map((r) => ({
        roleKey:      r.roleKey,
        roleLabel:    r.roleLabel,
        templateType: r.templateType || 'STANDARD',
        includeSelf:  !!r.includeSelf,
        rmNameCol:    r.rmNameCol  || null,
        rmEmailCol:   r.rmEmailCol || null,
        bhNameCol:    r.bhNameCol  || null,
        bhEmailCol:   r.bhEmailCol || null,
        // Does this template run an HR-SPOC stage? The launch screen shows a
        // per-employee HR-SPOC picker only when it does. HR-HEAD and COTO are
        // one person per template and need no per-row control.
        hasHrSpocStage: Array.isArray(r.hrSpocFields) && r.hrSpocFields.length > 0,
        // Fallback used when no HR-SPOC is picked for a row.
        hrSpocDefaultName: r.hrSpocName || null,
      })),
    });
  } catch (err) {
    console.error('[admin/roles]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
