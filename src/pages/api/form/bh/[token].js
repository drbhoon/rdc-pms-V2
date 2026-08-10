/**
 * /api/form/bh/[token]
 *
 * GET  — returns pair data (including rmAnswers), questions, and employee profile for the BH form
 * POST — submits BH answers; if the template has post-BH commenter stages, the
 *        pair advances to BH_SUBMITTED and the HR-SPOC invite is fired; otherwise
 *        it finalises.
 */
import { getPairByBhToken, getRole, submitBhAnswers, appendAudit } from '../../../../lib/queries';
import { runInvitesWithTimeout } from '../../../../lib/invites';
import { questionAudience, isReservedColumnKey } from '../../../../lib/ojt';

export default async function handler(req, res) {
  const { token } = req.query;

  // ── GET ──────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const pair = await getPairByBhToken(token);
      if (!pair) return res.status(404).json({ error: 'Token not found' });

      const role = await getRole(pair.roleKey);
      const isOjt = role?.templateType === 'OJT';

      // Normalise ALL questions (with audience).
      const allQuestions = (Array.isArray(role?.questions) ? role.questions : []).map((q) => ({
        key:       q.question_key  || q.key,
        label:     q.question_label || q.label,
        fieldType: q.field_type    || q.fieldType || 'rating',
        order:     q.display_order || q.order || 0,
        options:    Array.isArray(q.options) ? q.options : undefined,
        allowOther: !!q.allowOther,
        audience:   q.audience || questionAudience(q),
      })).sort((a, b) => a.order - b.order);

      // The BH edits only BH-audience questions in OJT; all questions otherwise.
      const questions = (isOjt ? allQuestions.filter((q) => q.audience === 'BH') : allQuestions)
        .map(({ key, label, fieldType, order, options, allowOther }) => ({ key, label, fieldType, order, options: options || null, allowOther }));

      // Earlier stages are shown to the BH read-only, in BOTH flavours.
      //
      // OJT: each role answered a different set, so the employee's and the RM's
      // own questions are listed separately. STANDARD: all three answer the
      // same set, so only the employee's self-assessment is listed here — the
      // RM's ratings already arrive pre-filled into the BH's own fields, which
      // the BH can accept or change, so repeating them read-only would be
      // confusing rather than helpful.
      //
      // Each stage is included only when that stage actually produced answers:
      // Self is optional (requireSelf) and the RM stage can be skipped entirely
      // (requireRm), and an empty panel is just noise.
      const selfAnswers = pair.selfAnswers || {};
      const rmAnswers   = pair.rmAnswers   || {};
      const employeeQuestions = isOjt
        ? allQuestions.filter((q) => q.audience === 'EMPLOYEE')
        : allQuestions;

      const priorStages = [];
      if (Object.keys(selfAnswers).length) {
        priorStages.push({
          label: 'Employee Responses', accent: 'EMPLOYEE',
          items: employeeQuestions.map((q) => ({ label: q.label, value: selfAnswers[q.key] })),
        });
      }
      if (isOjt && Object.keys(rmAnswers).length) {
        priorStages.push({
          // Label is what the reviewer reads; accent is the internal role key.
          label: 'Level 1 Responses', accent: 'RM',
          items: allQuestions.filter((q) => q.audience === 'RM')
            .map((q) => ({ label: q.label, value: rmAnswers[q.key] })),
        });
      }

      // Return safe pair fields — include rmAnswers for BH reference, no rmToken
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
        bhAnswers: pair.bhAnswers || {},
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
      console.error('[form/bh GET]', err);
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
      const pair = await getPairByBhToken(token);
      if (!pair) return res.status(404).json({ error: 'Token not found' });

      if (pair.status !== 'RM_SUBMITTED') {
        return res.status(400).json({ error: 'Not ready for BH review' });
      }

      // submitBhAnswers advances to BH_SUBMITTED (if any commenter stage is
      // active) or FINALIZED (if none). Capture the result to know which.
      const updated = await submitBhAnswers(pair.pairId, answers, 'bh:' + pair.bhEmail);
      const finalized = updated?.status === 'FINALIZED';

      await appendAudit({
        action:      'BH_SUBMITTED',
        pairId:      pair.pairId,
        empCode:     pair.empCode,
        empName:     pair.empName,
        roleKey:     pair.roleKey,
        cycle:       pair.cycle,
        performedBy: 'bh:' + pair.bhEmail,
        details:     { nextStatus: updated?.status, finalized },
      });

      // If a commenter stage follows (not finalised), fire the next reviewer's
      // invite now (12s cap) so HR-SPOC is emailed immediately rather than
      // waiting for the next cron tick. No-op when finalised.
      let inviteResult = null;
      if (!finalized) {
        try {
          inviteResult = await runInvitesWithTimeout(12000);
        } catch (e) {
          console.error('[form/bh] runInvites failed:', e.message);
        }
      }

      return res.status(200).json({ ok: true, finalized, inviteResult });
    } catch (err) {
      console.error('[form/bh POST]', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
