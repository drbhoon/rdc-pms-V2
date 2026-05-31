/**
 * /api/form/rm/[token]
 *
 * GET  — returns pair data, questions, and employee profile for the RM form
 * POST — submits RM answers and advances status to RM_SUBMITTED
 */
import {
  getPairByRmToken,
  getRole,
  submitRmAnswers,
  appendAudit,
  getOrCreateReviewerLink,
} from '../../../../lib/queries';
import { runInvitesWithTimeout } from '../../../../lib/invites';

export default async function handler(req, res) {
  const { token } = req.query;

  // ── GET ──────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const pair = await getPairByRmToken(token);
      if (!pair) return res.status(404).json({ error: 'Token not found' });

      const role = await getRole(pair.roleKey);
      // Normalise to camelCase for the form page
      const questions = (Array.isArray(role?.questions) ? role.questions : []).map((q) => ({
        key:       q.question_key  || q.key,
        label:     q.question_label || q.label,
        fieldType: q.field_type    || q.fieldType || 'rating',
        order:     q.display_order || q.order || 0,
      })).sort((a, b) => a.order - b.order);

      // Return safe pair fields — no bhToken
      const safePair = {
        pairId:    pair.pairId,
        empCode:   pair.empCode,
        empName:   pair.empName,
        roleKey:   pair.roleKey,
        cycle:     pair.cycle,
        rmName:    pair.rmName,
        bhName:    pair.bhName,
        status:    pair.status,
        rmAnswers: pair.rmAnswers || {},
      };

      // Fetch employee profile
      let rawProfileData = {};
      if (pair.employee) {
        rawProfileData = pair.employee.profileData || {};
      } else {
        try {
          const { prisma } = await import('../../../../lib/db');
          const emp = await prisma.employee.findUnique({
            where: { empCode_roleKey: { empCode: pair.empCode, roleKey: pair.roleKey } },
            select: { profileData: true },
          });
          if (emp) rawProfileData = emp.profileData || {};
        } catch { /* non-critical */ }
      }

      // Strip question columns + routing cols + XLSX empty placeholders from profile card
      const questionKeySet = new Set(questions.map((q) => q.key.toLowerCase().trim()));
      const routingCols = new Set(
        [role?.rmNameCol, role?.rmEmailCol, role?.bhNameCol, role?.bhEmailCol].filter(Boolean)
      );
      const profileData = Object.fromEntries(
        Object.entries(rawProfileData).filter(([k]) => {
          const kLower = k.toLowerCase().trim();
          // Strip: questions, routing cols, XLSX empty, and any numbered columns (1. ... 17. ...)
          return (
            !questionKeySet.has(kLower) &&
            !routingCols.has(k) &&
            !/^__EMPTY/.test(k) &&
            !/^\s*\d+[\.\)]\s/.test(k)  // numbered questions pattern
          );
        })
      );

      return res.status(200).json({ pair: safePair, questions, employee: { profileData } });
    } catch (err) {
      console.error('[form/rm GET]', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // ── POST ─────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { answers } = req.body || {};
    if (!answers || typeof answers !== 'object') {
      return res.status(400).json({ error: 'answers object is required' });
    }

    try {
      const pair = await getPairByRmToken(token);
      if (!pair) return res.status(404).json({ error: 'Token not found' });

      if (pair.status !== 'PENDING_RM') {
        return res.status(400).json({ error: 'Already submitted or locked' });
      }

      await submitRmAnswers(pair.pairId, answers, 'rm:' + pair.rmEmail);

      await appendAudit({
        action:      'RM_SUBMITTED',
        pairId:      pair.pairId,
        empCode:     pair.empCode,
        empName:     pair.empName,
        roleKey:     pair.roleKey,
        cycle:       pair.cycle,
        performedBy: 'rm:' + pair.rmEmail,
        details:     {},
      });

      // Ensure the BH reviewer-link exists, then await runInvites with a 12s
      // hard cap so the BH email actually fires before we tell the RM "thanks".
      // Anything that times out is picked up by the next cron tick.
      try {
        await getOrCreateReviewerLink(pair.bhEmail, 'BH', pair.roleKey, pair.cycle);
      } catch (e) {
        console.error('[form/rm] failed to ensure BH ReviewerLink:', e.message);
      }
      let inviteResult = null;
      try {
        inviteResult = await runInvitesWithTimeout(12000);
      } catch (e) {
        console.error('[form/rm] runInvites failed:', e.message);
      }

      return res.status(200).json({ ok: true, inviteResult });
    } catch (err) {
      console.error('[form/rm POST]', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
