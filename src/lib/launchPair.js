/**
 * Launching one assessment pair — validation, creation, reviewer links, audit.
 *
 * Extracted from /api/admin/pairs/create so that the batch launch from the
 * employee master runs exactly the same rules. Two copies of "is BH set, is
 * this template FEEDBACK, which commenter stages are active" would drift, and
 * the failure mode is silent: pairs created that route nowhere.
 *
 * Throws LaunchError with a message written for HR, not for a log file.
 */
import { prisma } from './db';
import { createPair, appendAudit, getOrCreateReviewerLink } from './queries';

export class LaunchError extends Error {}

/**
 * @param {object} input
 * @param {object} input.role  the RoleTemplate, already loaded by the caller
 * @returns {Promise<object>} the created pair
 */
export async function launchPair({
  empCode, empName, roleKey, cycle,
  rmName, rmEmail, bhName, bhEmail,
  startOn, selectedBy, role,
  // HR-SPOC is routed PER EMPLOYEE, like RM and BH — a plant's SPOC differs
  // from the next plant's. HR-HEAD and COTO are single people for the whole
  // template, so they stay on the template. Pass {name, email} to override the
  // template's HR-SPOC for this one pair; the template value remains the
  // fallback, so templates configured before this still launch unchanged.
  hrSpocOverride = null,
}) {
  if (!empCode || !empName || !roleKey || !cycle) {
    throw new LaunchError('empCode, empName, roleKey and cycle are all required.');
  }
  if (!role) throw new LaunchError(`No template found for role "${roleKey}".`);

  // ── FEEDBACK: employee-only. Self submission finalises the pair. ──────────
  if (role.templateType === 'FEEDBACK') {
    const employee = await prisma.employee.findUnique({
      where: { empCode_roleKey: { empCode, roleKey } },
      select: { email: true, empName: true },
    });
    const email = employee?.email ? String(employee.email).trim().toLowerCase() : '';
    if (!email) {
      throw new LaunchError(
        `Feedback template "${roleKey}" needs an e-mail for ${empCode} (${empName}), and none is on file.`,
      );
    }
    const pair = await createPair({
      empCode, empName, roleKey, cycle,
      rmName: '', rmEmail: '', bhName: '', bhEmail: '',
      selectedBy, startOn: startOn || null,
      requireSelf: true, requireRm: false,
      selfEmail: email, selfName: employee?.empName || empName,
      templateType: 'FEEDBACK',
    });
    await getOrCreateReviewerLink(email, 'SELF', roleKey, cycle);
    await appendAudit({
      action: 'PAIR_CREATED', pairId: pair.pairId,
      empCode: pair.empCode, empName: pair.empName,
      roleKey: pair.roleKey, cycle: pair.cycle, performedBy: selectedBy,
      details: { templateType: 'FEEDBACK', requireSelf: true, selfEmail: email, startOn: startOn || null },
    });
    return pair;
  }

  // ── STANDARD / OJT: BH mandatory, RM optional. ───────────────────────────
  if (!bhName || !bhEmail) {
    throw new LaunchError(`${empName} (${empCode}) has no BH. No appraisal can run without one.`);
  }
  const requireRm = !!(String(rmName || '').trim() && String(rmEmail || '').trim());

  let requireSelf = false;
  let selfEmail = null;
  let selfName = null;
  if (role.includeSelf) {
    const employee = await prisma.employee.findUnique({
      where: { empCode_roleKey: { empCode, roleKey } },
      select: { email: true, empName: true },
    });
    const email = employee?.email ? String(employee.email).trim().toLowerCase() : '';
    if (!email) {
      throw new LaunchError(
        `Self-assessment is on for "${roleKey}", but ${empName} (${empCode}) has no e-mail on file.`,
      );
    }
    requireSelf = true;
    selfEmail = email;
    selfName = employee?.empName || empName;
  }

  // A commenter stage is active iff it has at least one field AND a routing
  // e-mail. Fields without an e-mail is a half-configured template: fail the
  // launch rather than create pairs that stall after BH with nowhere to go.
  const hasFields = (arr) => Array.isArray(arr) && arr.length > 0;
  const stageConfig = [
    {
      key: 'hrSpoc', label: 'HR-SPOC', fields: role.hrSpocFields,
      // Per-employee value wins; the template's is the fallback.
      email: hrSpocOverride?.email || role.hrSpocEmail,
      name:  hrSpocOverride?.name  || role.hrSpocName,
      perEmployee: true,
    },
    { key: 'hrHead', label: 'HR-HEAD', fields: role.hrHeadFields, email: role.hrHeadEmail, name: role.hrHeadName },
    { key: 'coto',   label: 'COTO',    fields: role.cotoFields,   email: role.cotoEmail,   name: role.cotoName   },
  ];
  const stages = {};
  for (const s of stageConfig) {
    const fieldsDefined = hasFields(s.fields);
    const emailSet = !!(s.email && String(s.email).trim());
    if (fieldsDefined && !emailSet) {
      throw new LaunchError(
        s.perEmployee
          ? `${empName} (${empCode}) has no ${s.label}, and template "${roleKey}" has no fallback ${s.label} either. Pick one for this employee, or set a default in Setup.`
          : `Template "${roleKey}" defines ${s.label} fields but has no ${s.label} e-mail. Set it in Setup, then launch again.`,
      );
    }
    stages[s.key] = {
      active: fieldsDefined && emailSet,
      name: s.name ? String(s.name).trim() : null,
      email: emailSet ? String(s.email).trim().toLowerCase() : null,
    };
  }

  const pair = await createPair({
    empCode, empName, roleKey, cycle,
    rmName:  requireRm ? rmName  : '',
    rmEmail: requireRm ? rmEmail : '',
    bhName, bhEmail,
    selectedBy, startOn: startOn || null,
    requireSelf, requireRm,
    templateType: role.templateType || 'STANDARD',
    selfEmail, selfName,
    hrSpoc: stages.hrSpoc, hrHead: stages.hrHead, coto: stages.coto,
  });

  // Pre-create the link the invite path will need. With an RM that is the RM's;
  // without one the pair starts at RM_SUBMITTED, so the BH link is created here
  // because the RM-submit path that normally creates it never runs.
  if (requireRm) {
    await getOrCreateReviewerLink(rmEmail, 'RM', roleKey, cycle);
  } else {
    await getOrCreateReviewerLink(bhEmail, 'BH', roleKey, cycle);
  }
  if (requireSelf) {
    await getOrCreateReviewerLink(selfEmail, 'SELF', roleKey, cycle);
  }

  await appendAudit({
    action: 'PAIR_CREATED', pairId: pair.pairId,
    empCode: pair.empCode, empName: pair.empName,
    roleKey: pair.roleKey, cycle: pair.cycle, performedBy: selectedBy,
    details: {
      rmName: requireRm ? rmName : '', rmEmail: requireRm ? rmEmail : '',
      bhName, bhEmail, startOn: startOn || null,
      requireSelf, requireRm,
      ...(requireSelf ? { selfEmail } : {}),
      requireHrSpoc: stages.hrSpoc.active,
      requireHrHead: stages.hrHead.active,
      requireCoto:   stages.coto.active,
    },
  });

  return pair;
}
