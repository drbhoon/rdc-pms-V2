/**
 * queries.js — All database operations for the PMS.
 * Thin wrapper around Prisma — keeps API routes clean.
 */
import { prisma } from './db';
import { generatePairId } from './pairId';

// ── V2 post-BH commenter stage helpers ───────────────────────────────────────
// The three commenter stages run in this order after BH. Each is optional
// per template (snapshotted onto the pair as requireHr* flags at launch).
export const HR_ORDER = ['HR_SPOC', 'HR_HEAD', 'COTO'];

// Is a given HR stage active on this pair?
function hrStageActive(pair, role) {
  if (role === 'HR_SPOC') return !!pair.requireHrSpoc;
  if (role === 'HR_HEAD') return !!pair.requireHrHead;
  if (role === 'COTO')    return !!pair.requireCoto;
  return false;
}

// Is the BH stage behind this pair? Normally that means BH has submitted. A
// pair launched without a BH (requireBh=false) has no BH stage, so it is
// behind it as soon as the RM submits. The ONE place this rule lives: the
// invite query, the commenter forms and the reviewer dashboard all ask here.
export function bhStageDone(pair) {
  if (pair?.requireBh === false) return !!pair.rmSubmittedOn;
  return !!pair?.bhSubmittedOn;
}

// Has every ACTIVE stage before `role` been completed? (BH must be done too.)
// `pair` must include its `hrReviews`. Robust to skipped stages.
function priorStagesComplete(pair, role) {
  if (!bhStageDone(pair)) return false;
  const idx = HR_ORDER.indexOf(role);
  for (let i = 0; i < idx; i++) {
    const r = HR_ORDER[i];
    if (!hrStageActive(pair, r)) continue;
    const review = (pair.hrReviews || []).find((x) => x.role === r);
    if (!review || !review.submittedOn) return false;
  }
  return true;
}

// Is `role` the last active commenter stage on this pair?
function isLastActiveStage(pair, role) {
  const idx = HR_ORDER.indexOf(role);
  for (let i = idx + 1; i < HR_ORDER.length; i++) {
    if (hrStageActive(pair, HR_ORDER[i])) return false;
  }
  return true;
}

// Does this pair have ANY active commenter stage?
function hasAnyHrStage(pair) {
  return HR_ORDER.some((r) => hrStageActive(pair, r));
}

// Given the stage that just completed, return { status, locked } for the pair.
// `stage` is 'BH' | 'HR_SPOC' | 'HR_HEAD' | 'COTO'.
function nextStateAfter(stage, pair) {
  if (stage === 'BH') {
    return hasAnyHrStage(pair)
      ? { status: 'BH_SUBMITTED', locked: false }
      : { status: 'FINALIZED',    locked: true };
  }
  // HR stage: if it's the last active one, finalize; else mark its _SUBMITTED.
  if (isLastActiveStage(pair, stage)) {
    return { status: 'FINALIZED', locked: true };
  }
  const marker = stage === 'HR_SPOC' ? 'HR_SPOC_SUBMITTED'
               : stage === 'HR_HEAD' ? 'HR_HEAD_SUBMITTED'
               : 'BH_SUBMITTED';
  return { status: marker, locked: false };
}

// ── Role Templates ─────────────────────────────────────────────────────────

export async function getAllRoles({ includeInactive = false } = {}) {
  return prisma.roleTemplate.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: { roleKey: 'asc' },
  });
}

// Always returns the template even if inactive — archived reports, form GETs,
// and audit log lookups still need to resolve a roleKey after soft-delete.
export async function getRole(roleKey) {
  return prisma.roleTemplate.findUnique({ where: { roleKey } });
}

export async function upsertRole(roleKey, roleLabel, questions, opts = {}) {
  const {
    filename, profileCols, rmNameCol, rmEmailCol, bhNameCol, bhEmailCol, includeSelf, templateType,
    // V2 commenter routing + field definitions
    hrSpocName, hrSpocEmail, hrHeadName, hrHeadEmail, cotoName, cotoEmail,
    hrSpocFields, hrHeadFields, cotoFields,
  } = opts;
  const data = {
    roleLabel, questions,
    ...(filename    !== undefined && { filename }),
    ...(profileCols !== undefined && { profileCols }),
    ...(rmNameCol   !== undefined && { rmNameCol }),
    ...(rmEmailCol  !== undefined && { rmEmailCol }),
    ...(bhNameCol   !== undefined && { bhNameCol }),
    ...(bhEmailCol  !== undefined && { bhEmailCol }),
    ...(includeSelf !== undefined && { includeSelf: !!includeSelf }),
    ...(templateType !== undefined && { templateType: templateType || 'STANDARD' }),
    // V2: persist commenter routing (null-able strings) + field def arrays
    ...(hrSpocName   !== undefined && { hrSpocName }),
    ...(hrSpocEmail  !== undefined && { hrSpocEmail }),
    ...(hrHeadName   !== undefined && { hrHeadName }),
    ...(hrHeadEmail  !== undefined && { hrHeadEmail }),
    ...(cotoName     !== undefined && { cotoName }),
    ...(cotoEmail    !== undefined && { cotoEmail }),
    ...(hrSpocFields !== undefined && { hrSpocFields }),
    ...(hrHeadFields !== undefined && { hrHeadFields }),
    ...(cotoFields   !== undefined && { cotoFields }),
  };
  return prisma.roleTemplate.upsert({
    where:  { roleKey },
    update: data,
    create: { roleKey, ...data },
  });
}

