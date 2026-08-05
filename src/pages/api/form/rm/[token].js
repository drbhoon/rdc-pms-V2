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
import { questionAudience, isReservedColumnKey } from '../../../../lib/ojt';

export default async function handler(req, res) {
  const { token } = req.query;

  // ── GET ──────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const pair = await getPairByRmToken(token);
      if (!pair) return res.status(404).json({ error: 'Token not found' });

      const role = await getRole(pair.roleKey);
      const isOjt = role?.templateType === 'OJT';

      // Normalise ALL questions (with audience) to camelCase.
      const allQuestions = (Array.isArray(role?.questions) ? role.questions : []).map((q) => ({
        key:       q.question_key  || q.key,
        label:     q.question_label || q.label,
        fieldType: q.field_type    || q.fieldType || 'rating',
        order:     q.display_order || q.order || 0,
        options:    Array.isArray(q.options) ? q.options : undefined,
        allowOther: !!q.allowOther,
        audience:   q.audience || questionAudience(q),
      })).sort((a, b) => a.order - b.order);

      // The RM edits only RM-audience questions in OJT; all questions otherwise.
      const questions = (isOjt ? allQuestions.filter((q) => q.audience === 'RM') : allQuestions)
        .map(({ key, label, fieldType, order, options, allowOther }) => ({ key, label, fieldType, order, options: options || null, allowOther }));

      // The employee's self-assessment is shown to the RM read-only — visible,
      // never editable — in BOTH template flavours.
      //
      // OJT: the employee answered a different set, so their own questions are
      // listed. STANDARD: all three answer the SAME set, so the employee's
      // answers appear against those same questions, giving the RM the
      // self-rating to compare against while entering their own.
      //
      // Only rendered when a self-assessment actually happened: the stage is
      // optional (requireSelf), and an empty panel is just noise.
      const selfAnswers = pair.selfAnswers || {};
      const employeeQuestions = isOjt
        ? allQuestions.filter((q) => q.audience === 'EMPLOYEE')
        : allQuestions;
      const priorStages = Object.keys(selfAnswers).length ? [{
        label: 'Employee Responses',
        accent: 'EMPLOYEE',
        items: employeeQuestions.map((q) => ({ label: q.label, value: selfAnswers[q.key] })),
      }] : [];

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

      // Strip ALL question columns (every audience) + routing + XLSX placeholders from profile card
      const questionKeySet = new Set(allQuestions.map((q) => q.key.toLowerCase().trim()));
      const routingCols = new Set(
        [role?.rmNameCol, role?.rmEmailCol, role?.bhNameCol, role?.bhEmailCol].filter(Boolean)
      );
      const profileData = Object.fromEntries(
        Object.entries(rawProfileData).filter(([k]) => {
          const kLower = k.toLowerCase().trim();
          // Strip: questions (all audiences), routing cols, and any reserved
          // question-like columns (numbered, RM_/BH_, HR_SPOC_/HR_HEAD_/COTO_).
          return (
            !questionKeySet.has(kLower) &&
            !routingCols.has(k) &&
            !isReservedColumnKey(k)
          );
        })
      );

      return res.status(200).json({ pair: safePair, questions, employee: { profileData }, isOjt, priorStages });
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
