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
        // The template's profile columns. The launch screen subtracts the ones
        // the employee master can supply; whatever is left is typed by hand,
        // per the rule that anything in the template but not in the database is
        // editable. Identity columns are excluded — they come from the pair.
        profileCols: (Array.isArray(r.profileCols) ? r.profileCols : [])
          .filter((c) => (c.field_type || c.fieldType) !== 'identity')
          .map((c) => ({ key: c.key, label: c.label || c.key })),
      })),
    });
  } catch (err) {
    console.error('[admin/roles]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