// Soft delete — flips isActive=false so the template vanishes from dropdowns
// but history (employees, pairs, audit log, archived reports) stays intact.
// Super Admin can reactivate via DB or a future restore endpoint.
export async function deleteRole(roleKey) {
  return prisma.roleTemplate.update({
    where: { roleKey },
    data:  { isActive: false },
  });
}

export async function reactivateRole(roleKey) {
  return prisma.roleTemplate.update({
    where: { roleKey },
    data:  { isActive: true },
  });
}

// ── Employees ──────────────────────────────────────────────────────────────

export async function getEmployeesByRole(roleKey) {
  return prisma.employee.findMany({
    where:   { roleKey, isActive: true },
    orderBy: { empCode: 'asc' },
  });
}

/**
 * Employees Cycle Management should offer for one specific cycle: people
 * tagged to this cycle (uploaded for it, so they're launch candidates) OR
 * people who already have a pair in this cycle (so a cycle you launched
 * before this field existed, or one someone revisits later, still shows its
 * existing progress). A person tagged to a DIFFERENT cycle who has no pair
 * here is excluded — that's the fix: cycles no longer accumulate every past
 * upload forever.
 */
export async function getEmployeesForCycleManagement(roleKey, cycle) {
  return prisma.employee.findMany({
    where: {
      roleKey,
      isActive: true,
      OR: [
        { cycle },
        { pairs: { some: { roleKey, cycle } } },
      ],
    },
    orderBy: { empCode: 'asc' },
  });
}

export async function getArchivedEmployees(roleKey) {
  return prisma.employee.findMany({
    where:   { roleKey, isActive: false },
    orderBy: { empCode: 'asc' },
  });
}

export async function archiveEmployee(empCode, roleKey, performedBy) {
  await prisma.$transaction([
    prisma.employee.update({
      where: { empCode_roleKey: { empCode, roleKey } },
      data:  { isActive: false },
    }),
    prisma.assessmentPair.updateMany({
      where: { empCode, roleKey },
      data:  { isArchived: true, archivedOn: new Date(), archivedBy: performedBy },
    }),
  ]);
}

export async function restoreEmployee(empCode, roleKey) {
  await prisma.$transaction([
    prisma.employee.update({
      where: { empCode_roleKey: { empCode, roleKey } },
      data:  { isActive: true },
    }),
    prisma.assessmentPair.updateMany({
      where: { empCode, roleKey },
      data:  { isArchived: false, archivedOn: null, archivedBy: null },
    }),
  ]);
}

/**
 * Assessments that are still in flight for this employee — anything not
 * finalised and not archived. Used to decide whether the employee can be
 * deleted: erasing someone mid-cycle would invalidate links already sitting in
 * their reviewers' inboxes.
 */
export async function getLiveAssessments(empCode, roleKey) {
  return prisma.assessmentPair.findMany({
    where:   { empCode, roleKey, isArchived: false, status: { not: 'FINALIZED' } },
    select:  { pairId: true, cycle: true, status: true },
    orderBy: { cycle: 'asc' },
  });
}

export async function deleteEmployee(empCode, roleKey) {
  // Dependency order: HR reviews → audit logs → pairs → employee.
  //
  // HrReview was missing here. It carries a foreign key to
  // AssessmentPair.pairId, so any pair launched under a template with an
  // active HR-SPOC / HR-HEAD / COTO stage left orphan rows behind and the pair
  // delete died on a constraint violation — which is all the console showed.
  // Templates without those stages have no HrReview rows, which is why Delete
  // appeared to work for some employees and not others.
  //
  // One transaction: a failure part-way through would otherwise strip the
  // audit trail off assessments that then survive.
  const pairs = await prisma.assessmentPair.findMany({
    where:  { empCode, roleKey },
    select: { pairId: true },
  });
  const pairIds = pairs.map((p) => p.pairId);

  const ops = [];
  if (pairIds.length) {
    ops.push(prisma.hrReview.deleteMany({ where: { pairId: { in: pairIds } } }));
    ops.push(prisma.auditLog.deleteMany({ where: { pairId: { in: pairIds } } }));
    ops.push(prisma.assessmentPair.deleteMany({ where: { pairId: { in: pairIds } } }));
  }
  ops.push(prisma.employee.delete({ where: { empCode_roleKey: { empCode, roleKey } } }));

  await prisma.$transaction(ops);
  return { pairsDeleted: pairIds.length };
}

