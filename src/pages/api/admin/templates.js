/**
 * GET    /api/admin/templates        — list all role templates
 * POST   /api/admin/templates        — create or update a role template
 * DELETE /api/admin/templates?key=X  — delete a role template by roleKey
 */
import { requireAuth } from '../../../lib/auth';
import { getAllRoles, upsertRole, deleteRole } from '../../../lib/queries';

// Allow larger payloads — Excel-derived templates with many questions and
// long labels can exceed Next.js's default 1 MB limit.
export const config = {
  api: { bodyParser: { sizeLimit: '2mb' } },
};

export default async function handler(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;

  // ── GET ──
  if (req.method === 'GET') {
    try {
      const roles = await getAllRoles();
      return res.status(200).json({ roles });
    } catch (err) {
      console.error('[templates GET]', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // ── POST (create / update) ──
  if (req.method === 'POST') {
    const {
      roleKey, roleLabel, questions,
      filename, profileCols,
      rmNameCol, rmEmailCol, bhNameCol, bhEmailCol,
      includeSelf,
      // V2 commenter routing + field definitions
      hrSpocName, hrSpocEmail, hrHeadName, hrHeadEmail, cotoName, cotoEmail,
      hrSpocFields, hrHeadFields, cotoFields,
    } = req.body || {};

    if (!roleKey || !roleLabel)
      return res.status(400).json({ error: 'roleKey and roleLabel are required' });
    if (!Array.isArray(questions))
      return res.status(400).json({ error: 'questions must be an array' });

    try {
      const role = await upsertRole(roleKey, roleLabel, questions, {
        filename, profileCols, rmNameCol, rmEmailCol, bhNameCol, bhEmailCol, includeSelf,
        hrSpocName, hrSpocEmail, hrHeadName, hrHeadEmail, cotoName, cotoEmail,
        hrSpocFields, hrHeadFields, cotoFields,
      });
      return res.status(200).json({ role });
    } catch (err) {
      console.error('[templates POST]', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // ── DELETE (soft delete) ──
  // Flips isActive=false on the template. History rows (Employee, AssessmentPair,
  // AuditLog) continue to FK-resolve against this row — archived reports still work.
  if (req.method === 'DELETE') {
    const { key } = req.query;
    if (!key) return res.status(400).json({ error: 'key query param required' });
    try {
      await deleteRole(key);
      return res.status(200).json({ ok: true, softDeleted: true });
    } catch (err) {
      console.error('[templates DELETE] code:', err?.code, 'msg:', err?.message);
      if (err?.code === 'P2025')
        return res.status(404).json({ error: 'Template not found' });
      return res.status(500).json({ error: `Delete failed: ${err?.message || 'Unknown error'}` });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
