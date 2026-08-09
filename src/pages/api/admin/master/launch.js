/**
 * POST /api/admin/master/launch
 *
 * Launch a cycle straight from the shared employee master — no spreadsheet.
 *
 * body: {
 *   roleKey, cycle, startOn?,
 *   rows: [{ empCode, rmCode?, bhCode }]
 * }
 *
 * HR picks people and their RM/BH by NAME in the console; only codes travel.
 * Names and e-mail addresses are resolved here, from the master, so a wrong
 * address cannot be introduced by a typo or a stale browser tab — and a wrong
 * reviewer address is the failure that matters, because the invite simply goes
 * nowhere and the cycle stalls silently.
 *
 * Two steps per row: upsert the person into PARAKH's own Employee table (which
 * AssessmentPair has a foreign key to), then launch the pair through the same
 * lib/launchPair used by the single-pair endpoint.
 */
import { requireAuth } from '../../../../lib/auth';
import { getRole, upsertEmployee, appendAudit } from '../../../../lib/queries';
import { launchPair, LaunchError } from '../../../../lib/launchPair';
import { fetchMasterEmployees, byCode, masterConfigured } from '../../../../lib/master';

// Profile fields copied from the master onto the PARAKH employee record, so
// the assessment forms can show who this person is. Deliberately a fixed list:
// everything else in the master is either identity or routing.
const PROFILE_FIELDS = ['designation', 'location', 'city', 'cost_centre', 'company', 'date_of_joining'];

/** "Date of Joining", "date_of_joining" and "DATE-OF-JOINING" all fold together. */
const foldKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Write master values under the TEMPLATE's column name wherever the two refer
 * to the same thing.
 *
 * Without this the report gets both "Designation" (from the uploaded Excel,
 * empty because nothing fills it) and "designation" (from the master,
 * populated) — two columns for one fact, one of them always blank. Template
 * columns with no counterpart in the master, like Scheme or Stream, are left
 * alone: they are the editable-at-launch fields, per the rule that anything in
 * the template but not in the database is entered by hand.
 */
function profileForTemplate(employee, role) {
  const templateKeys = new Map(
    (Array.isArray(role?.profileCols) ? role.profileCols : [])
      .map((c) => [foldKey(c.key || c), c.key || c]),
  );
  const out = {};
  for (const field of PROFILE_FIELDS) {
    const value = employee[field];
    if (value === null || value === undefined || value === '') continue;
    out[templateKeys.get(foldKey(field)) || field] = value;
  }
  return out;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = requireAuth(req, res);
  if (!user) return;

  if (!masterConfigured()) {
    return res.status(503).json({ error: 'The employee master is not configured for this deployment.' });
  }

  const { roleKey, cycle, startOn, rows } = req.body || {};
  if (!roleKey || !cycle) return res.status(400).json({ error: 'roleKey and cycle are required.' });
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'Select at least one employee.' });
  }

  try {
    const role = await getRole(roleKey);
    if (!role) return res.status(400).json({ error: `No template found for role "${roleKey}".` });

    const isFeedback = role.templateType === 'FEEDBACK';

    // BH is checked up front, before anything is written. Discovering a missing
    // BH on row 20 of 25 would leave a half-launched cycle that HR then has to
    // unpick by hand.
    if (!isFeedback) {
      const missing = rows.filter((r) => !r.bhCode).map((r) => r.empCode);
      if (missing.length) {
        return res.status(400).json({
          error: `No BH selected for ${missing.length} employee${missing.length === 1 ? '' : 's'}: `
               + `${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}. `
               + 'No appraisal can run without a BH.',
        });
      }
    }

    // One round trip for everybody involved — employees and their reviewers.
    const wanted = new Set();
    for (const r of rows) {
      if (r.empCode) wanted.add(r.empCode);
      if (r.rmCode) wanted.add(r.rmCode);
      if (r.bhCode) wanted.add(r.bhCode);
    }
    const master = byCode(await fetchMasterEmployees({ codes: [...wanted] }));

    const unknown = [...wanted].filter((c) => !master.has(c));
    if (unknown.length) {
      return res.status(400).json({
        error: `Not found in the employee master: ${unknown.slice(0, 5).join(', ')}`
             + `${unknown.length > 5 ? ` and ${unknown.length - 5} more` : ''}. `
             + 'The master may have refreshed since this page was opened — reload and try again.',
      });
    }

    // A reviewer with no e-mail cannot be invited. Caught here rather than at
    // send time, when the pair already exists and nobody is watching.
    const noEmail = [];
    for (const r of rows) {
      for (const code of [r.rmCode, r.bhCode].filter(Boolean)) {
        const person = master.get(code);
        if (!person?.official_email_id) noEmail.push(`${person?.employee_name || code} (${code})`);
      }
    }
    if (noEmail.length) {
      return res.status(400).json({
        error: `These reviewers have no e-mail address on file, so they could never be invited: `
             + `${[...new Set(noEmail)].slice(0, 5).join('; ')}.`,
      });
    }

    const created = [];
    const failed = [];

    for (const row of rows) {
      const employee = master.get(row.empCode);
      const rm = row.rmCode ? master.get(row.rmCode) : null;
      const bh = row.bhCode ? master.get(row.bhCode) : null;

      try {
        // The pair's foreign key points at Employee, so the person must exist
        // in PARAKH before the pair can. This upsert is what replaces the
        // Employees spreadsheet.
        await upsertEmployee(
          employee.employee_code,
          employee.employee_name,
          roleKey,
          profileForTemplate(employee, role),
          employee.official_email_id || null,
        );

        const pair = await launchPair({
          empCode: employee.employee_code,
          empName: employee.employee_name,
          roleKey, cycle, startOn,
          rmName:  rm?.employee_name || '',
          rmEmail: rm?.official_email_id || '',
          bhName:  bh?.employee_name || '',
          bhEmail: bh?.official_email_id || '',
          selectedBy: user.email,
          role,
        });
        created.push({ empCode: employee.employee_code, empName: employee.employee_name, pairId: pair.pairId });
      } catch (err) {
        // One bad row must not abandon the other 24. Everything that succeeded
        // stays; the failures come back named so HR can fix and re-run.
        const message = err instanceof LaunchError ? err.message : 'Unexpected error while launching.';
        if (!(err instanceof LaunchError)) console.error('[master/launch]', row.empCode, err);
        failed.push({ empCode: row.empCode, empName: employee?.employee_name || row.empCode, error: message });
      }
    }

    await appendAudit({
      action: 'CYCLE_LAUNCHED_FROM_MASTER',
      pairId: null, empCode: null, empName: null,
      roleKey, cycle, performedBy: user.email,
      details: { requested: rows.length, created: created.length, failed: failed.length },
    });

    return res.status(created.length ? 201 : 400).json({
      created: created.length,
      failed: failed.length,
      createdRows: created,
      failedRows: failed,
    });
  } catch (err) {
    console.error('[master/launch]', err);
    return res.status(500).json({ error: err?.message || 'Internal server error' });
  }
}