/**
 * @param {string|null} source 'hris' when the record came from the ZingHR
 *   employee master, 'manual' for an Employees-tab upload. Pass null to leave
 *   an existing record's source alone — re-uploading a spreadsheet should not
 *   quietly reclassify somebody the master owns.
 */
export async function upsertEmployee(empCode, empName, roleKey, profileData = {}, email = null, source = null, cycle = undefined) {
  return prisma.employee.upsert({
    where:  { empCode_roleKey: { empCode, roleKey } },
    update: {
      empName, profileData,
      ...(email !== undefined ? { email } : {}),
      ...(source ? { source } : {}),
      ...(cycle !== undefined ? { cycle } : {}),
    },
    create: { empCode, empName, roleKey, profileData, email, source: source || 'manual', cycle: cycle || null },
  });
}

export async function bulkUpsertEmployees(rows) {
  // rows: [{ empCode, empName, roleKey, profileData, email?, cycle? }]
  // Retags cycle on every re-upload — a person re-added for a later cycle
  // becomes a candidate for that cycle, not the one they were first added to.
  return prisma.$transaction(rows.map((r) =>
    prisma.employee.upsert({
      where:  { empCode_roleKey: { empCode: r.empCode, roleKey: r.roleKey } },
      update: {
        empName: r.empName,
        profileData: r.profileData,
        ...(r.email !== undefined ? { email: r.email } : {}),
        ...(r.cycle !== undefined ? { cycle: r.cycle } : {}),
      },
      create: r,
    })
  ));
}

// ── Assessment Pairs ───────────────────────────────────────────────────────

// Newest launch first, so a cycle that was just launched is at the top of
// the dashboard rather than scattered through it by employee code.
export const NEWEST_FIRST = [{ selectedOn: 'desc' }, { createdAt: 'desc' }, { empCode: 'asc' }];

export async function getPairsByRoleAndCycle(roleKey, cycle) {
  return prisma.assessmentPair.findMany({
    where:   { roleKey, cycle },
    orderBy: NEWEST_FIRST,
    include: { employee: { select: { profileData: true } }, hrReviews: true },
  });
}

export async function getPairById(pairId) {
  return prisma.assessmentPair.findUnique({ where: { pairId } });
}

/** A pair with its HR commenter rows and the employee profile (for e-mails). */
export async function getPairWithReviews(pairId) {
  return prisma.assessmentPair.findUnique({
    where:   { pairId },
    include: { hrReviews: true, employee: { select: { profileData: true } } },
  });
}

/**
 * The HR commenter stage this pair is waiting on now — 'HR_SPOC', 'HR_HEAD'
 * or 'COTO' — with its HrReview row, or null when it is not with HR (still
 * with Self/RM/BH, or finalised). `pair` must include its hrReviews.
 */
export function pendingHrStage(pair) {
  if (!pair || pair.status === 'FINALIZED') return null;
  for (const role of HR_ORDER) {
    if (!hrStageActive(pair, role)) continue;
    if (!priorStagesComplete(pair, role)) return null;
    const review = (pair.hrReviews || []).find((r) => r.role === role);
    if (review && !review.submittedOn) return { role, review };
  }
  return null;
}

export async function getPairByRmToken(rmToken) {
  return prisma.assessmentPair.findUnique({
    where:   { rmToken },
    include: { role: true, hrReviews: true },
  });
}

export async function getPairByBhToken(bhToken) {
  return prisma.assessmentPair.findUnique({
    where:   { bhToken },
    include: { role: true, hrReviews: true },
  });
}

export async function getPairBySelfToken(selfToken) {
  return prisma.assessmentPair.findUnique({
    where:   { selfToken },
    include: { role: true, hrReviews: true },
  });
}

// V2: resolve an HR commenter form token → { review, pair, template }.
// The pair includes all its hrReviews (for cumulative read-only + ordering)
// and the employee profileData (for the read-only candidate panel).
export async function getHrReviewByToken(token) {
  const review = await prisma.hrReview.findUnique({ where: { token } });
  if (!review) return null;
  const pair = await prisma.assessmentPair.findUnique({
    where:   { pairId: review.pairId },
    include: {
      role: true,
      hrReviews: true,
      employee: { select: { profileData: true } },
    },
  });
  if (!pair) return null;
  return { review, pair, template: pair.role };
}

