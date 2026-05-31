/**
 * GET /api/admin/reports?roleKey=X&cycle=Y           → active pairs
 * GET /api/admin/reports?roleKey=X&cycle=Y&archived=1 → archived pairs
 * GET /api/admin/reports?roleKey=X&archived=1         → all archived (any cycle)
 */
import { requireAuth } from '../../../lib/auth';
import { getRole } from '../../../lib/queries';
import { prisma } from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = requireAuth(req, res);
  if (!user) return;

  const { roleKey, cycle, archived } = req.query;
  const isArchived = archived === '1';

  if (!roleKey) return res.status(400).json({ error: 'roleKey is required' });
  if (!isArchived && !cycle) return res.status(400).json({ error: 'cycle is required for active reports' });

  try {
    const where = isArchived
      ? { roleKey, isArchived: true, ...(cycle ? { cycle } : {}) }
      : { roleKey, cycle, isArchived: false };

    const [role, pairs] = await Promise.all([
      getRole(roleKey),
      prisma.assessmentPair.findMany({
        where,
        include: { employee: { select: { profileData: true } }, hrReviews: true },
        orderBy: { empCode: 'asc' },
      }),
    ]);

    if (!role) return res.status(404).json({ error: 'Role template not found' });

    // Normalize questions to camelCase
    const questions = (Array.isArray(role.questions) ? role.questions : []).map((q) => ({
      key:             q.question_key  || q.key,
      label:           q.question_label || q.label,
      fieldType:       q.field_type    || q.fieldType || 'rating',
      order:           q.display_order || q.order || 0,
      excludeFromSelf: !!q.excludeFromSelf,
    })).sort((a, b) => a.order - b.order);

    // Profile columns — union of (template-declared profileCols) + (any extra keys
    // actually present in employee profileData for this role). Guarantees HR sees
    // every basic data column they uploaded, even if the template classifier missed it.
    //
    // Normalize aggressively to alphanumeric uppercase so "Sr No.", "Sr_No",
    // "S.No", "SR NO", "SrNo" all collapse to the same canonical form (SRNO).
    const normKey = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const IDENTITY_KEYS_NORM = new Set([
      'EMPCODE', 'EMPNAME', 'ROLE', 'CYCLE',
      'SRNO', 'SNO', 'SERIALNO', 'SERIAL', 'SLNO',
    ]);
    const questionKeysNorm = new Set(questions.map((q) => normKey(q.key)));
    const routingColsNorm = new Set(
      [role.rmNameCol, role.rmEmailCol, role.bhNameCol, role.bhEmailCol]
        .filter(Boolean)
        .map(normKey)
    );

    const isSkippable = (rawKey) => {
      const n = normKey(rawKey);
      if (!n) return true;
      if (IDENTITY_KEYS_NORM.has(n)) return true;
      if (routingColsNorm.has(n)) return true;
      if (questionKeysNorm.has(n)) return true;
      const k = String(rawKey);
      if (/^__EMPTY/.test(k)) return true;
      if (/^\s*\d+[\.\)]\s/.test(k)) return true; // numbered question like "1. ..."
      return false;
    };

    // 1) Start with template-declared profileCols (preserves user-defined order)
    const profileColMap = new Map();
    for (const c of (Array.isArray(role.profileCols) ? role.profileCols : [])) {
      const key = c.key;
      if (!key || isSkippable(key)) continue;
      profileColMap.set(key, {
        key,
        label: c.label || key,
        fieldType: c.field_type || c.fieldType || 'profile',
      });
    }
    // 2) Append any extra keys present in pair profileData that weren't in template
    for (const p of pairs) {
      const pd = p.employee?.profileData || {};
      for (const k of Object.keys(pd)) {
        if (profileColMap.has(k)) continue;
        if (isSkippable(k)) continue;
        profileColMap.set(k, { key: k, label: k, fieldType: 'profile' });
      }
    }
    const profileCols = Array.from(profileColMap.values());

    // Normalize an HR field-definition array to { key, label }.
    const normHrFields = (arr) => (Array.isArray(arr) ? arr : [])
      .map((f) => ({ key: f.key || f.question_key, label: f.label || f.question_label || f.key }))
      .filter((f) => f.key);
    const hrFieldDefs = {
      hrSpoc: normHrFields(role.hrSpocFields),
      hrHead: normHrFields(role.hrHeadFields),
      coto:   normHrFields(role.cotoFields),
    };

    const rows = pairs.map((p) => {
      const pd = p.employee?.profileData || {};
      // Flatten hrReviews → { HR_SPOC: {fieldValues}, HR_HEAD: {...}, COTO: {...} }
      const hrReviews = {};
      for (const rev of (p.hrReviews || [])) {
        hrReviews[rev.role] = rev.fields || {};
      }
      return {
        pairId:    p.pairId,
        empCode:   p.empCode,
        empName:   p.empName,
        rmName:    p.rmName,
        rmEmail:   p.rmEmail,
        bhName:    p.bhName,
        bhEmail:   p.bhEmail,
        status:    p.status,
        lockStatus: p.lockStatus,
        selectedOn: p.selectedOn,
        rmSubmittedOn:   p.rmSubmittedOn,
        bhSubmittedOn:   p.bhSubmittedOn,
        selfSubmittedOn: p.selfSubmittedOn,
        requireSelf:     !!p.requireSelf,
        requireHrSpoc:   !!p.requireHrSpoc,
        requireHrHead:   !!p.requireHrHead,
        requireCoto:     !!p.requireCoto,
        selfEmail:       p.selfEmail,
        selfName:        p.selfName,
        isArchived:   p.isArchived,
        archivedOn:   p.archivedOn,
        archivedBy:   p.archivedBy,
        profileData: pd,
        rmAnswers:   p.rmAnswers   || {},
        bhAnswers:   p.bhAnswers   || {},
        selfAnswers: p.selfAnswers || {},
        hrReviews,
      };
    });

    return res.status(200).json({
      questions,
      profileCols,
      rows,
      hrFieldDefs,
      role: { roleKey: role.roleKey, roleLabel: role.roleLabel }
    });
  } catch (err) {
    console.error('[reports GET]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
