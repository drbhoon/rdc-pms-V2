/**
 * POST /api/admin/pairs/create
 * Creates a new assessment pair. Requires HR admin session.
 *
 * If the underlying template has includeSelf=true, the pair is created with
 * requireSelf=true and starts at PENDING_SELF. The employee's email is
 * captured at this moment from Employee.email — the launch fails with a
 * clear error if the employee has no email on file.
 *
 * Email is NOT sent from here. The cron endpoint (`/api/cron/invites-and-reminders`)
 * and Cycle Management's auto-fire path both invoke runInvites() which discovers
 * pending pairs and sends one batch email per reviewer (SELF/RM/BH).
 */
import { requireAuth } from '../../../../lib/auth';
import {
  createPair,
  appendAudit,
  getOrCreateReviewerLink,
  getRole,
} from '../../../../lib/queries';
import { prisma } from '../../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = requireAuth(req, res);
  if (!user) return;

  const {
    empCode, empName, roleKey, cycle,
    rmName, rmEmail, bhName, bhEmail,
    startOn,
  } = req.body || {};

  if (!empCode || !empName || !roleKey || !cycle || !rmName || !rmEmail || !bhName || !bhEmail) {
    return res.status(400).json({ error: 'empCode, empName, roleKey, cycle, rmName, rmEmail, bhName, bhEmail are all required' });
  }

  try {
    // ── Check template — does it require self-assessment? ─────────────────
    const role = await getRole(roleKey);
    if (!role) return res.status(400).json({ error: `No template found for role "${roleKey}".` });

    let requireSelf = false;
    let selfEmail = null;
    let selfName  = null;
    if (role.includeSelf) {
      const employee = await prisma.employee.findUnique({
        where: { empCode_roleKey: { empCode, roleKey } },
        select: { email: true, empName: true },
      });
      const email = employee?.email ? String(employee.email).trim().toLowerCase() : '';
      if (!email) {
        return res.status(400).json({
          error: `Self-assessment is enabled for template "${roleKey}", but employee ${empCode} (${empName}) has no EMP_EMAIL on file. Re-upload the Employees Excel with an EMP_EMAIL column for this employee, then launch again.`,
        });
      }
      requireSelf = true;
      selfEmail = email;
      selfName = employee?.empName || empName;
    }

    // ── V2: determine which post-BH commenter stages are active ──────────
    // A stage is active iff the template has at least one field defined for
    // it AND a routing email set. Routing is template-level (same for every
    // employee under this template). If fields exist but the email is missing,
    // fail the launch with a clear message so HR fixes the template first.
    const hasFields = (arr) => Array.isArray(arr) && arr.length > 0;
    const stageConfig = [
      { key: 'hrSpoc', label: 'HR-SPOC', fields: role.hrSpocFields, email: role.hrSpocEmail, name: role.hrSpocName },
      { key: 'hrHead', label: 'HR-HEAD', fields: role.hrHeadFields, email: role.hrHeadEmail, name: role.hrHeadName },
      { key: 'coto',   label: 'COTO',    fields: role.cotoFields,   email: role.cotoEmail,   name: role.cotoName   },
    ];
    const stages = {};
    for (const s of stageConfig) {
      const fieldsDefined = hasFields(s.fields);
      const emailSet = !!(s.email && String(s.email).trim());
      if (fieldsDefined && !emailSet) {
        return res.status(400).json({
          error: `Template "${roleKey}" defines ${s.label} fields but has no ${s.label} email set. Add the ${s.label} routing email in Setup, then launch again.`,
        });
      }
      stages[s.key] = {
        active: fieldsDefined && emailSet,
        name:   s.name ? String(s.name).trim() : null,
        email:  emailSet ? String(s.email).trim().toLowerCase() : null,
      };
    }

    const pair = await createPair({
      empCode,
      empName,
      roleKey,
      cycle,
      rmName,
      rmEmail,
      bhName,
      bhEmail,
      selectedBy: user.email,
      startOn: startOn || null,
      requireSelf,
      selfEmail,
      selfName,
      hrSpoc: stages.hrSpoc,
      hrHead: stages.hrHead,
      coto:   stages.coto,
    });

    // Pre-create the appropriate ReviewerLink so the cron / async invite path
    // already has a token ready. RM link is always created (it'll be needed
    // either now or after self submission). SELF link is created only when
    // requireSelf=true. HR commenter dashboard links are created lazily by
    // runInvites when their stage becomes due.
    await getOrCreateReviewerLink(rmEmail, 'RM', roleKey, cycle);
    if (requireSelf) {
      await getOrCreateReviewerLink(selfEmail, 'SELF', roleKey, cycle);
    }

    await appendAudit({
      action:      'PAIR_CREATED',
      pairId:      pair.pairId,
      empCode:     pair.empCode,
      empName:     pair.empName,
      roleKey:     pair.roleKey,
      cycle:       pair.cycle,
      performedBy: user.email,
      details:     {
        rmName, rmEmail, bhName, bhEmail,
        startOn: startOn || null,
        requireSelf,
        ...(requireSelf ? { selfEmail } : {}),
        requireHrSpoc: stages.hrSpoc.active,
        requireHrHead: stages.hrHead.active,
        requireCoto:   stages.coto.active,
      },
    });

    return res.status(201).json({ pair });
  } catch (err) {
    console.error('[pairs/create]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