export async function createPair({
  empCode, empName, roleKey, cycle,
  rmName, rmEmail, bhName, bhEmail,
  selectedBy, startOn,
  requireSelf = false, selfEmail = null, selfName = null,
  // V2: when the employee has no RM, requireRm=false skips the RM stage and the
  // pair starts directly at RM_SUBMITTED (awaiting BH) with blank RM answers.
  requireRm = true,
  // With an RM but no BH, requireBh=false: the RM's submission moves the pair
  // straight past the BH stage. The caller guarantees RM or BH is present.
  requireBh = true,
  // Template flavour snapshot (STANDARD | FEEDBACK | OJT). FEEDBACK pairs are
  // employee-only and finalise right after the Self submission.
  templateType = 'STANDARD',
  // V2: post-BH commenter stages, snapshotted from the template by the caller.
  // Pass `{ active, name, email }` for each. Inactive stages are simply omitted.
  hrSpoc = null, hrHead = null, coto = null,
  // Copy of the template's questions + HR fields as they stand right now, so a
  // later template edit cannot change what this pair is being asked.
  templateSnapshot = null,
}) {
  // Build pairId: count existing pairs for this employee+role+cycle
  const existing = await prisma.assessmentPair.count({ where: { empCode, roleKey, cycle } });
  const seq = String(existing + 1).padStart(4, '0');
  const pairId = generatePairId(empCode, roleKey, cycle, seq);

  // Normalise reviewer emails on write. ReviewerLink emails are always stored
  // trim+lowercased; keeping the pair's copy in the same shape is what lets the
  // reviewer dashboard match a pair to its link.
  const normEmail = (e) => String(e || '').trim().toLowerCase();
  rmEmail = normEmail(rmEmail);
  bhEmail = normEmail(bhEmail);
  selfEmail = selfEmail ? normEmail(selfEmail) : selfEmail;

  // If self is required, the pair starts at PENDING_SELF and the next stage is
  // invited only after self submission. With no self, a pair with an RM starts
  // at PENDING_RM; a pair WITHOUT an RM (requireRm=false) skips straight to
  // RM_SUBMITTED so the existing BH-invite path picks it up with blank ratings.
  const initialStatus = requireSelf ? 'PENDING_SELF'
                      : !requireRm   ? 'RM_SUBMITTED'
                      :                'PENDING_RM';

  const requireHrSpoc = !!(hrSpoc && hrSpoc.active);
  const requireHrHead = !!(hrHead && hrHead.active);
  const requireCoto   = !!(coto   && coto.active);

  // Pre-create one HrReview row per ACTIVE commenter stage so the token exists
  // before any invite email is sent.
  const hrReviewCreates = [];
  if (requireHrSpoc) hrReviewCreates.push({ role: 'HR_SPOC', name: hrSpoc.name || null, email: hrSpoc.email || null });
  if (requireHrHead) hrReviewCreates.push({ role: 'HR_HEAD', name: hrHead.name || null, email: hrHead.email || null });
  if (requireCoto)   hrReviewCreates.push({ role: 'COTO',    name: coto.name   || null, email: coto.email   || null });

  return prisma.assessmentPair.create({
    data: {
      pairId, empCode, empName, roleKey, cycle,
      rmName, rmEmail, bhName, bhEmail,
      status: initialStatus,
      requireSelf,
      requireRm,
      requireBh,
      templateType,
      selfEmail: requireSelf ? selfEmail : null,
      selfName:  requireSelf ? selfName  : null,
      requireHrSpoc, requireHrHead, requireCoto,
      ...(templateSnapshot && { templateSnapshot }),
      selectedBy, selectedOn: new Date(),
      lastUpdatedBy: selectedBy, lastUpdatedOn: new Date(),
      startOn: startOn ? new Date(startOn) : null,
      ...(hrReviewCreates.length > 0 && { hrReviews: { create: hrReviewCreates } }),
    },
  });
}

// ── Reviewer Link (one dashboard link per role per roleKey+cycle) ──────────
// Roles: SELF | RM | BH | HR_SPOC | HR_HEAD | COTO.
const VALID_REVIEWER_ROLES = new Set(['SELF', 'RM', 'BH', 'HR_SPOC', 'HR_HEAD', 'COTO']);
export async function getOrCreateReviewerLink(email, role, roleKey, cycle) {
  const normEmail = String(email || '').trim().toLowerCase();
  const normRole  = VALID_REVIEWER_ROLES.has(role) ? role : 'RM';
  const existing = await prisma.reviewerLink.findUnique({
    where: { email_role_roleKey_cycle: { email: normEmail, role: normRole, roleKey, cycle } },
  });
  if (existing) return existing;
  return prisma.reviewerLink.create({
    data: { email: normEmail, role: normRole, roleKey, cycle },
  });
}

export async function getReviewerLinkByToken(token) {
  return prisma.reviewerLink.findUnique({ where: { token } });
}

