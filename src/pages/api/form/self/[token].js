/**
 * /api/form/self/[token]
 *
 * GET  — returns pair data, the SUBSET of questions for self (excludeFromSelf=false),
 *        and employee profile.
 * POST — submits self answers, advances PENDING_SELF → PENDING_RM, fires the
 *        RM invite async so the RM gets emailed immediately.
 */
import {
  getPairBySelfToken,
  getRole,
  submitSelfAnswers,
  appendAudit,
  getOrCreateReviewerLink,
} from '../../../../lib/queries';
import { runInvitesWithTimeout } from '../../../../lib/invites';

export default async function handler(req, res) {
  const { token } = req.query;

  // ── GET ──────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const pair = await getPairBySelfToken(token);
      if (!pair) return res.status(404).json({ error: 'Token not found' });

      // Self-link is only valid for templates that opted in AND pairs that
      // were launched with requireSelf=true. A token that exists but isn't
      // valid for self should be rejected so the URL can't be guessed.
      if (!pair.requireSelf) {
        return res.status(404).json({ error: 'Self-assessment is not enabled for this assessment' });
      }

      const role = await getRole(pair.roleKey);

      // Normalise to camelCase + filter out questions flagged excludeFromSelf=true
      const questions = (Array.isArray(role?.questions) ? role.questions : [])
        .map((q) => ({
          key:             q.question_key  || q.key,
          label:           q.question_label || q.label,
          fieldType:       q.field_type    || q.fieldType || 'rating',
          order:           q.display_order || q.order || 0,
          excludeFromSelf: !!q.excludeFromSelf,
        }))
        .filter((q) => !q.excludeFromSelf)
        .sort((a, b) => a.order - b.order);

      // Return safe pair fields — no rmToken / bhToken
      const safePair = {
        pairId:      pair.pairId,
        empCode:     pair.empCode,
        empName:     pair.empName,
        roleKey:     pair.roleKey,
        cycle:       pair.cycle,
        status:      pair.status,
        selfAnswers: pair.selfAnswers || {},
      };

      // Fetch employee profile (same scrub as the RM form)
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

      // Strip question columns + routing + XLSX empty placeholders + numbered cols
      const fullQuestionKeySet = new Set(
        (Array.isArray(role?.questions) ? role.questions : [])
          .map((q) => String(q.question_key || q.key || '').toLowerCase().trim())
      );
      const routingCols = new Set(
        [role?.rmNameCol, role?.rmEmailCol, role?.bhNameCol, role?.bhEmailCol].filter(Boolean)
      );
      const profileData = Object.fromEntries(
        Object.entries(rawProfileData).filter(([k]) => {
          const kLower = k.toLowerCase().trim();
          return (
            !fullQuestionKeySet.has(kLower) &&
            !routingCols.has(k) &&
            !/^__EMPTY/.test(k) &&
            !/^\s*\d+[\.\)]\s/.test(k)
          );
        })
      );

      return res.status(200).json({ pair: safePair, questions, employee: { profileData } });
    } catch (err) {
      console.error('[form/self GET]', err);
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
      const pair = await getPairBySelfToken(token);
      if (!pair) return res.status(404).json({ error: 'Token not found' });
      if (!pair.requireSelf) {
        return res.status(404).json({ error: 'Self-assessment is not enabled for this assessment' });
      }
      if (pair.status !== 'PENDING_SELF') {
        return res.status(400).json({ error: 'Self-assessment already submitted' });
      }

      const performedBy = 'self:' + (pair.selfEmail || pair.empCode);

      await submitSelfAnswers(pair.pairId, answers, performedBy);

      await appendAudit({
        action:      'SELF_SUBMITTED',
        pairId:      pair.pairId,
        empCode:     pair.empCode,
        empName:     pair.empName,
        roleKey:     pair.roleKey,
        cycle:       pair.cycle,
        performedBy,
        details:     {},
      });

      // Ensure the RM ReviewerLink exists, then await runInvites with a 12s
      // hard cap so the RM email actually fires before the employee sees the
      // thank-you screen. Anything that times out is picked up by next cron.
      try {
        await getOrCreateReviewerLink(pair.rmEmail, 'RM', pair.roleKey, pair.cycle);
      } catch (e) {
        console.error('[form/self] failed to ensure RM ReviewerLink:', e.message);
      }
      let inviteResult = null;
      try {
        inviteResult = await runInvitesWithTimeout(12000);
      } catch (e) {
        console.error('[form/self] runInvites failed:', e.message);
      }

      return res.status(200).json({ ok: true, inviteResult });
    } catch (err) {
      console.error('[form/self POST]', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
