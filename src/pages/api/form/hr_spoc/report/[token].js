/**
 * GET /api/form/hr_spoc/report/[token]
 *
 * Token-gated one-pair Excel download for the HR-SPOC commenter, so they can
 * circulate the candidate's Self/RM/BH ratings (plus any HR comments already
 * filled) offline with HR-HEAD / COTO. Reuses the shared report builder.
 *
 * (Path is /report/[token] — not /[token]/report — because Next.js cannot have
 * both a `[token].js` file and a `[token]/` directory in the same folder.)
 */
import * as XLSX from 'xlsx';
import { getHrReviewByToken } from '../../../../../lib/queries';
import { buildReportWorkbook, reportFilename } from '../../../../../lib/reportXlsx';

export default async function handler(req, res) {
  const { token } = req.query;

  const found = await getHrReviewByToken(token);
  if (!found || found.review.role !== 'HR_SPOC') {
    return res.status(404).json({ error: 'Link not found' });
  }
  const { pair, template } = found;

  try {
    // Normalise questions + profile cols the same way the admin report does.
    const questions = (Array.isArray(template?.questions) ? template.questions : [])
      .map((q) => ({
        key:             q.question_key  || q.key,
        label:           q.question_label || q.label,
        excludeFromSelf: !!q.excludeFromSelf,
        order:           q.display_order || q.order || 0,
      }))
      .filter((q) => q.key)
      .sort((a, b) => a.order - b.order);

    const normKey = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const IDENT = new Set(['EMPCODE', 'EMPNAME', 'ROLE', 'CYCLE', 'SRNO', 'SNO', 'SERIALNO', 'SERIAL', 'SLNO']);
    const qNorm = new Set(questions.map((q) => normKey(q.key)));
    const routeNorm = new Set([template?.rmNameCol, template?.rmEmailCol, template?.bhNameCol, template?.bhEmailCol].filter(Boolean).map(normKey));
    const pd = pair.employee?.profileData || {};
    const profileCols = Object.keys(pd)
      .filter((k) => {
        const n = normKey(k);
        return n && !IDENT.has(n) && !qNorm.has(n) && !routeNorm.has(n) && !/^__EMPTY/.test(k) && !/^\s*\d+[\.\)]\s/.test(k);
      })
      .map((k) => ({ key: k, label: k }));

    const normHrFields = (arr) => (Array.isArray(arr) ? arr : [])
      .map((f) => ({ key: f.key || f.question_key, label: f.label || f.question_label || f.key }))
      .filter((f) => f.key);
    const hrFieldDefs = {
      hrSpoc: normHrFields(template?.hrSpocFields),
      hrHead: normHrFields(template?.hrHeadFields),
      coto:   normHrFields(template?.cotoFields),
    };

    const hrReviews = {};
    for (const rev of (pair.hrReviews || [])) hrReviews[rev.role] = rev.fields || {};

    const row = {
      empCode: pair.empCode, empName: pair.empName,
      rmName: pair.rmName, rmEmail: pair.rmEmail,
      bhName: pair.bhName, bhEmail: pair.bhEmail,
      status: pair.status,
      requireSelf: !!pair.requireSelf,
      selfSubmittedOn: pair.selfSubmittedOn,
      rmSubmittedOn:   pair.rmSubmittedOn,
      bhSubmittedOn:   pair.bhSubmittedOn,
      profileData: pd,
      selfAnswers: pair.selfAnswers || {},
      rmAnswers:   pair.rmAnswers   || {},
      bhAnswers:   pair.bhAnswers   || {},
      hrReviews,
    };

    const wb = buildReportWorkbook({
      roleLabel: template?.roleLabel || pair.roleKey,
      cycle: pair.cycle,
      questions, profileCols, rows: [row], hrFieldDefs,
    });
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

    const fname = `${pair.empCode}_${reportFilename(template?.roleLabel || pair.roleKey, pair.cycle)}`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    return res.status(200).send(buf);
  } catch (err) {
    console.error('[form/hr_spoc report]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