// All pairs (with employee profileData) for a given reviewer+cycle.
// `status` filters the status: omit for all, 'PENDING_RM' for pending RM, etc.
// `role` is one of 'SELF' | 'RM' | 'BH' — selects which email column to match.
export async function getPairsForReviewer({ email, role, roleKey, cycle, status }) {
  const normEmail = String(email || '').trim().toLowerCase();

  // Match the reviewer email in JS rather than SQL. ReviewerLink emails are
  // always normalised (trim+lowercase), but pair emails came straight from the
  // uploaded Excel and may carry stray whitespace/case. A SQL `equals` (even
  // with mode:'insensitive') misses those, which made a genuinely-pending
  // assessment show as "All caught up" on the reviewer's dashboard. Filtering
  // here fixes already-launched pairs without a data migration; the row count
  // per (roleKey, cycle) is small.
  const pairs = await prisma.assessmentPair.findMany({
    where: {
      roleKey,
      cycle,
      isArchived: false,
      ...(role === 'SELF' ? { requireSelf: true } : {}),
      ...(status ? { status } : {}),
    },
    include: { employee: { select: { profileData: true } } },
    orderBy: { empName: 'asc' },
  });

  const emailOf = (p) =>
    role === 'SELF' ? p.selfEmail
    : role === 'BH' ? p.bhEmail
    : p.rmEmail;

  return pairs.filter((p) => String(emailOf(p) || '').trim().toLowerCase() === normEmail);
}

// Mark invitation emails as sent for a list of pairs (role = 'SELF' | 'RM' | 'BH')
export async function markInvited(pairIds, role) {
  const now = new Date();
  let data;
  if (role === 'SELF')      data = { selfInvitedOn: now };
  else if (role === 'BH')   data = { bhInvitedOn:   now };
  else                      data = { rmInvitedOn:   now };
  return prisma.assessmentPair.updateMany({ where: { pairId: { in: pairIds } }, data });
}

// Pairs that need a self-assessment invite (startOn reached OR null, status=PENDING_SELF, not yet invited)
export async function getPendingSelfInvites() {
  return prisma.assessmentPair.findMany({
    where: {
      status: 'PENDING_SELF',
      isArchived: false,
      requireSelf: true,
      selfInvitedOn: null,
      selfEmail: { not: null },
      role: { isActive: true }, // never invite for a soft-deleted template
      OR: [{ startOn: null }, { startOn: { lte: new Date() } }],
    },
    include: { employee: { select: { profileData: true } } },
    orderBy: [{ roleKey: 'asc' }, { cycle: 'asc' }, { selfEmail: 'asc' }],
  });
}

// Outstanding self-assessments for daily reminders
export async function getPendingRemindersForSelf() {
  return prisma.assessmentPair.findMany({
    where: {
      status: 'PENDING_SELF',
      isArchived: false,
      requireSelf: true,
      selfInvitedOn: { not: null },
      selfEmail: { not: null },
      role: { isActive: true },
    },
    include: { employee: { select: { profileData: true } } },
    orderBy: [{ roleKey: 'asc' }, { cycle: 'asc' }, { selfEmail: 'asc' }],
  });
}

// Pairs that need an RM invite (startOn reached OR null, RM not yet invited, status=PENDING_RM)
export async function getPendingRmInvites() {
  return prisma.assessmentPair.findMany({
    where: {
      status: 'PENDING_RM',
      isArchived: false,
      rmInvitedOn: null,
      role: { isActive: true },
      OR: [{ startOn: null }, { startOn: { lte: new Date() } }],
    },
    include: { employee: { select: { profileData: true } } },
    orderBy: [{ roleKey: 'asc' }, { cycle: 'asc' }, { rmEmail: 'asc' }],
  });
}

// Pairs that need a BH invite (RM submitted, BH not yet invited).
// The startOn gate is harmless for normal pairs (startOn is already past by the
// time the RM submits) but prevents an RM-less, future-dated pair — which is
// created directly at RM_SUBMITTED — from emailing BH before the cycle starts.
export async function getPendingBhInvites() {
  return prisma.assessmentPair.findMany({
    where: {
      status: 'RM_SUBMITTED',
      isArchived: false,
      requireBh: true,   // a pair without a BH never waits here, but never e-mail '' either
      bhInvitedOn: null,
      role: { isActive: true },
      OR: [{ startOn: null }, { startOn: { lte: new Date() } }],
    },
    include: { employee: { select: { profileData: true } } },
    orderBy: [{ roleKey: 'asc' }, { cycle: 'asc' }, { bhEmail: 'asc' }],
  });
}

// For daily reminders: all outstanding pairs (already invited, not yet submitted)
export async function getPendingRemindersForRm() {
  return prisma.assessmentPair.findMany({
    where: {
      status: 'PENDING_RM',
      isArchived: false,
      rmInvitedOn: { not: null },
      role: { isActive: true },
    },
    include: { employee: { select: { profileData: true } } },
    orderBy: [{ roleKey: 'asc' }, { cycle: 'asc' }, { rmEmail: 'asc' }],
  });
}

