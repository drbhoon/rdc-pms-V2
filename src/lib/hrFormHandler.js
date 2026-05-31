/**
 * hrFormHandler.js — shared GET/POST handler factory for the three HR
 * commenter forms (HR_SPOC, HR_HEAD, COTO). Each route file does:
 *
 *   export default makeHrFormHandler('HR_SPOC');
 *
 * GET  — returns the read-only candidate ratings (Self/RM/BH), any earlier
 *        HR comments (cumulative), this role's editable field definitions,
 *        and any already-saved values.
 * POST — { fields } → validates status, saves via submitHrReview (which
 *        advances the pair + locks if last stage), audits, and fires the
 *        next reviewer's invite.
 */
import {
  getHrReviewByToken,
  submitHrReview,
  appendAudit,
  HR_ORDER,
} from './queries';
import { runInvitesWithTimeout } from './invites';

const FIELDS_KEY = { HR_SPOC: 'hrSpocFields', HR_HEAD: 'hrHeadFields', COTO: 'cotoFields' };
const AUDIT_ACTION = {
  HR_SPOC: 'HR_SPOC_SUBMITTED',
  HR_HEAD: 'HR_HEAD_SUBMITTED',
  COTO:    'COTO_SUBMITTED',
};

// Normalise a field-definition array (template hr*Fields) to camelCase.
function normFields(arr) {
  return (Array.isArray(arr) ? arr : [])
    .map((f) => ({
      key:       f.key || f.question_key,
      label:     f.label || f.question_label || f.key,
      fieldType: f.fieldType || f.field_type || 'narrative',
      order:     f.order ?? f.display_order ?? 0,
      options:   Array.isArray(f.options) ? f.options : undefined,
    }))
    .filter((f) => f.key)
    .sort((a, b) => a.order - b.order);
}

// Normalise the standard assessment questions (for the read-only rating panel).
function normQuestions(arr) {
  return (Array.isArray(arr) ? arr : [])
    .map((q) => ({
      key:       q.question_key  || q.key,
      label:     q.question_label || q.label,
      fieldType: q.field_type    || q.fieldType || 'rating',
      order:     q.display_order || q.order || 0,
    }))
    .filter((q) => q.key)
    .sort((a, b) => a.order - b.order);
}

// Is this HR stage active on the pair?
function stageActive(pair, role) {
  if (role === 'HR_SPOC') return !!pair.requireHrSpoc;
  if (role === 'HR_HEAD') return !!pair.requireHrHead;
  if (role === 'COTO')    return !!pair.requireCoto;
  return false;
}

// Have BH + every earlier active HR stage completed? (so this role may act)
function readyForRole(pair, role) {
  if (!pair.bhSubmittedOn) return false;
  const idx = HR_ORDER.indexOf(role);
  for (let i = 0; i < idx; i++) {
    const r = HR_ORDER[i];
    if (!stageActive(pair, r)) continue;
    const rev = (pair.hrReviews || []).find((x) => x.role === r);
    if (!rev || !rev.submittedOn) return false;
  }
  return true;
}

