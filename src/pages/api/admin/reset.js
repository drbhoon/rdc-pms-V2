/**
 * POST /api/admin/reset
 *
 * ⚠ DESTRUCTIVE — wipes EVERY non-auth row in the database. Used during the
 * testing phase to scrub any junk HR creates while exploring the system.
 * Will be removed before production rollout.
 *
 * Guards:
 *   - Super Admin only.
 *   - Body must contain { confirm: 'WIPE ALL DATA' } typed exactly.
 *   - HrUser table is preserved so the super admin can still log in afterward.
 *
 * Wipes (in dependency order):
 *   AuditLog → HrReview → AssessmentPair → ReviewerLink → Employee → RoleTemplate
 */
import { requireSuperAdmin } from '../../../lib/auth';
import { prisma } from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = requireSuperAdmin(req, res);
  if (!user) return;

  const { confirm } = req.body || {};
  if (confirm !== 'WIPE ALL DATA') {
    return res.status(400).json({
      error: 'Confirmation phrase mismatch. Body must contain { confirm: "WIPE ALL DATA" } exactly.',
    });
  }

  const before = {};
  const after  = {};
  try {
    // Snapshot counts BEFORE wipe so the response can show what was cleared.
    [
      before.auditLog,
      before.hrReview,
      before.assessmentPair,
      before.reviewerLink,
      before.employee,
      before.roleTemplate,
      before.hrUser,
    ] = await Promise.all([
      prisma.auditLog.count(),
      prisma.hrReview.count(),
      prisma.assessmentPair.count(),
      prisma.reviewerLink.count(),
      prisma.employee.count(),
      prisma.roleTemplate.count(),
      prisma.hrUser.count(),
    ]);

    // FK-safe order: children → parents. HrReview FK-references AssessmentPair,
    // so it must be deleted before the pairs (alongside AuditLog).
    await prisma.$transaction([
      prisma.auditLog.deleteMany({}),
      prisma.hrReview.deleteMany({}),
      prisma.assessmentPair.deleteMany({}),
      prisma.reviewerLink.deleteMany({}),
      prisma.employee.deleteMany({}),
      prisma.roleTemplate.deleteMany({}),
    ]);

    [
      after.auditLog,
      after.hrReview,
      after.assessmentPair,
      after.reviewerLink,
      after.employee,
      after.roleTemplate,
      after.hrUser,
    ] = await Promise.all([
      prisma.auditLog.count(),
      prisma.hrReview.count(),
      prisma.assessmentPair.count(),
      prisma.reviewerLink.count(),
      prisma.employee.count(),
      prisma.roleTemplate.count(),
      prisma.hrUser.count(),
    ]);

    console.log(`[admin/reset] ALL DATA wiped by ${user.email}`, { before, after });

    return res.status(200).json({
      ok: true,
      wipedBy: user.email,
      wipedAt: new Date().toISOString(),
      before,
      after,
      preserved: { hrUser: after.hrUser },
    });
  } catch (err) {
    console.error('[admin/reset]', err);
    return res.status(500).json({ error: err.message || 'Reset failed' });
  }
}