export async function getPendingRemindersForBh() {
  return prisma.assessmentPair.findMany({
    where: {
      status: 'RM_SUBMITTED',
      isArchived: false,
      requireBh: true,   // a pair without a BH never waits here, but never e-mail '' either
      bhInvitedOn: { not: null },
      role: { isActive: true },
    },
    include: { employee: { select: { profileData: true } } },
    orderBy: [{ roleKey: 'asc' }, { cycle: 'asc' }, { bhEmail: 'asc' }],
  });
}

// ── V2 HR commenter invite discovery ─────────────────────────────────────────
// Returns HrReview rows (with their parent pair + employee profile) for `role`
// that are READY to be invited: not yet invited, not yet submitted, an email
// present, the pair not archived, and every prior active stage complete.
// `alreadyInvited=true` flips it to the reminder set (invited but not submitted).
export async function getPendingHrInvitesByRole(role, { alreadyInvited = false } = {}) {
  const candidates = await prisma.hrReview.findMany({
    where: {
      role,
      submittedOn: null,
      email: { not: null },
      ...(alreadyInvited ? { invitedOn: { not: null } } : { invitedOn: null }),
      pair: { isArchived: false, role: { isActive: true } },
    },
    include: {
      pair: {
        include: {
          hrReviews: true,
          employee: { select: { profileData: true } },
        },
      },
    },
    orderBy: [{ email: 'asc' }],
  });
  // Filter to those whose prior active stages are all complete.
  return candidates.filter((c) => priorStagesComplete(c.pair, role));
}

export async function getPendingHrRemindersByRole(role) {
  return getPendingHrInvitesByRole(role, { alreadyInvited: true });
}

// Mark a set of HrReview rows as invited.
export async function markHrInvited(reviewIds) {
  if (!reviewIds || reviewIds.length === 0) return { count: 0 };
  return prisma.hrReview.updateMany({
    where: { id: { in: reviewIds } },
    data:  { invitedOn: new Date() },
  });
}

// Dashboard list for an HR commenter: every HrReview for (email, role) under
// this roleKey+cycle, split into pending (ready, not submitted) and done.
// Returns lightweight rows carrying the HrReview token for the form link.
export async function getHrReviewsForDashboard({ email, role, roleKey, cycle }) {
  const normEmail = String(email || '').trim().toLowerCase();
  const reviews = await prisma.hrReview.findMany({
    where: {
      role,
      email: { equals: normEmail, mode: 'insensitive' },
      pair: { roleKey, cycle, isArchived: false },
    },
    include: {
      pair: { include: { hrReviews: true, employee: { select: { profileData: true } } } },
    },
    orderBy: [{ createdAt: 'asc' }],
  });
  return reviews;
}

// ── Employee portal: everything waiting on one person ───────────────────────
// What hr.rdcc.ai/employees lists for somebody as pending in PARAKH: every
// form that is theirs to fill right now, in any role, across all templates and
// cycles. The rules are the ones the reminder e-mails above use (stage,
// archived, template switched off, start date), kept here beside them so the
// page and the e-mail cannot disagree. One difference, on purpose: it does not
// wait for the invite e-mail to have gone out, so a form shows up as soon as
// it is that person's turn.
//
// Returns flat rows: { role, pairId, empCode, empName, roleKey, cycle, token,
// since }. `token` is the form token for that role, the same one the reviewer
// dashboard links to.
export async function getPendingForEmail(email) {
  const norm = String(email || '').trim().toLowerCase();
  if (!norm) return [];

  // Addresses came from uploaded sheets and may carry stray spaces or capitals
  // (see getPairsForReviewer). SQL narrows with a loose match; `same` decides.
  const like = { contains: norm, mode: 'insensitive' };
  const same = (value) => String(value || '').trim().toLowerCase() === norm;
  const live = { isArchived: false, role: { isActive: true } };
  const started = { OR: [{ startOn: null }, { startOn: { lte: new Date() } }] };
  const order = [{ roleKey: 'asc' }, { cycle: 'asc' }, { empName: 'asc' }];

  const [selfPairs, rmPairs, bhPairs, reviews] = await Promise.all([
    prisma.assessmentPair.findMany({
      where: { ...live, ...started, status: 'PENDING_SELF', requireSelf: true, selfEmail: like },
      orderBy: order,
    }),
    prisma.assessmentPair.findMany({
      where: { ...live, ...started, status: 'PENDING_RM', rmEmail: like },
      orderBy: order,
    }),
    prisma.assessmentPair.findMany({
      where: { ...live, ...started, status: 'RM_SUBMITTED', requireBh: true, bhEmail: like },
      orderBy: order,
    }),
    prisma.hrReview.findMany({
      where: { submittedOn: null, email: like, role: { in: HR_ORDER }, pair: live },
      include: { pair: { include: { hrReviews: true } } },
      orderBy: [{ createdAt: 'asc' }],
    }),
  ]);

  const row = (role, pair, token, since) => ({
    role,
    pairId:  pair.pairId,
    empCode: pair.empCode,
    empName: pair.empName,
    roleKey: pair.roleKey,
    cycle:   pair.cycle,
    token,
    since:   since || pair.createdAt,
  });

  return [
    ...selfPairs.filter((p) => same(p.selfEmail) && p.selfToken)
      .map((p) => row('SELF', p, p.selfToken, p.selfInvitedOn)),
    ...rmPairs.filter((p) => same(p.rmEmail))
      .map((p) => row('RM', p, p.rmToken, p.rmInvitedOn || p.selfSubmittedOn)),
    ...bhPairs.filter((p) => same(p.bhEmail))
      .map((p) => row('BH', p, p.bhToken, p.bhInvitedOn || p.rmSubmittedOn)),
    ...reviews.filter((r) => same(r.email) && priorStagesComplete(r.pair, r.role))
      .map((r) => row(r.role, r.pair, r.token, r.invitedOn || r.pair.bhSubmittedOn || r.pair.rmSubmittedOn)),
  ];
}