export function makeHrFormHandler(role) {
  return async function handler(req, res) {
    const { token } = req.query;

    // ── GET ────────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      try {
        const found = await getHrReviewByToken(token);
        if (!found || found.review.role !== role) {
          return res.status(404).json({ error: 'Link not found' });
        }
        const { review, pair, template } = found;

        // Build read-only candidate ratings (the standard Self/RM/BH answers).
        const questions = normQuestions(template?.questions);

        // This role's editable fields.
        const fields = normFields(template?.[FIELDS_KEY[role]]);

        // Earlier HR stages' comments, cumulative (read-only). For HR_SPOC this
        // is empty; HR_HEAD sees HR_SPOC; COTO sees HR_SPOC + HR_HEAD.
        const priorHr = [];
        const idx = HR_ORDER.indexOf(role);
        for (let i = 0; i < idx; i++) {
          const r = HR_ORDER[i];
          if (!stageActive(pair, r)) continue;
          const rev = (pair.hrReviews || []).find((x) => x.role === r);
          if (!rev) continue;
          priorHr.push({
            role: r,
            name: rev.name || null,
            fields: normFields(template?.[FIELDS_KEY[r]]),
            values: rev.fields || {},
            submittedOn: rev.submittedOn,
          });
        }

        // Scrub the employee profile card (same rules as the BH form).
        const rawProfileData = pair.employee?.profileData || {};
        const questionKeySet = new Set(questions.map((q) => q.key.toLowerCase().trim()));
        const routingCols = new Set(
          [template?.rmNameCol, template?.rmEmailCol, template?.bhNameCol, template?.bhEmailCol].filter(Boolean)
        );
        const profileData = Object.fromEntries(
          Object.entries(rawProfileData).filter(([k]) => {
            const kLower = k.toLowerCase().trim();
            return (
              !questionKeySet.has(kLower) &&
              !routingCols.has(k) &&
              !/^__EMPTY/.test(k) &&
              !/^\s*\d+[\.\)]\s/.test(k)
            );
          })
        );

        const safePair = {
          pairId:    pair.pairId,
          empCode:   pair.empCode,
          empName:   pair.empName,
          roleKey:   pair.roleKey,
          cycle:     pair.cycle,
          status:    pair.status,
          rmName:    pair.rmName,
          bhName:    pair.bhName,
        };

        return res.status(200).json({
          role,
          pair: safePair,
          // read-only candidate ratings
          questions,
          readonly: {
            requireSelf: !!pair.requireSelf,
            selfAnswers: pair.requireSelf ? (pair.selfAnswers || {}) : null,
            rmAnswers:   pair.rmAnswers || {},
            bhAnswers:   pair.bhAnswers || {},
          },
          priorHr,
          fields,
          existing: review.fields || {},
          alreadySubmitted: !!review.submittedOn,
          ready: readyForRole(pair, role),
          employee: { profileData },
        });
      } catch (err) {
        console.error(`[form/${role} GET]`, err);
        return res.status(500).json({ error: 'Internal server error' });
      }
    }

    // ── POST ───────────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const { fields } = req.body || {};
      if (!fields || typeof fields !== 'object') {
        return res.status(400).json({ error: 'fields object is required' });
      }
      try {
        const found = await getHrReviewByToken(token);
        if (!found || found.review.role !== role) {
          return res.status(404).json({ error: 'Link not found' });
        }
        const { review, pair } = found;

        if (review.submittedOn) {
          return res.status(400).json({ error: 'Already submitted' });
        }
        if (!readyForRole(pair, role)) {
          return res.status(400).json({ error: 'Not ready for this stage yet' });
        }

        const performedBy = `${role.toLowerCase()}:${review.email || pair.empCode}`;
        const { status, locked } = await submitHrReview(pair.pairId, role, fields, performedBy);

        await appendAudit({
          action:      AUDIT_ACTION[role],
          pairId:      pair.pairId,
          empCode:     pair.empCode,
          empName:     pair.empName,
          roleKey:     pair.roleKey,
          cycle:       pair.cycle,
          performedBy,
          details:     { nextStatus: status, finalized: locked },
        });

        // Fire the next reviewer's invite (if any) before returning, capped at
        // 12s. If nothing is pending, this is a no-op. Anything slow is caught
        // by the next cron tick.
        let inviteResult = null;
        try {
          inviteResult = await runInvitesWithTimeout(12000);
        } catch (e) {
          console.error(`[form/${role}] runInvites failed:`, e.message);
        }

        return res.status(200).json({ ok: true, finalized: locked, inviteResult });
      } catch (err) {
        console.error(`[form/${role} POST]`, err);
        return res.status(500).json({ error: 'Internal server error' });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
  };
}