// Self-assessment submit: status flips PENDING_SELF → next stage so the
// existing invite/cron path picks it up. Self does NOT lock the pair.
// With an RM the next stage is PENDING_RM; without one (requireRm=false) it
// skips straight to RM_SUBMITTED so the assessment routes to BH.
export async function submitSelfAnswers(pairId, answers, performedBy) {
  const pair = await prisma.assessmentPair.findUnique({
    where: { pairId },
    select: { requireRm: true, templateType: true },
  });
  // FEEDBACK templates are employee-only: the Self submission finalises the pair.
  // Otherwise the next stage is RM (or BH when there's no RM).
  const isFeedback = pair?.templateType === 'FEEDBACK';
  const nextStatus = isFeedback
    ? 'FINALIZED'
    : (pair?.requireRm === false ? 'RM_SUBMITTED' : 'PENDING_RM');
  return prisma.assessmentPair.update({
    where: { pairId },
    data: {
      selfAnswers:     answers,
      status:          nextStatus,
      ...(isFeedback ? { lockStatus: 'LOCKED' } : {}),
      selfSubmittedOn: new Date(),
      lastUpdatedBy:   performedBy,
      lastUpdatedOn:   new Date(),
    },
  });
}

// RM submit: normally the pair waits for BH (RM_SUBMITTED). Without a BH
// (requireBh=false) there is nobody to wait for, so it moves on exactly as a
// BH submission would — to the first commenter stage, or FINALIZED+LOCKED.
export async function submitRmAnswers(pairId, answers, performedBy) {
  const pair = await prisma.assessmentPair.findUnique({
    where: { pairId },
    select: { requireBh: true, requireHrSpoc: true, requireHrHead: true, requireCoto: true },
  });
  const next = pair?.requireBh === false
    ? nextStateAfter('BH', pair)
    : { status: 'RM_SUBMITTED', locked: false };
  return prisma.assessmentPair.update({
    where: { pairId },
    data: {
      rmAnswers:    answers,
      status:       next.status,
      ...(next.locked ? { lockStatus: 'LOCKED' } : {}),
      rmSubmittedOn: new Date(),
      lastUpdatedBy: performedBy,
      lastUpdatedOn: new Date(),
    },
  });
}

// BH submit: previously always FINALIZED+LOCKED. In V2 the next state depends
// on whether this pair has any active commenter stage (HR_SPOC/HR_HEAD/COTO).
export async function submitBhAnswers(pairId, answers, performedBy) {
  const pair = await prisma.assessmentPair.findUnique({
    where: { pairId },
    select: { requireHrSpoc: true, requireHrHead: true, requireCoto: true },
  });
  const { status, locked } = nextStateAfter('BH', pair || {});
  return prisma.assessmentPair.update({
    where: { pairId },
    data: {
      bhAnswers:    answers,
      status,
      ...(locked ? { lockStatus: 'LOCKED' } : {}),
      bhSubmittedOn: new Date(),
      lastUpdatedBy: performedBy,
      lastUpdatedOn: new Date(),
    },
  });
}

// V2: an HR commenter submits their fields. Advances the pair to the next
// commenter's _SUBMITTED marker, or FINALIZED+LOCKED if this is the last
// active stage. `role` is 'HR_SPOC' | 'HR_HEAD' | 'COTO'.
export async function submitHrReview(pairId, role, fields, performedBy) {
  const pair = await prisma.assessmentPair.findUnique({
    where:   { pairId },
    include: { hrReviews: true },
  });
  if (!pair) throw new Error('Pair not found');
  const { status, locked } = nextStateAfter(role, pair);

  // Two writes: fill the HrReview row, advance the pair. Keep them atomic.
  const [review] = await prisma.$transaction([
    prisma.hrReview.update({
      where: { pairId_role: { pairId, role } },
      data:  { fields, submittedOn: new Date() },
    }),
    prisma.assessmentPair.update({
      where: { pairId },
      data: {
        status,
        ...(locked ? { lockStatus: 'LOCKED' } : {}),
        lastUpdatedBy: performedBy,
        lastUpdatedOn: new Date(),
      },
    }),
  ]);
  return { review, status, locked };
}

export async function deletePair(pairId) {
  // HrReview and AuditLog both hold a foreign key to AssessmentPair.pairId, so
  // both must go first. HrReview was missed originally: it only has rows when
  // the template runs a post-BH commenter stage, so Delete failed on those
  // templates alone. See deleteEmployee for the same fix.
  const [, , pair] = await prisma.$transaction([
    prisma.hrReview.deleteMany({ where: { pairId } }),
    prisma.auditLog.deleteMany({ where: { pairId } }),
    prisma.assessmentPair.delete({ where: { pairId } }),
  ]);
  return pair;
}

export async function unlockPair(pairId, performedBy) {
  return prisma.assessmentPair.update({
    where: { pairId },
    data: {
      lockStatus:   'UNLOCKED',
      lastUpdatedBy: performedBy,
      lastUpdatedOn: new Date(),
    },
  });
}

// ── Dashboard stats ────────────────────────────────────────────────────────

export async function getDashboardStats(roleKey, cycle) {
  const where = { roleKey, cycle };
  const [
    total, pendingSelf, pendingRm, rmSubmitted, pendingBh,
    awaitingHrSpoc, awaitingHrHead, awaitingCoto, finalized,
  ] = await Promise.all([
    prisma.assessmentPair.count({ where }),
    prisma.assessmentPair.count({ where: { ...where, status: 'PENDING_SELF'      } }),
    prisma.assessmentPair.count({ where: { ...where, status: 'PENDING_RM'        } }),
    prisma.assessmentPair.count({ where: { ...where, status: 'RM_SUBMITTED'      } }),
    prisma.assessmentPair.count({ where: { ...where, status: 'PENDING_BH'        } }),
    prisma.assessmentPair.count({ where: { ...where, status: 'BH_SUBMITTED'      } }),
    prisma.assessmentPair.count({ where: { ...where, status: 'HR_SPOC_SUBMITTED' } }),
    prisma.assessmentPair.count({ where: { ...where, status: 'HR_HEAD_SUBMITTED' } }),
    prisma.assessmentPair.count({ where: { ...where, status: 'FINALIZED'         } }),
  ]);
  // awaitingHrSpoc = pairs at BH_SUBMITTED (BH done, waiting on HR_SPOC), etc.
  return {
    total, pendingSelf, pendingRm, rmSubmitted, pendingBh,
    awaitingHrSpoc, awaitingHrHead, awaitingCoto, finalized,
  };
}

export async function getRecentActivity(limit = 20) {
  return prisma.auditLog.findMany({
    orderBy: { timestamp: 'desc' },
    take:    limit,
  });
}

// ── Audit Log ──────────────────────────────────────────────────────────────

export async function appendAudit({ action, pairId, empCode, empName, roleKey, cycle, performedBy, details }) {
  return prisma.auditLog.create({
    data: { action, pairId, empCode, empName, roleKey, cycle, performedBy, details },
  });
}

export async function getAuditLog({ roleKey, cycle, limit = 100 } = {}) {
  return prisma.auditLog.findMany({
    where:   { ...(roleKey ? { roleKey } : {}), ...(cycle ? { cycle } : {}) },
    orderBy: { timestamp: 'desc' },
    take:    limit,
  });
}

// ── HR Users ───────────────────────────────────────────────────────────────

export async function getHrUserByEmail(email) {
  return prisma.hrUser.findUnique({ where: { email } });
}

export async function getAllHrUsers() {
  return prisma.hrUser.findMany({ orderBy: { createdAt: 'asc' } });
}

export async function createHrUser(email, name, role, hashedPassword) {
  return prisma.hrUser.create({ data: { email, name, role, password: hashedPassword } });
}

// ── Cycles list ────────────────────────────────────────────────────────────

export async function getCyclesByRole(roleKey) {
  const rows = await prisma.assessmentPair.findMany({
    where:  { roleKey },
    select: { cycle: true },
    distinct: ['cycle'],
    orderBy:  { cycle: 'desc' },
  });
  return rows.map((r) => r.cycle);
}
